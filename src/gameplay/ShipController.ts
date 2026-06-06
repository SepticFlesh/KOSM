import * as THREE from 'three';
import { FlightModel, FlightMode } from './FlightModel';
import { InputManager } from '../engine/InputManager';
import { WeaponSystem } from './WeaponSystem';
import { Controls } from '../config/controls';
import { gameState } from '../ui/store/gameStore';
import { soundManager } from '../audio/SoundManager';

/**
 * Контроллер корабля игрока.
 * Связывает ввод → лётную модель → 3D-меш.
 */
export class ShipController {
  private scene: THREE.Scene;
  public camera: THREE.Camera;
  public flightModel: FlightModel;
  private input: InputManager;

  // 3D-меш корабля
  private mesh: THREE.Group;
  private shipBody: THREE.Group;

  // Mining laser beam
  private mineBeam: THREE.Mesh | null = null;
  public mineBeamTarget: THREE.Vector3 | null = null;

  // Space dust around ship
  private spaceDust: THREE.Points | null = null;
  private dustLifetimes: Float32Array | null = null;
  private dustEnabled = true;
  private dustCount = 400;

  // Screen effects
  private shakeAmount = 0;

  // Engine particles
  private engineParticles: Array<{
    points: THREE.Points;
    nozzleLocal: THREE.Vector3;
    particles: Array<{ life: number; maxLife: number; vel: number }>;
  }> = [];
  private particleTexture: THREE.Texture | null = null;

  // Камера от третьего лица (сзади-сверху, не кувыркается)
  private cameraSmoothFactor = 75.0; // tighter follow, 5x closer
  private currentCameraPos = new THREE.Vector3();
  private currentCameraLook = new THREE.Vector3();

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;
    this.flightModel = new FlightModel();
    this.weaponSystem = new WeaponSystem(this.scene);

    // Создать визуальное представление корабля
    this.mesh = new THREE.Group();
    this.shipBody = this.createShipMesh();
    // ship stays at original scale
    this.mesh.add(this.shipBody);
    this.scene.add(this.mesh);

    // Габаритные PointLight прямо в сцене
    const navDefs = [
      { color: 0xff0000, intensity: 3, range: 6, pos: new THREE.Vector3(-3.2, -0.40, -0.8) },
      { color: 0x00ff00, intensity: 3, range: 6, pos: new THREE.Vector3( 3.2, -0.40, -0.8) },
    ];
    for (const d of navDefs) {
      const pl = new THREE.PointLight(d.color, d.intensity, d.range);
      pl.position.copy(d.pos);
      this.scene.add(pl);
      this.navPointLights.push({ light: pl, localPos: d.pos.clone() });
    }

    // Подсветка сопел изнутри (зависит от скорости)
    const glowDefs = [
      { color: 0xff6600, localPos: new THREE.Vector3(1.1, -0.40, -1.74), range: 3.0 },  // правый
      { color: 0xff6600, localPos: new THREE.Vector3(-1.1, -0.40, -1.74), range: 3.0 }, // левый
      { color: 0x4488ff, localPos: new THREE.Vector3(0, 0, -2.25), range: 0.6 },         // центр
    ];
    for (const gd of glowDefs) {
      const light = new THREE.PointLight(gd.color, 0.05, gd.range);
      light.position.copy(gd.localPos);
      this.scene.add(light);
      this.engineGlowLights.push({ light, localPos: gd.localPos.clone() });
    }

    // Система частиц для трёх двигателей
    this.initEngineParticles();
    // Космическая пыль
    this.initSpaceDust();

    // Mining beam — outer glow + inner core
    const beamOuterGeo = new THREE.CylinderGeometry(0.15, 0.15, 1, 8);
    beamOuterGeo.translate(0, 0.5, 0);
    const beamOuterMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66, transparent: true, opacity: 0.25, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const beamOuter = new THREE.Mesh(beamOuterGeo, beamOuterMat);
    beamOuter.visible = false;
    this.scene.add(beamOuter);

