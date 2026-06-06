/**
 * Менеджер ввода: клавиатура, мышь, геймпад (в будущем).
 *
 * Поддерживает:
 * - Отслеживание нажатых клавиш
 * - Дельта-движения мыши
 * - Обработку событий колеса
 */
export class InputManager {
  // Состояние клавиш (true = нажата)
  private keys: Map<string, boolean> = new Map();
  // Клавиши, нажатые в этом кадре
  private keysJustPressed: Set<string> = new Set();
  // Клавиши, отпущенные в этом кадре
  private keysJustReleased: Set<string> = new Set();

  // Мышь
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private mouseButtons: Map<number, boolean> = new Map();
  private mouseWheel = 0;

  // Блокировка курсора
  private isPointerLocked = false;

  // Привязки обработчиков
  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnKeyUp: (e: KeyboardEvent) => void;
  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnMouseDown: (e: MouseEvent) => void;
  private boundOnMouseUp: (e: MouseEvent) => void;
  private boundOnWheel: (e: WheelEvent) => void;
  private boundOnPointerLockChange: () => void;

  constructor() {
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);
    this.boundOnMouseUp = this.onMouseUp.bind(this);
    this.boundOnWheel = this.onWheel.bind(this);
    this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
  }

  /**
   * Подключить слушатели событий
   */
  attach(target?: HTMLElement): void {
    document.addEventListener('keydown', this.boundOnKeyDown);
    document.addEventListener('keyup', this.boundOnKeyUp);
    const moveTarget = target ?? document;
    moveTarget.addEventListener('mousemove', this.boundOnMouseMove as EventListener);
    document.addEventListener('mousedown', this.boundOnMouseDown as EventListener);
    document.addEventListener('mouseup', this.boundOnMouseUp as EventListener);
    document.addEventListener('wheel', this.boundOnWheel);
    document.addEventListener('pointerlockchange', this.boundOnPointerLockChange);
  }

  /**
   * Отключить слушатели событий
   */
  detach(target?: HTMLElement): void {
    document.removeEventListener('keydown', this.boundOnKeyDown);
    document.removeEventListener('keyup', this.boundOnKeyUp);
    const moveTarget = target ?? document;
    moveTarget.removeEventListener('mousemove', this.boundOnMouseMove as EventListener);
    document.removeEventListener('mousedown', this.boundOnMouseDown as EventListener);
    document.removeEventListener('mouseup', this.boundOnMouseUp as EventListener);
    document.removeEventListener('wheel', this.boundOnWheel);
    document.removeEventListener('pointerlockchange', this.boundOnPointerLockChange);

    // Выход из pointer lock
    if (this.isPointerLocked) {
      document.exitPointerLock();
    }
  }

  /**
   * Вызвать в начале каждого кадра.
   * Сбрасывает дельты мыши и события "только что нажато/отпущено".
   */
  update(): void {
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.mouseWheel = 0;
    this.keysJustPressed.clear();
    this.keysJustReleased.clear();
  }

  /**
   * Заблокировать курсор (для режима свободного обзора)
   */
  lockPointer(element: HTMLElement): void {
    element.requestPointerLock();
  }

  /**
   * Проверить, удерживается ли клавиша
   */
  isKeyDown(code: string): boolean {
    return this.keys.get(code) === true;
  }

  /**
   * Проверить, была ли клавиша нажата в этом кадре
   */
  isKeyJustPressed(code: string): boolean {
    return this.keysJustPressed.has(code);
  }

  /**
   * Проверить, была ли клавиша отпущена в этом кадре
   */
  isKeyJustReleased(code: string): boolean {
    return this.keysJustReleased.has(code);
  }

  /**
   * Получить направление WASD как вектор (-1..1 по X и Z)
   */
  getWASD(): { x: number; z: number } {
    const x = (this.isKeyDown('d') ? 1 : 0) - (this.isKeyDown('a') ? 1 : 0);
    const z = (this.isKeyDown('s') ? 1 : 0) - (this.isKeyDown('w') ? 1 : 0);
    return { x, z };
  }

  /**
   * Получить вертикальное движение (Q/E или R/F)
   */
  getVertical(): number {
    return (this.isKeyDown('e') ? 1 : 0) - (this.isKeyDown('q') ? 1 : 0);
  }

  /**
   * Получить крен (R/F для roll)
   */
  getRoll(): number {
    return (this.isKeyDown('f') ? 1 : 0) - (this.isKeyDown('r') ? 1 : 0);
  }

  getMouseDelta(): { x: number; y: number } {
    return { x: this.mouseDeltaX, y: this.mouseDeltaY };
  }

  getMouseWheel(): number {
    return this.mouseWheel;
  }

  isMouseDown(button: number): boolean {
    return this.mouseButtons.get(button) === true;
  }

  isPointerLockedState(): boolean {
    return this.isPointerLocked;
  }

  /** For touch: inject fake mouse delta */
  injectMouseDelta(dx: number, dy: number): void {
    this.mouseDeltaX += dx;
    this.mouseDeltaY += dy;
  }
  injectKeyDown(code: string): void {
    this.keys.set(code, true);
    this.keysJustPressed.add(code);
  }
  injectKeyUp(code: string): void {
    this.keys.set(code, false);
  }

  // --- Private handlers ---

  private onKeyDown(e: KeyboardEvent): void {
    // Блокируем браузерные действия
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code.startsWith('Alt')) {
      e.preventDefault();
    }
    // Пропускаем автоповторы
    if (e.repeat) return;
    const code = e.code;
    if (!this.keys.get(code)) {
      this.keysJustPressed.add(code);
    }
    this.keys.set(code, true);
  }

  private onKeyUp(e: KeyboardEvent): void {
    const code = e.code;
    this.keys.set(code, false);
    this.keysJustReleased.add(code);
  }

  private onMouseMove(e: MouseEvent): void {
    this.mouseDeltaX += e.movementX;
    this.mouseDeltaY += e.movementY;
    // Во время pointer lock mousedown/mouseup могут не срабатывать,
    // поэтому отслеживаем кнопки через e.buttons
    this.mouseButtons.set(0, (e.buttons & 1) !== 0);
    this.mouseButtons.set(1, (e.buttons & 2) !== 0);
    this.mouseButtons.set(2, (e.buttons & 4) !== 0);
  }

  private onMouseDown(e: MouseEvent): void {
    this.mouseButtons.set(e.button, true);
  }

  private onMouseUp(e: MouseEvent): void {
    this.mouseButtons.set(e.button, false);
  }

  private onWheel(e: WheelEvent): void {
    this.mouseWheel += e.deltaY;
  }

  private onPointerLockChange(): void {
    this.isPointerLocked = document.pointerLockElement !== null;
  }
}
