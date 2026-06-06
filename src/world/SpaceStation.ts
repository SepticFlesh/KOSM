import * as THREE from 'three';
import { generateStationName } from '../utils/nameGen';

export class SpaceStation {
  public mesh: THREE.Group;
  public position: THREE.Vector3;
  public name: string;

  constructor(scene: THREE.Scene, position: THREE.Vector3, seed: number = 0) {
    this.position = position.clone();
    this.name = generateStationName(seed);
    this.mesh = new THREE.Group();

    const hull = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.4, metalness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.5, metalness: 0.9 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.3, metalness: 0.5, emissive: 0x001122, emissiveIntensity: 0.5 });

    // ── Central hub ──
    const hubGeo = new THREE.CylinderGeometry(1.2, 1.4, 5.0, 16);
    this.mesh.add(new THREE.Mesh(hubGeo, hull));

    // Hub domes
    const domeGeo = new THREE.SphereGeometry(1.3, 16, 8, 0, Math.PI*2, 0, Math.PI/2);
    const top = new THREE.Mesh(domeGeo, hull); top.position.y = 2.5; this.mesh.add(top);
    const bot = new THREE.Mesh(domeGeo, hull); bot.position.y = -2.5; bot.rotation.x = Math.PI; this.mesh.add(bot);

    // ── Main ring (habitat, rotating) ──
    const ringGeo = new THREE.TorusGeometry(3.0, 0.4, 12, 48);
    const ring = new THREE.Mesh(ringGeo, dark);
    ring.rotation.x = Math.PI / 2;
    ring.name = 'StationRing';
    this.mesh.add(ring);

    // Ring windows (small glowing dots)
    const winCount = 48;
    for (let i = 0; i < winCount; i++) {
      const a = (i / winCount) * Math.PI * 2;
      const winGeo = new THREE.SphereGeometry(0.06, 4, 4);
      const win = new THREE.Mesh(winGeo, new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
      win.position.set(Math.cos(a) * 3.0, 0.35, Math.sin(a) * 3.0);
      win.name = 'RingWindow';
      this.mesh.add(win);
      const win2 = new THREE.Mesh(winGeo, new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
      win2.position.set(Math.cos(a) * 3.0, -0.35, Math.sin(a) * 3.0);
      win2.name = 'RingWindow';
      this.mesh.add(win2);
    }

    // Ring spokes
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spokeGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.0, 8);
      const spoke = new THREE.Mesh(spokeGeo, dark);
      spoke.position.set(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5);
      spoke.rotation.z = Math.PI / 2;
      spoke.rotation.y = -a;
      this.mesh.add(spoke);
    }

    // ── Second smaller ring (counter-rotating) ──
    const ring2Geo = new THREE.TorusGeometry(2.2, 0.2, 8, 36);
    const ring2 = new THREE.Mesh(ring2Geo, accent);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = -1.5;
    ring2.name = 'StationRing2';
    this.mesh.add(ring2);

    // ── Docking arms ──
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const armLen = 3.0;
      const armGeo = new THREE.CylinderGeometry(0.12, 0.12, armLen, 8);
      const arm = new THREE.Mesh(armGeo, accent);
      arm.position.x = Math.cos(a) * (1.5 + armLen / 2);
      arm.position.z = Math.sin(a) * (1.5 + armLen / 2);
      arm.position.y = 2 - i * 2;
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = -a;
      this.mesh.add(arm);

      // Docking pad
      const padGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12);
      const pad = new THREE.Mesh(padGeo, dark);
      pad.position.x = Math.cos(a) * (1.5 + armLen);
      pad.position.z = Math.sin(a) * (1.5 + armLen);
      pad.position.y = 2 - i * 2;
      this.mesh.add(pad);

      // Docking lights
      const dlGeo = new THREE.SphereGeometry(0.08, 6, 6);
      const dl1 = new THREE.Mesh(dlGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
      dl1.position.copy(pad.position).add(new THREE.Vector3(Math.cos(a) * 0.25, 0.05, Math.sin(a) * 0.25));
      this.mesh.add(dl1);
      const dl2 = new THREE.Mesh(dlGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
      dl2.position.copy(pad.position).add(new THREE.Vector3(Math.cos(a) * 0.25, -0.05, Math.sin(a) * 0.25));
      this.mesh.add(dl2);
    }

    // ── Antenna array ──
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const antGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6);
      const ant = new THREE.Mesh(antGeo, dark);
      ant.position.x = Math.cos(a) * 1.0;
      ant.position.z = Math.sin(a) * 1.0;
      ant.position.y = 3.2;
      this.mesh.add(ant);
      // Antenna tip
      const tipGeo = new THREE.SphereGeometry(0.05, 4, 4);
      const tip = new THREE.Mesh(tipGeo, new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true }));
      tip.position.copy(ant.position).add(new THREE.Vector3(0, 0.75, 0));
      tip.name = 'AntennaTip';
      this.mesh.add(tip);
    }

    // ── Solar panels ──
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const panelGeo = new THREE.BoxGeometry(0.04, 2.0, 1.0);
      const panel = new THREE.Mesh(panelGeo, new THREE.MeshStandardMaterial({
        color: 0x112244, roughness: 0.2, metalness: 0.3, emissive: 0x001122, emissiveIntensity: 0.3,
      }));
      panel.position.x = Math.cos(a) * 3.5;
      panel.position.z = Math.sin(a) * 3.5;
      panel.position.y = 0;
      panel.rotation.y = -a;
      this.mesh.add(panel);
    }

    // ── Nav lights ──
    const navGeo = new THREE.SphereGeometry(0.1, 6, 6);
    const redL = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    redL.position.set(0, 2.8, 0); this.mesh.add(redL);
    const greenL = new THREE.Mesh(navGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
    greenL.position.set(0, -2.8, 0); this.mesh.add(greenL);

    // ── Beacon ──
    const beacon = new THREE.PointLight(0x4488ff, 8, 50);
    beacon.position.set(0, 3.5, 0);
    this.mesh.add(beacon);
    const beacon2 = new THREE.PointLight(0x4488ff, 5, 30);
    beacon2.position.set(0, -3.5, 0);
    this.mesh.add(beacon2);

    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }

  update(dt: number): void {
    const ring = this.mesh.getObjectByName('StationRing');
    if (ring) ring.rotation.z += dt * 0.2;
    const ring2 = this.mesh.getObjectByName('StationRing2');
    if (ring2) ring2.rotation.z -= dt * 0.3;
    // Blink antenna tips
    const tips = this.mesh.children.filter(c => c.name === 'AntennaTip');
    for (const t of tips) {
      if (t instanceof THREE.Mesh) {
        (t.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(Date.now() * 0.005 + tips.indexOf(t)) * 0.5;
      }
    }
  }

  dispose(): void {
    this.mesh.traverse(c => {
      if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
    });
    this.mesh.parent?.remove(this.mesh);
  }
}