    const beamCoreGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 8);
    beamCoreGeo.translate(0, 0.5, 0);
    const beamCoreMat = new THREE.MeshBasicMaterial({
      color: 0x88ffcc, transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mineBeam = new THREE.Mesh(beamCoreGeo, beamCoreMat);
    this.mineBeam.visible = false;
    this.scene.add(this.mineBeam);
    // Store outer beam reference
    (this.mineBeam as any)._outerBeam = beamOuter;

    // Начальная позиция камеры (сверху-сзади)
    this.currentCameraPos.copy(this.flightModel.state.position)
      .add(new THREE.Vector3(0, 3, -6));
    this.currentCameraLook.copy(this.flightModel.state.position)
      .add(new THREE.Vector3(0, 0, 6));

    // Получаем ссылку на InputManager (будет установлена позже)
    this.input = null!;
  }

  /**
   * Цельный истребитель — одно слитное тело + крылья из единой геометрии.
   * Строится по поперечным сечениям вдоль оси Z.
   */
  private createShipMesh(): THREE.Group {
    const group = new THREE.Group();

    // ── Материалы ──
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x505560, roughness: 0.3, metalness: 0.85, flatShading: false,
    });
    // Для двигателей — DoubleSide чтобы внутренние стенки были видны
    const engineMat = new THREE.MeshStandardMaterial({
      color: 0x3a3d44, roughness: 0.4, metalness: 0.9, side: THREE.DoubleSide,
    });
    // ── ЕДИНЫЙ корпус: построение по сечениям (loft) ──
    const bodyGroup = new THREE.Group();

    // Профили сечений: на каждом Z задаём массив точек (x,y) полу-сечения,
    // зеркально отобразим для левой стороны.
    // Каждое сечение: [ширина_фюзеляжа, высота_фюзеляжа, размах_крыла, высота_крыла_на_законцовке, Y_законцовки]
    const sections = [
      { z: 2.5,  bodyW: 0.00, bodyH: 0.00, wingSpan: 0.0, wingTipY: 0.0, wingTipH: 0.0 },  // нос
      { z: 2.0,  bodyW: 0.03, bodyH: 0.02, wingSpan: 0.3, wingTipY: 0.0, wingTipH: 0.02 },
      { z: 1.0,  bodyW: 0.06, bodyH: 0.03, wingSpan: 1.2, wingTipY: -0.05, wingTipH: 0.03 },
      { z: 0.0,  bodyW: 0.08, bodyH: 0.03, wingSpan: 2.4, wingTipY: -0.15, wingTipH: 0.03 },
      { z: -0.8, bodyW: 0.08, bodyH: 0.03, wingSpan: 3.2, wingTipY: -0.40, wingTipH: 0.03 },
      { z: -1.5, bodyW: 0.06, bodyH: 0.03, wingSpan: 2.5, wingTipY: -0.55, wingTipH: 0.02 },
      { z: -2.0, bodyW: 0.03, bodyH: 0.02, wingSpan: 0.5, wingTipY: -0.2, wingTipH: 0.02 },
    ];

    // Фиксированный набор: правая половина 12 точек (0..11) +
    // зеркало 10 точек (10..1) = 22 вершины на кольцо
    const RING_SIZE = 22;

    const allVerts: number[] = [];
    const allIndices: number[] = [];
    let vertOffset = 0;

    for (let si = 0; si < sections.length; si++) {
      const s = sections[si];
      const hasWings = s.wingSpan > 0.01;

      // Правая половина — всегда 12 точек
      const rightHalf: Array<{ x: number; y: number }> = [];

      // 0: верх фюзеляжа
      rightHalf.push({ x: 0, y: s.bodyH });
      // 1-5: бок фюзеляжа
      rightHalf.push({ x: s.bodyW * 0.6, y: s.bodyH * 0.8 });
      rightHalf.push({ x: s.bodyW * 0.9, y: s.bodyH * 0.4 });
      rightHalf.push({ x: s.bodyW, y: 0 });
      rightHalf.push({ x: s.bodyW * 0.9, y: -s.bodyH * 0.4 });
      rightHalf.push({ x: s.bodyW * 0.6, y: -s.bodyH * 0.8 });
      // 6-10: крыло (или край фюзеляжа если нет крыльев)
      rightHalf.push({ x: hasWings ? s.wingSpan * 0.3 : s.bodyW, y: hasWings ? s.wingTipY * 0.3 + s.wingTipH : s.bodyH * 0.5 });
      rightHalf.push({ x: hasWings ? s.wingSpan * 0.6 : s.bodyW, y: hasWings ? s.wingTipY * 0.6 + s.wingTipH * 0.6 : s.bodyH * 0.2 });
      rightHalf.push({ x: hasWings ? s.wingSpan : s.bodyW, y: hasWings ? s.wingTipY + s.wingTipH * 0.2 : 0 });
      rightHalf.push({ x: hasWings ? s.wingSpan : s.bodyW, y: hasWings ? s.wingTipY - s.wingTipH * 0.2 : 0 });
      rightHalf.push({ x: hasWings ? s.wingSpan * 0.6 : s.bodyW, y: hasWings ? s.wingTipY * 0.6 - s.wingTipH * 0.6 : -s.bodyH * 0.2 });
      rightHalf.push({ x: hasWings ? s.wingSpan * 0.3 : s.bodyW, y: hasWings ? s.wingTipY * 0.3 - s.wingTipH : -s.bodyH * 0.5 });
      // 11: низ фюзеляжа
      rightHalf.push({ x: 0, y: -s.bodyH });

      // Полное кольцо: правая половина + зеркальная левая
      // Порядок важен для симметрии: крылья идут тело→середина→законцовка→тело
      const ringVerts: Array<{ x: number; y: number }> = [...rightHalf];
      // Левая сторона: крыло тело→законцовка (6→10), потом бок фюзеляжа снизу вверх (5→1)
      const leftOrder = [6, 7, 8, 9, 10, 5, 4, 3, 2, 1];
      for (const i of leftOrder) {
        ringVerts.push({ x: -rightHalf[i].x, y: rightHalf[i].y });
      }

      // Добавляем вершины
      for (const v of ringVerts) {
        allVerts.push(v.x, v.y, s.z);
      }

      // Индексы треугольников между этим и предыдущим кольцом
      if (si > 0) {
        const prevStart = vertOffset - RING_SIZE;
        const currStart = vertOffset;
        for (let i = 0; i < RING_SIZE; i++) {
          const next = (i + 1) % RING_SIZE;
          allIndices.push(prevStart + i, currStart + i, currStart + next);
          allIndices.push(prevStart + i, currStart + next, prevStart + next);
        }
      }

      vertOffset += RING_SIZE;
    }

    // Заглушка хвоста
    const tailCenterIdx = vertOffset;
    const tailZ = sections[sections.length - 1].z;
    allVerts.push(0, 0, tailZ - 0.15);
    const lastRingStart = vertOffset - RING_SIZE;
    for (let i = 0; i < RING_SIZE; i++) {
      const next = (i + 1) % RING_SIZE;
      allIndices.push(lastRingStart + i, tailCenterIdx, lastRingStart + next);
    }
    vertOffset++;

    const bodyGeo = new THREE.BufferGeometry();
    bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(allVerts, 3));
    bodyGeo.setIndex(allIndices);
    bodyGeo.computeVertexNormals();
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyGroup.add(bodyMesh);

    // ── Фюзеляж: каплевидный, отдельный меш поверх крыльев ──
    const fuselageProfile: THREE.Vector2[] = [];
    // Профиль от носа к хвосту (Z, радиус)
    fuselageProfile.push(new THREE.Vector2(0.00, 2.5));  // остриё носа
    fuselageProfile.push(new THREE.Vector2(0.06, 2.2));
    fuselageProfile.push(new THREE.Vector2(0.14, 1.5));
    fuselageProfile.push(new THREE.Vector2(0.22, 0.8));
    fuselageProfile.push(new THREE.Vector2(0.28, 0.0));  // широкая часть
    fuselageProfile.push(new THREE.Vector2(0.28, -0.5));
    fuselageProfile.push(new THREE.Vector2(0.24, -1.2));
    fuselageProfile.push(new THREE.Vector2(0.16, -1.8));
    fuselageProfile.push(new THREE.Vector2(0.08, -1.9)); // срез перед центральным двигателем
    const fuselageGeo = new THREE.LatheGeometry(fuselageProfile, 24);
    const fuselageMat = new THREE.MeshStandardMaterial({
      color: 0x606570, roughness: 0.25, metalness: 0.8,
      side: THREE.DoubleSide,
    });
    const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.position.y = 0.05; // чуть над крылом
    bodyGroup.add(fuselage);

    // ── Двигатели прижаты к крыльям (сзади, под нижней поверхностью) ──
    const engX = 1.1;   // под серединой крыла
    const engY = -0.40; // вплотную к крылу
    const engZ = -1.5;  // за крылом

    // Гондолы двигателей — полые цилиндры (LatheGeometry, стенка 1/10 диаметра)
    const engLen = 1.0;
    const engR1 = 0.10; // радиус на входе
    const engR2 = 0.13; // радиус на выходе
    const engT1 = engR1 * 0.8; // внутренний радиус (стенка = диаметр/10 = радиус/5)
    const engT2 = engR2 * 0.8;
    const engineGeo = this.makeHollowCylinder(engR1, engR2, engT1, engT2, engLen, 24);
    const engRight = new THREE.Mesh(engineGeo, engineMat);
    engRight.rotation.x = Math.PI / 2;
    engRight.position.set(engX, engY, engZ);
    bodyGroup.add(engRight);
    const engLeft = new THREE.Mesh(engineGeo, engineMat);
    engLeft.rotation.x = Math.PI / 2;
    engLeft.position.set(-engX, engY, engZ);
    bodyGroup.add(engLeft);

    // ── Центральный двигатель ──
    const cLen = 0.7;
    const cR1 = 0.16;
    const cR2 = 0.20;
    const cT1 = cR1 * 0.8;
    const cT2 = cR2 * 0.8;
    const centerEngineGeo = this.makeHollowCylinder(cR1, cR2, cT1, cT2, cLen, 24);
    const centerEngine = new THREE.Mesh(centerEngineGeo, engineMat);
    centerEngine.rotation.x = Math.PI / 2;
    centerEngine.position.set(0, 0, -2.3);
    bodyGroup.add(centerEngine);

    group.add(bodyGroup);
    return group;
  }

  /**
   * Привязать систему ввода
   */
  attachInput(input: InputManager): void {
    this.input = input;
  }

  /**
   * Главное обновление
   */
  /** Trigger screen shake (called externally when damaged) */
  public addShake(amount: number) { this.shakeAmount = Math.max(this.shakeAmount, amount); }

  /** Update only mesh + camera (no input/physics) — for warp transition */
  updateMeshOnly(_dt: number): void {
    this.updateMesh();
    // Snap camera close to ship during high-speed warp
    this.camera.position.copy(this.flightModel.state.position)
      .add(new THREE.Vector3(0, 3, -6));
    this.camera.lookAt(this.flightModel.state.position.clone().add(new THREE.Vector3(0, 0, 10)));
  }

  resetWarpGlow(): void {}

  update(dt: number, _elapsed: number): void {
    if (!this.input) return;
    // Apply engine upgrade
    const engLvl = gameState.getUpgradeLevel('engine');
    const speedMul = [1, 1.33, 1.83, 2.5][engLvl - 1] || 1;
    this.flightModel.config.maxSpeedAssist = 30 * speedMul;
    this.flightModel.config.maxSpeedCruise = 200 * speedMul;

    // Shake decay
    if (this.shakeAmount > 0.001) this.shakeAmount *= Math.exp(-dt * 8);

    this.processInput(dt);
    this.flightModel.simulate(dt);
    this.updateMesh();
    this.updateCamera(dt);
    this.updateEngineEffects(dt);
    this.updateNavPointLights();
    this.updateEngineGlowLights();
    this.updateEngineParticles(dt);
    this.updateSpaceDust(dt);
    this.updateMineBeam();
    this.weaponSystem.update(dt);
  }

  /** Подсветка сопел изнутри — яркость зависит от скорости */
  private updateEngineGlowLights(): void {
    const speed = this.flightModel.state.velocity.length();
    const minGlow = 0.05;
    const maxGlow = 6.0;
    const glowSpeed = 80; // скорость полного разгорания
    const intensity = minGlow + (maxGlow - minGlow) * Math.min(speed / glowSpeed, 1.0);

    const pos = this.flightModel.state.position;
    const quat = this.flightModel.state.orientation;
    for (const gl of this.engineGlowLights) {
      gl.light.intensity = intensity;
      gl.light.position.copy(gl.localPos).applyQuaternion(quat).add(pos);
    }
  }

  /** Позиции PointLight следят за кораблём и мигают */
  private updateNavPointLights(): void {
    const pos = this.flightModel.state.position;
    const quat = this.flightModel.state.orientation;
    const t = this.navBlinkTimer;
    for (let i = 0; i < this.navPointLights.length; i++) {
      const nl = this.navPointLights[i];
      nl.light.position.copy(nl.localPos).applyQuaternion(quat).add(pos);
      // красный/зелёный — двойная вспышка
      const phase = Math.sin(t * Math.PI * 3);
      nl.light.intensity = phase > 0.5 ? 3 : 0.15;
    }
  }

  /**
   * Обработка ввода:
   *   Мышь X→Yaw, Y→Pitch
   *   W/S → Pitch (нос вверх/вниз)
   *   A/D → Yaw (поворот влево/вправо)
   *   R/F → Pitch (сильный, космос вертикально)
   *   Q/E → Roll (крен)
   *   Shift/Ctrl → вертикальная тяга
   *   Tab → газ 100%/0%, ↑↓ → газ плавно, колёсико → точно
   *   Space → форсаж, 1/2/3 → режим
   */
  /** Проверить, нажата ли любая клавиша из списка */
  private anyKey(codes: readonly string[]): boolean {
    return codes.some(c => this.input.isKeyDown(c));
  }
  private anyKeyJustPressed(codes: readonly string[]): boolean {
    return codes.some(c => this.input.isKeyJustPressed(c));
  }

  public inputEnabled = true;

  public mobileMode = false;

  private processInput(dt: number): void {
    if (!this.inputEnabled) return;
    const fm = this.flightModel;
    const inp = this.input;
    const C = Controls;
    // On mobile, always allow input (no pointer lock needed)
    if (this.mobileMode && !inp.isPointerLockedState()) {
      (inp as any).isPointerLockedState = () => true;
    }

    // ── Тяга ──
    const vertUp = this.anyKey(C.verticalUp);
    const vertDown = this.anyKey(C.verticalDown);
    fm.setThrust(new THREE.Vector3(0, (vertUp ? 0.3 : 0) - (vertDown ? 0.3 : 0), 0));

    // ── Вращение ──
    const mouse = inp.getMouseDelta();
    // Mouse only when pointer locked
    const mouseActive = inp.isPointerLockedState();
    // Mouse or touch rotation
    const touchDX = this.getTouchDX ? this.getTouchDX() : 0;
    const touchDY = this.getTouchDY ? this.getTouchDY() : 0;
    const useMouse = mouseActive || touchDX !== 0 || touchDY !== 0;
    let pitchInput = useMouse ? (mouseActive ? mouse.y : touchDY) * -C.mouseSensitivity : 0;
    let yawInput = useMouse ? (mouseActive ? mouse.x : touchDX) * C.mouseSensitivity : 0;

    if (this.anyKey(C.pitchUp)) pitchInput += 1;
    if (this.anyKey(C.pitchDown)) pitchInput -= 1;
    if (this.anyKey(C.pitchUpStrong)) pitchInput += 2.5;
    if (this.anyKey(C.pitchDownStrong)) pitchInput -= 2.5;
    if (this.anyKey(C.yawLeft)) yawInput += 1;
    if (this.anyKey(C.yawRight)) yawInput -= 1;
    let rollInput = (this.anyKey(C.rollRight) ? 1 : 0) - (this.anyKey(C.rollLeft) ? 1 : 0);

    // ── Комбинации стрелок ──
    const ac = C.arrowCombos;
    if (ac.enabled) {
      const L = inp.isKeyDown('ArrowLeft'), R = inp.isKeyDown('ArrowRight');
      const U = inp.isKeyDown('ArrowUp'), D = inp.isKeyDown('ArrowDown');
      const match = (c: { left?: boolean; right?: boolean; up?: boolean; down?: boolean }) =>
        (c.left ? L : !L) && (c.right ? R : !R) && (c.up ? U : !U) && (c.down ? D : !D);
      if (match(ac.pitchUp)) pitchInput += 1;
      if (match(ac.pitchDown)) pitchInput -= 1;
      if (match(ac.rollLeft)) rollInput += 1;
      if (match(ac.rollRight)) rollInput -= 1;
      if (match(ac.yawLeft)) yawInput += 1;
      if (match(ac.yawRight)) yawInput -= 1;
      const ac2 = ac as any;
      if (ac2.throttleUp && match(ac2.throttleUp)) fm.setThrottle(Math.min(1, fm.state.throttle + 0.25 * dt));
      if (ac2.throttleDown && match(ac2.throttleDown)) fm.setThrottle(Math.max(0, fm.state.throttle - 0.25 * dt));
    }

    // ── Автонаведение + доворот прицела ──
    const targeting = this.anyKey(C.targetLock);
    if (targeting && this.getNearestEnemy) {
      if (!this.wasXPressed) {
        const nearest = this.getNearestEnemy();
        if (nearest) { this.lockedEnemyId = nearest.id; this.aimOffset.set(0, 0, 0); }
      }
      // WASD/arrows shift aim point (inverted)
      const aimSpd = 15 * dt;
      if (inp.isKeyDown('KeyW')) this.aimOffset.y -= aimSpd;
      if (inp.isKeyDown('KeyS')) this.aimOffset.y += aimSpd;
      if (inp.isKeyDown('KeyA')) this.aimOffset.x += aimSpd;
      if (inp.isKeyDown('KeyD')) this.aimOffset.x -= aimSpd;
      if (inp.isKeyDown('ArrowUp')) this.aimOffset.y -= aimSpd;
      if (inp.isKeyDown('ArrowDown')) this.aimOffset.y += aimSpd;
      if (inp.isKeyDown('ArrowLeft')) this.aimOffset.x += aimSpd;
      if (inp.isKeyDown('ArrowRight')) this.aimOffset.x -= aimSpd;

      if (this.lockedEnemyId !== null && this.getEnemyById) {
        const tp = this.getEnemyById(this.lockedEnemyId);
        this.targetDistance = tp ? tp.distanceTo(fm.state.position) : 0;
        if (tp) {
          const up = new THREE.Vector3(0,1,0).applyQuaternion(fm.state.orientation);
          const right = new THREE.Vector3(1,0,0).applyQuaternion(fm.state.orientation);
          // Apply aim offset in world space
          const adjTarget = tp.clone()
            .add(right.clone().multiplyScalar(this.aimOffset.x))
            .add(up.clone().multiplyScalar(this.aimOffset.y));
          const to = adjTarget.clone().sub(fm.state.position).normalize();
          const fwd = new THREE.Vector3(0,0,1).applyQuaternion(fm.state.orientation);
          const cross = new THREE.Vector3().crossVectors(to, fwd);
          pitchInput = Math.max(-1, Math.min(1, -cross.dot(right) * 2));
          yawInput = Math.max(-1, Math.min(1, -cross.dot(up) * 2));
          rollInput = 0;
        } else { this.lockedEnemyId = null; this.aimOffset.set(0, 0, 0); }
      }
    } else if (!targeting) {
      this.lockedEnemyId = null;
      this.targetDistance = 0;
      this.aimOffset.set(0, 0, 0);
    }
    this.wasXPressed = targeting;

    fm.setTorque(new THREE.Vector3(pitchInput, yawInput, rollInput));

    // ── Режим полёта ──
    if (this.anyKeyJustPressed(C.modeRealistic)) fm.setMode(FlightMode.Realistic);
    if (this.anyKeyJustPressed(C.modeAssist)) fm.setMode(FlightMode.FlightAssist);
    if (this.anyKeyJustPressed(C.modeCruise)) fm.setMode(FlightMode.Cruise);

    // ── Газ ──
    if (this.anyKeyJustPressed(C.throttleFull)) {
      fm.setThrottle(fm.state.throttle > 0.5 ? 0 : 1);
    }
    const tUp = this.anyKey(C.throttleUp);
    const tDown = this.anyKey(C.throttleDown);
    if (this.anyKeyJustPressed(C.throttleUp)) fm.setThrottle(Math.min(1, fm.state.throttle + 0.05));
    if (this.anyKeyJustPressed(C.throttleDown)) fm.setThrottle(Math.max(0, fm.state.throttle - 0.05));
    if (tUp) fm.setThrottle(Math.min(1, fm.state.throttle + 0.25 * dt));
    if (tDown) fm.setThrottle(Math.max(0, fm.state.throttle - 0.25 * dt));
    // Touch throttle
    const touchThr = this.getTouchThrottle;
    if (touchThr) fm.setThrottle(touchThr());

    const wheel = inp.getMouseWheel();
    if (wheel !== 0) fm.setThrottle(Math.max(0, Math.min(1, fm.state.throttle - wheel * C.throttleWheelSpeed)));

    // ── Форсаж ──
    const touchBoost = this.getTouchBoost ? this.getTouchBoost() : false;
    fm.setBoost(this.anyKey(C.boost) || touchBoost);

    // ── Огонь ──
    const touchFiring = this.getTouchFiring ? this.getTouchFiring() : false;
    if ((C.fireMouse >= 0 && inp.isPointerLockedState() && inp.isMouseDown(C.fireMouse)) || this.anyKey(C.fire) || touchFiring) {
      this.weaponSystem.fire(fm.state.position, fm.state.orientation);
    }

    // ── Торговля ──
    if (inp.isKeyJustPressed('KeyT') && this.onTradeRequest) {
      this.onTradeRequest();
    }

    // ── FTL-прыжок ──
    if (inp.isKeyJustPressed('KeyJ') && fm.state.mode === FlightMode.Cruise && this.onJumpRequest) {
      this.onJumpRequest();
    }

    // ── Добыча (M) ──
    if (inp.isKeyDown('KeyM') && this.onMineRequest) {
      this.onMineRequest();
    } else {
      this.mineBeamTarget = null;
    }

    // ── Музыка (N) ──
    if (inp.isKeyJustPressed('KeyN')) {
      soundManager.toggleMusic?.();
    }

    // ── Пыль (B) ──
    if (inp.isKeyJustPressed('KeyB')) {
      this.dustEnabled = !this.dustEnabled;
    }

    // ── Карта системы (O) ──
    if (inp.isKeyJustPressed('KeyO')) {
      gameState.toggleMap();
    }
  }

  /**
   * Обновить позицию и ориентацию 3D-меша
   */
  private updateMesh(): void {
    const state = this.flightModel.state;
    this.mesh.position.copy(state.position);
    this.mesh.quaternion.copy(state.orientation);
  }

  /**
   * Камера жёстко сверху-сзади. Следит только за горизонтальным поворотом (yaw),
   * игнорирует pitch/roll — корабль под камерой кувыркается, камера стабильна.
   */
  /**
   * Камера привязана к кораблю как вид из кабины, но сзади-сверху.
   * Следует за pitch и yaw корабля, roll ограничен чтобы не переворачиваться.
   */
  private updateCamera(dt: number): void {
    const state = this.flightModel.state;
    const forward = this.flightModel.getForward();
    const pos = state.position;

    // Позиция: сзади(-Z) + сверху(+Y), повёрнуто ориентацией корабля
    const localOffset = new THREE.Vector3(0, 3, -6);
    localOffset.applyQuaternion(state.orientation);
    const idealPos = pos.clone().add(localOffset);

    // Взгляд по курсу
    const idealLook = pos.clone().add(forward.clone().multiplyScalar(10));

    // Сглаживание
    const t = 1 - Math.exp(-this.cameraSmoothFactor * dt);
    this.currentCameraPos.lerp(idealPos, t);
    this.currentCameraLook.lerp(idealLook, t);

    this.camera.position.copy(this.currentCameraPos);
    if (this.shakeAmount > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmount * 2;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmount * 2;
    }
    this.camera.up.copy(this.flightModel.getUp());
    this.camera.lookAt(this.currentCameraLook);
  }

  /**
   * Визуальные эффекты: пульсация двигателей и мигание габаритных огней.
   */
  private navBlinkTimer = 0;
  private navPointLights: Array<{ light: THREE.PointLight; localPos: THREE.Vector3 }> = [];
  // Оружие
  public weaponSystem: WeaponSystem;

  // Автонаведение и торговля: колбэки
  public getNearestEnemy: (() => { pos: THREE.Vector3; id: number } | null) | null = null;
  public getEnemyById: ((id: number) => THREE.Vector3 | null) | null = null;
  public onTradeRequest: (() => void) | null = null;
  public onJumpRequest: (() => void) | null = null;
  public onMineRequest: (() => void) | null = null;

  // Touch control interface (set by GameCanvas)
  getTouchThrottle?: () => number;
  getTouchFiring?: () => boolean;
  getTouchDX?: () => number;
  getTouchDY?: () => number;
  getTouchBoost?: () => boolean;
  private lockedEnemyId: number | null = null;
  private wasXPressed = false;
  public targetDistance = 0;
  public targetHealth = 0;
  private aimOffset = new THREE.Vector3();

  // Подсветка внутри сопел — зависит от скорости
  private engineGlowLights: Array<{ light: THREE.PointLight; localPos: THREE.Vector3 }> = [];
  private updateEngineEffects(dt: number): void {
    this.navBlinkTimer += dt;
  }

  /** Полый цилиндр-сопло через LatheGeometry (стенка заданной толщины) */
  private makeHollowCylinder(rTop: number, rBot: number, irTop: number, irBot: number, length: number, segs: number): THREE.LatheGeometry {
    const half = length / 2;
    // Профиль стенки: 4 точки — внешняя поверхность + внутренняя
    const profile: THREE.Vector2[] = [
      new THREE.Vector2(irBot, -half),  // внутр низ
      new THREE.Vector2(rBot, -half),   // внешн низ
      new THREE.Vector2(rTop, half),    // внешн верх
      new THREE.Vector2(irTop, half),   // внутр верх
    ];
    return new THREE.LatheGeometry(profile, segs);
  }

  /** Создать текстуру и Points для частиц двигателей */
  private initEngineParticles(): void {
    // Процедурная текстура: круглое свечение
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,200,50,1)');
    gradient.addColorStop(0.2, 'rgba(255,120,20,0.8)');
    gradient.addColorStop(0.5, 'rgba(255,60,5,0.3)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    this.particleTexture = new THREE.CanvasTexture(canvas);
    this.particleTexture.needsUpdate = true;

    // Позиции сопел (в локальных координатах корабля)
    const nozzleDefs = [
      { pos: new THREE.Vector3(1.1, -0.40, -2.15), size: 0.25, isCentral: false },
      { pos: new THREE.Vector3(-1.1, -0.40, -2.15), size: 0.25, isCentral: false },
      { pos: new THREE.Vector3(0, 0, -2.65), size: 0.5, isCentral: true },
    ];
    const particlesPerEngine = 60;

    for (const def of nozzleDefs) {
      const geo = new THREE.BufferGeometry();
      const count = particlesPerEngine;
      const positionsArr = new Float32Array(count * 3);
      const colorsArr = new Float32Array(count * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3));

      const mat = new THREE.PointsMaterial({
        size: def.size,
        map: this.particleTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexColors: true,
        transparent: true,
      });

      const points = new THREE.Points(geo, mat);
      this.mesh.add(points);

      const particles: Array<{ life: number; maxLife: number; vel: number }> = [];
      for (let i = 0; i < count; i++) {
        particles.push({ life: 0, maxLife: 0, vel: 0 });
      }

      this.engineParticles.push({
        points, nozzleLocal: def.pos, particles,
        isCentral: def.isCentral,
      } as any);
    }
  }

  /** Инициализация космической пыли */
  private initSpaceDust(): void {
    const N = this.dustCount;
    const pArr = new Float32Array(N * 3);
    const cArr = new Float32Array(N * 3);
    this.dustLifetimes = new Float32Array(N);

    const sp = this.flightModel.state.position;
    for (let i = 0; i < N; i++) {
      const r = 10 + Math.random() * 60;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pArr[i*3] = sp.x + Math.sin(ph) * Math.cos(th) * r;
      pArr[i*3+1] = sp.y + Math.sin(ph) * Math.sin(th) * r;
      pArr[i*3+2] = sp.z + Math.cos(ph) * r;
      cArr[i*3] = 0.4 + Math.random() * 0.6;
      cArr[i*3+1] = 0.5 + Math.random() * 0.5;
      cArr[i*3+2] = 0.7 + Math.random() * 0.3;
      this.dustLifetimes[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cArr, 3));

    const sc = 16; const cv = document.createElement('canvas');
    cv.width = sc; cv.height = sc;
    const cx2 = cv.getContext('2d')!;
    const grd = cx2.createRadialGradient(sc/2,sc/2,0,sc/2,sc/2,sc/2);
    grd.addColorStop(0,'rgba(255,255,255,1)');
    grd.addColorStop(0.3,'rgba(180,210,255,0.6)');
    grd.addColorStop(1,'rgba(0,0,0,0)');
    cx2.fillStyle = grd; cx2.fillRect(0,0,sc,sc);

    const mat = new THREE.PointsMaterial({
      size: 0.5, map: new THREE.CanvasTexture(cv),
      blending: THREE.AdditiveBlending, depthWrite: false,
      vertexColors: true, transparent: true, opacity: 0.6,
    });
    this.spaceDust = new THREE.Points(geo, mat);
    this.spaceDust.frustumCulled = false;
    this.scene.add(this.spaceDust); // WORLD space — stays put when ship rotates
  }

  /** Обновление космической пыли — поток от скорости */
  private updateSpaceDust(dt: number): void {
    if (!this.spaceDust || !this.dustLifetimes) return;
    const posArr = this.spaceDust.geometry.attributes.position.array as Float32Array;
    const vel = this.flightModel.state.velocity;
    const speed = vel.length();
    const N = this.dustCount;
    const shipPos = this.flightModel.state.position;
    // Dust drifts with ship: normally 0%, during boost 80% of ship velocity
    const driftFrac = this.flightModel.boostActive ? 0.875 : 0.0;
    for (let i = 0; i < N; i++) {
      this.dustLifetimes[i] -= dt * 0.1;
      // Move dust with ship (reduces apparent streaming)
      posArr[i*3] += vel.x * driftFrac * dt;
      posArr[i*3+1] += vel.y * driftFrac * dt;
      posArr[i*3+2] += vel.z * driftFrac * dt;
      const dx = posArr[i*3] - shipPos.x;
      const dy = posArr[i*3+1] - shipPos.y;
      const dz = posArr[i*3+2] - shipPos.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (dist > 80 || this.dustLifetimes[i] <= 0) {
        const r = 10 + Math.random() * 60;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        posArr[i*3] = shipPos.x + Math.sin(ph) * Math.cos(th) * r;
        posArr[i*3+1] = shipPos.y + Math.sin(ph) * Math.sin(th) * r;
        posArr[i*3+2] = shipPos.z + Math.cos(ph) * r;
        this.dustLifetimes[i] = 5 + Math.random() * 7;
      }
    }
    this.spaceDust.geometry.attributes.position.needsUpdate = true;
    this.spaceDust.visible = this.dustEnabled;
    let dustOpacity = 0;
    if (speed <= 5) {
      dustOpacity = 0;
    } else if (speed <= 30) {
      dustOpacity = 0 + (speed - 5) / 25 * 0.7;
    } else {
      dustOpacity = 1.0;
    }
    (this.spaceDust.material as THREE.PointsMaterial).opacity = this.dustEnabled ? dustOpacity : 0;
  }

  private updateMineBeam(): void {
    if (!this.mineBeam) return;
    const outerBeam = (this.mineBeam as any)._outerBeam as THREE.Mesh;
    const target = this.mineBeamTarget;
    if (!target) {
      this.mineBeam.visible = false;
      if (outerBeam) outerBeam.visible = false;
      return;
    }
    const shipPos = this.flightModel.state.position;
    const gunLocal = new THREE.Vector3(0.55, -0.05, 0.4);
    const gunWorld = gunLocal.applyQuaternion(this.flightModel.state.orientation).add(shipPos);
    const dir = target.clone().sub(gunWorld);
    const dist = dir.length();
    if (dist < 1 || dist > 200) {
      this.mineBeam.visible = false;
      if (outerBeam) outerBeam.visible = false;
      return;
    }
    const dirNorm = dir.normalize();
    const mid = gunWorld.clone().add(dir.clone().multiplyScalar(0.5));
    const pulse = 0.5 + Math.sin(Date.now() * 0.015) * 0.5;

    // Core beam
    this.mineBeam.visible = true;
    this.mineBeam.position.copy(mid);
    this.mineBeam.scale.y = dist;
    this.mineBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirNorm);
    (this.mineBeam.material as THREE.MeshBasicMaterial).opacity = 0.5 + pulse * 0.4;

    // Outer glow
    if (outerBeam) {
      outerBeam.visible = true;
      outerBeam.position.copy(mid);
      outerBeam.scale.y = dist;
      outerBeam.quaternion.copy(this.mineBeam.quaternion);
      (outerBeam.material as THREE.MeshBasicMaterial).opacity = 0.15 + pulse * 0.2;
    }
  }

  /** Обновить частицы: спавн по таймеру, движение, fade */
  private updateEngineParticles(dt: number): void {
    const throttle = this.flightModel.state.throttle;
    const boost = this.flightModel.boostActive;
    const spawnPerSec = throttle * 40 + (boost ? 30 : 3); // частиц/сек на engine
    const spawnInterval = 1 / Math.max(spawnPerSec, 1);

    for (const ep of this.engineParticles) {
      const geo = ep.points.geometry;
      const posArr = geo.attributes.position.array as Float32Array;
      const colArr = geo.attributes.color.array as Float32Array;
      const count = ep.particles.length;

      // Таймер спавна (храним в первом элементе)
      let spawnTimer = (ep as any)._spawnTimer ?? 0;
      spawnTimer += dt;

      for (let i = 0; i < count; i++) {
        const p = ep.particles[i];
        p.life -= dt;

        if (p.life <= 0) {
          // Попытка спавна новой частицы
          if (spawnTimer >= spawnInterval) {
            spawnTimer -= spawnInterval;
            p.maxLife = 0.3 + Math.random() * 0.7;
            p.life = p.maxLife;
            p.vel = 2 + Math.random() * 6 + (boost ? 4 : 0);
            const spread = 0.06;
            posArr[i * 3] = ep.nozzleLocal.x + (Math.random() - 0.5) * spread;
            posArr[i * 3 + 1] = ep.nozzleLocal.y + (Math.random() - 0.5) * spread;
            posArr[i * 3 + 2] = ep.nozzleLocal.z;
          } else {
            posArr[i * 3 + 2] = 9999;
            continue;
          }
        }

        // Движение назад (-Z local) + разброс
        posArr[i * 3 + 2] -= p.vel * dt;
        posArr[i * 3] += ((Math.random() - 0.5) * 0.3) * dt;
        posArr[i * 3 + 1] += ((Math.random() - 0.5) * 0.3) * dt;

        // Цвет: крыльевые — оранжевый, центральный — синий
        const t = p.life / p.maxLife;
        if ((ep as any).isCentral) {
          colArr[i * 3] = t * 0.2;     // R
          colArr[i * 3 + 1] = t * 0.6; // G
          colArr[i * 3 + 2] = t;       // B — синий
        } else {
          colArr[i * 3] = t;           // R
          colArr[i * 3 + 1] = t * 0.5; // G
          colArr[i * 3 + 2] = t * 0.1; // B
        }
      }

      (ep as any)._spawnTimer = spawnTimer;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
  }

  /**
   * Получить текущую скорость (м/с в игровых единицах)
   */
  getSpeed(): number {
    return this.flightModel.state.velocity.length();
  }

  getPosition(): THREE.Vector3 {
    return this.flightModel.state.position.clone();
  }

  getMesh(): THREE.Group {
    return this.mesh;
  }
}
