import * as THREE from 'three';

/**
 * Режимы полёта
 */
export const FlightMode = {
  Realistic: 'realistic',
  FlightAssist: 'flight_assist',
  Cruise: 'cruise',
} as const;
export type FlightMode = (typeof FlightMode)[keyof typeof FlightMode];

/**
 * Параметры корабля
 */
export interface ShipConfig {
  mass: number;
  thrust: number;             // Сила тяги главных двигателей
  maneuveringThrust: number;  // Сила маневровых
  rotationalSpeed: number;    // pitch/yaw/roll (рад/с)
  dragLinear: number;         // Линейное сопротивление (assist)
  dragAngular: number;        // Угловое сопротивление
  maxSpeedAssist: number;     // Макс скорость в assist
  maxSpeedCruise: number;     // Макс скорость в круизе
  boostMultiplier: number;    // Множитель форсажа
  boostCapacity: number;      // Максимальная энергия форсажа
  boostRecharge: number;      // Скорость восстановления форсажа
}

/**
 * Состояние корабля
 */
export interface ShipState {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  orientation: THREE.Quaternion; // Кватернион поворота
  angularVelocity: THREE.Vector3; // Угловая скорость
  boostEnergy: number;
  mode: FlightMode;
  throttle: number;          // 0..1
}

/**
 * Стандартная конфигурация лёгкого истребителя
 */
export const DEFAULT_SHIP_CONFIG: ShipConfig = {
  mass: 20,
  thrust: 4000,
  maneuveringThrust: 500,
  rotationalSpeed: 8.0,
  dragLinear: 0.998,
  dragAngular: 0.92,
  maxSpeedAssist: 30,
  maxSpeedCruise: 200,
  boostMultiplier: 40.0, // форсаж: 30 × 40 = 1200 м/с
  boostCapacity: 100,
  boostRecharge: 15,
};

/**
 * Лётная модель корабля.
 * Содержит физику: ускорение, инерцию, сопротивление.
 * Не зависит от рендеринга — чистая математика.
 */
export class FlightModel {
  public state: ShipState;
  public config: ShipConfig;

  // Текущие силы (накапливаются за кадр)
  private thrustVector: THREE.Vector3 = new THREE.Vector3();
  private torqueVector: THREE.Vector3 = new THREE.Vector3();
  private boosting = false;
  public boostActive = false;

  constructor(config: Partial<ShipConfig> = {}) {
    this.config = { ...DEFAULT_SHIP_CONFIG, ...config };
    this.state = {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      orientation: new THREE.Quaternion(),
      angularVelocity: new THREE.Vector3(),
      boostEnergy: this.config.boostCapacity,
      mode: FlightMode.FlightAssist,
      throttle: 0,
    };
  }

  /**
   * Установить вектор тяги (в локальных координатах корабля).
   * forward > 0 = вперёд, lateral = вбок, vertical = вверх/вниз
   */
  setThrust(axis: THREE.Vector3): void {
    this.thrustVector.copy(axis);
  }

  /**
   * Установить вращательный момент (от -1 до 1 по каждой оси).
   * x = pitch, y = yaw, z = roll
   */
  setTorque(axis: THREE.Vector3): void {
    this.torqueVector.copy(axis);
  }

  /**
   * Установить режим полёта
   */
  setMode(mode: FlightMode): void {
    this.state.mode = mode;
  }

  /**
   * Установить уровень газа (0..1)
   */
  setThrottle(throttle: number): void {
    this.state.throttle = Math.max(0, Math.min(1, throttle));
  }

  /**
   * Включить/выключить форсаж
   */
  setBoost(active: boolean): void {
    const hasSpeed = this.state.velocity.length() > 0.5;
    this.boosting = active && this.state.boostEnergy > 0 && hasSpeed;
    this.boostActive = this.boosting;
  }

  /**
   * Главный шаг симуляции. Вызывается каждый кадр.
   */
  simulate(dt: number): void {
    // Clamp dt для стабильности
    const clampedDt = Math.min(dt, 0.05);

    // Подшаги для точности (фиксированный шаг 1/120)
    const substeps = Math.ceil(clampedDt / (1 / 120));
    const subDt = clampedDt / substeps;

    for (let i = 0; i < substeps; i++) {
      this.substep(subDt);
    }
  }

