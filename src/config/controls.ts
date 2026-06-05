/**
 * Конфигурация управления — все клавиши и действия в одном месте.
 * Коды клавиш: e.code (физическое расположение, не зависит от раскладки).
 */

export const Controls = {
  // ── Вращение ──
  pitchUp: ["KeyW"],
  pitchDown: ["KeyS"],
  pitchUpStrong: ["KeyR"],
  pitchDownStrong: ["KeyF"],
  yawLeft: ["KeyA"],
  yawRight: ["KeyD"],
  rollLeft: ["KeyQ"],
  rollRight: ["KeyE"],

  // ── Тяга ──
  throttleUp: ["Period"],
  throttleDown: ["Comma"],
  throttleFull: ["Tab"],
  verticalUp: ["ShiftLeft", "ShiftRight"],
  verticalDown: ["ControlLeft", "ControlRight"],

  // ── Бой ──
  fire: ["KeyZ", "AltLeft", "AltRight"],
  fireMouse: 0, // mouse button

  // ── Навигация ──
  targetLock: ["KeyX", "Slash"],
  boost: ["Space"],

  // ── Режимы ──
  modeRealistic: ["Digit1"],
  modeAssist: ["Digit2"],
  modeCruise: ["Digit3"],

  // ── Мышь ──
  mouseSensitivity: 0.05,
  throttleWheelSpeed: 0.003,

  // ── Комбинации стрелок ──
  arrowCombos: {
    enabled: true,
    pitchUp: { up: true },
    pitchDown: { down: true },
    rollLeft: { left: true, up: true },
    rollRight: { right: true, up: true },
    yawLeft: { left: true },
    yawRight: { right: true },
    throttleUp: { left: true, right: true, up: true },
    throttleDown: { left: true, right: true, down: true },
  },
} as const;