  private substep(dt: number): void {
    const { state, config } = this;

    // --- Вращение ---
    // Применяем момент к угловой скорости
    const torqueScale = config.rotationalSpeed * dt;
    state.angularVelocity.x += this.torqueVector.x * torqueScale;
    state.angularVelocity.y += this.torqueVector.y * torqueScale;
    state.angularVelocity.z += this.torqueVector.z * torqueScale;

    // Угловое сопротивление: зависит от режима
    // FlightAssist — сильное демпфирование (самостабилизация)
    // Realistic — почти без сопротивления (полная ньютоновская механика)
    let angularDrag: number;
    switch (state.mode) {
      case FlightMode.Realistic:
        angularDrag = 0.995; // почти нет трения
        break;
      case FlightMode.Cruise:
        angularDrag = 0.98;
        break;
      case FlightMode.FlightAssist:
      default:
        angularDrag = 0.94; // лёгкое демпфирование, отзывчивое управление
        break;
    }
    state.angularVelocity.multiplyScalar(angularDrag);

    // Обновляем ориентацию через axis-angle (без gimbal lock)
    const av = state.angularVelocity.clone().multiplyScalar(dt);
    const angle = av.length();
    if (angle > 0.0001) {
      const axis = av.normalize();
      const rotationQuat = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      state.orientation.multiply(rotationQuat);
      state.orientation.normalize();
    }

    // --- Линейное движение ---
    // Вычисляем вектор тяги в мировых координатах
    const localThrust = this.thrustVector.clone();

    // Основная тяга (throttle + forward thrust)
    localThrust.z += state.throttle;

    // Форсаж
    let thrustMultiplier = 1.0;
    if (this.boosting && state.boostEnergy > 0) {
      thrustMultiplier = config.boostMultiplier;
      const speedRatio = Math.min(1, state.velocity.length() / config.maxSpeedAssist);
      state.boostEnergy = Math.max(0, state.boostEnergy - (0.1 + speedRatio * 0.5) * dt);
    } else {
      state.boostEnergy = Math.min(
        config.boostCapacity,
        state.boostEnergy + config.boostRecharge * dt
      );
    }

    const thrustForce = localThrust.multiplyScalar(
      config.thrust * thrustMultiplier * dt
    );

    // Преобразуем в мировые координаты
    thrustForce.applyQuaternion(state.orientation);

    // Ускорение: F = ma → a = F/m, v += a*dt
    const acceleration = thrustForce.divideScalar(config.mass);
    state.velocity.add(acceleration);

    // Сопротивление / торможение
    const thrustActive = Math.abs(this.thrustVector.x) > 0.01 ||
                         Math.abs(this.thrustVector.y) > 0.01 ||
                         Math.abs(this.thrustVector.z) > 0.01 ||
                         state.throttle > 0.01;
    if (state.mode === FlightMode.FlightAssist) {
      if (thrustActive) {
        // Обычное лёгкое сопротивление при активной тяге
        state.velocity.multiplyScalar(0.998);
      } else {
        // Резкое торможение
        state.velocity.multiplyScalar(0.97);
      }
    } else if (state.mode === FlightMode.Cruise) {
      state.velocity.multiplyScalar(0.999);
    }
    // Realistic — без сопротивления

    // Ограничение скорости
    const boostMul = this.boosting ? config.boostMultiplier : 1;
    const maxSpeed = state.mode === FlightMode.Cruise
      ? state.throttle * config.maxSpeedCruise
      : state.throttle * config.maxSpeedAssist * boostMul;

    // Отдельно ограничиваем вертикальную компоненту (Shift/Ctrl)
    const maxVertSpeed = 30 * boostMul;
    if (Math.abs(state.velocity.y) > maxVertSpeed) {
      state.velocity.y = Math.sign(state.velocity.y) * maxVertSpeed;
    }

    // Общий лимит
    const speed = state.velocity.length();
    if (speed > maxSpeed && maxSpeed > 0.1) {
      state.velocity.multiplyScalar(maxSpeed / speed);
    }

    // Обновляем позицию
    state.position.add(state.velocity.clone().multiplyScalar(dt));
  }

  /**
   * Сброс до начального состояния
   */
  reset(position?: THREE.Vector3): void {
    this.state.position.copy(position ?? new THREE.Vector3());
    this.state.velocity.set(0, 0, 0);
    this.state.orientation.identity();
    this.state.angularVelocity.set(0, 0, 0);
    this.state.boostEnergy = this.config.boostCapacity;
    this.state.throttle = 0;
    this.thrustVector.set(0, 0, 0);
    this.torqueVector.set(0, 0, 0);
  }

  /**
   * Получить forward-вектор (куда смотрит корабль)
   */
  getForward(): THREE.Vector3 {
    const forward = new THREE.Vector3(0, 0, 1);
    forward.applyQuaternion(this.state.orientation);
    return forward;
  }

  /**
   * Получить up-вектор
   */
  getUp(): THREE.Vector3 {
    const up = new THREE.Vector3(0, 1, 0);
    up.applyQuaternion(this.state.orientation);
    return up;
  }

  /**
   * Получить right-вектор
   */
  getRight(): THREE.Vector3 {
    const right = new THREE.Vector3(1, 0, 0);
    right.applyQuaternion(this.state.orientation);
    return right;
  }
}
