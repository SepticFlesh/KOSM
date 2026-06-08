# 🔍 KOSM (AIATOR) — Анализ проекта и план оптимизации

**Дата**: 2026-06-08  
**Ветка**: main  
**Коммитов**: ~60+  

---

## 1. Обзор архитектуры

### Стек
| Слой | Технологии |
|------|-----------|
| **Frontend** | React 19, TypeScript 6.0, Three.js 0.184, Vite 8 |
| **Backend** | Node.js, TypeScript, WebSocket (ws), SQLite (better-sqlite3), JWT |
| **Сеть** | WebSocket (wss://), бинарный JSON-протокол |
| **Стейт** | Кастомный useSyncExternalStore + глобальные window-переменные |

### Структура
```
KOSM/
├── src/                    # Клиент (React + Three.js)
│   ├── engine/            # Движок: рендерер, ввод, загрузка, сцена
│   ├── gameplay/          # Игровая логика: корабль, враги, оружие, торговля
│   ├── network/           # WebSocket клиент, синхронизация, интерполяция
│   ├── modes/             # SP / MP режимы (колбэки + HUD-синхронизация)
│   ├── world/             # Мир: вселенная, системы, планеты, станции
│   ├── components/        # React UI: меню, HUD, радар, чат
│   ├── data/              # Статические данные: товары, фракции, апгрейды
│   └── ui/store/          # Состояние UI (gameStore)
├── server/
│   ├── src/
│   │   ├── entities/      # ShipEntity, ShipTypes
│   │   ├── systems/       # Traffic, Economy, Missions, Chat, Routes
│   │   └── protocol/      # Общие типы сообщений
│   └── data/              # SQLite БД
└── public/                # Статика (favicon, иконки)
```

---

## 2. Критические проблемы

### 🔴 2.1. Дублирование физики корабля (HIGH)
**Файлы**: `server/src/entities/ShipEntity.ts` ↔ `src/gameplay/FlightModel.ts`

Две независимые реализации физики с разными конфигурациями:

| Параметр | Server (ShipEntity) | Client (FlightModel) |
|----------|-------------------|---------------------|
| `mass` | 20 | 20 |
| `thrust` | 4000 | 4000 |
| `rotationalSpeed` | 8.0 | 8.0 |
| `maxSpeedAssist` | 30 | 30 |
| `drag` | inline-константы | config-параметры |

**Решение**: Вынести общую физику в `shared/physics.ts` (пакет или symlink).

### 🔴 2.2. Размазывание состояния (HIGH)
Состояние дублируется между тремя механизмами:
1. **gameStore.ts** — `useSyncExternalStore` (React-совместимый)
2. **window.__kosm\*** — глобальные переменные для прямого доступа из game loop
3. **DOM-элементы** — `Engine.registerDirectHUD()` пишет напрямую через `document.getElementById()`

**Проблема**: Одно и то же значение (скорость, щит, etc.) обновляется в 2-3 местах одновременно. Рассогласование неизбежно.

**Решение**: Единый источник истины — `gameStore`. Все чтения через него. DOM-компоненты пусть подписываются на стор.

### 🔴 2.3. Смешение ответственности в server/index.ts (HIGH)
`server/src/index.ts` (262 строки) содержит:
- HTTP-сервер и CORS
- OAuth-колбэки (GitHub, Google)
- WebSocket инициализацию
- Обработку **всех** игровых сообщений (input, fire, trade, jump, chat, missions)
- Отслеживание убийств и миссий
- Генерацию рынков и миссий
- Broadcast world-снапшотов

**Решение**: Разделить на:
- `server/src/http/router.ts` — HTTP-endpoint'ы
- `server/src/handlers/` — обработчики сообщений по доменам
- `server/src/services/` — бизнес-логика

### 🔴 2.4. Отсутствие тестов
0 тестов. Нет vitest/jest конфигурации.

**Решение**: Добавить vitest, покрыть минимум:
1. Физику корабля (shared)
2. Экономику (ценообразование)
3. Систему миссий (прогресс)
4. Сетевое сообщение (сериализация/десериализация)

---

## 3. Проблемы производительности

### 🟡 3.1. Гражданский трафик (MEDIUM)
`TrafficSystem.init()` создаёт **150-240 кораблей**:
- 50-79 на маршрут × 3 маршрута
- Каждый со своей `ShipEntity.simulate()` (подшаги 1/120с)
- 240 кораблей × 8 подшагов/тик × 20 тиков/с = **38,400 подшагов/с**

**Решение**:
- LOD-симуляция: дальние корабли — упрощённая физика
- Групповое движение: корабли на одном маршруте образуют кластеры
- Уменьшить до 15-25 на маршрут (вместо 50-79)

### 🟡 3.2. Хит-детекшн O(n×m) (MEDIUM)
`SceneManager.checkHits()` и `checkPlayerDamage()`:
- Каждый болт × каждый враг × каждый болт врага × игрок
- Нет пространственного хеширования

**Решение**: Пространственный хеш (грид 50×50×50) для быстрого поиска ближайших сущностей.

### 🟡 3.3. Broadcast без фильтрации (MEDIUM)
`server/src/index.ts` — `world_snapshot` отправляется **всем** клиентам:
```typescript
wss.clients.forEach(client => {
  if (client.readyState === 1) client.send(data);
});
```
Всем игрокам приходят все NPC (даже в других системах).

**Решение**: Фильтровать entities по `systemSeed` перед отправкой конкретному игроку.

### 🟡 3.4. DOM-манипуляции на каждый HUD-кадр (LOW)
`Engine.registerDirectHUD()` делает до 15 вызовов `document.getElementById()` 60 раз/с:
```typescript
setText('hud-speed', ...);    // getElementById('hud-speed')
setStyle('hud-thr', ...);     // getElementById('hud-thr')
setText('hud-fps', ...);      // ...
// ... ещё 12
```

**Решение**: React-компонент HUD, подписанный на `useGameStore`. Один ререндер при изменении данных.

### 🟡 3.5. Утечки и создание объектов (LOW)
Каждый HUD-кадр создаёт десятки `THREE.Vector3()`, `Float32Array`, объектов массивов:
```typescript
// SinglePlayerMode.ts — каждый кадр
const rel = e.flightModel.state.position.clone().sub(shipPos); // new Vector3
const bFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(...); // new Vector3
const bRgt = new THREE.Vector3(1, 0, 0).applyQuaternion(...); // new Vector3
const bUp = new THREE.Vector3(0, 1, 0).applyQuaternion(...);  // new Vector3
```

**Решение**: Переиспользовать объекты (паттерн Object Pool).

---

## 4. Архитектурные проблемы

### 🟠 4.1. Дублирование HUD-синхронизации
`startSPHUDSync()` и `startMPHUDSync()` — **~80% общего кода**.

**Решение**: Вынести общую часть в `createHUDSync()`, SP/MP отличия — через параметры/колбэки.

### 🟠 4.2. Типизация через `as any`
- 40+ использований `as any` в серверном коде
- `payload: any` для `player_state`, `trade_menu`, `missions`, `combat_event`
- `(gameState as any)._closeWrapped` — monkey-patching

**Решение**: Полная типизация всех сообщений, удаление `as any`.

### 🟠 4.3. Безопасность
- `JWT_SECRET` имеет дефолтное значение в коде: `'kosm-dev-secret-change-in-production'`
- Нет rate limiting на WebSocket-сообщениях
- Нет валидации размера/структуры входящих сообщений
- `GITHUB_CLIENT_SECRET` может быть пустой строкой

**Решение**: Валидация через zod, rate limiting, обязательные env-переменные.

### 🟠 4.4. Мёртвый код и недоделки
- `server/src/index.ts` — case `'mission_accept'`: пустой обработчик (строка 176)
- `MultiplayerMode.ts` — `playerShip.onTradeRequest` выводит "not yet implemented" (строка 62)
- `inputSync.reconcile()` — намеренно отключён: `// Client-authoritative: no reconciliation` (строка 85)

**Решение**: Доделать или удалить.

### 🟠 4.5. Конфигурация окружения
- `.env` закоммичен в git (`M .env` в git status)
- Два `.env.example` (корень и server/) — неясно какой использовать

**Решение**: Убрать `.env` из git, объединить `.env.example`.

---

## 5. План рефакторинга (приоритетный)

### Фаза 1: Безопасность и критические фиксы (1-2 дня)
| # | Задача | Файлы | Сложность |
|---|--------|-------|-----------|
| 1.1 | Убрать `.env` из git, добавить в `.gitignore` | `.env`, `.gitignore` | ⚡ |
| 1.2 | Вынести `JWT_SECRET` в env с проверкой | `server/src/auth.ts` | ⚡ |
| 1.3 | Добавить валидацию входящих WS-сообщений (zod) | `server/src/`, `src/network/` | 🔨 |
| 1.4 | Добавить rate limiting на WebSocket | `server/src/wsServer.ts` | 🔨 |
| 1.5 | Убрать дефолтные секреты из кода | `server/src/auth.ts` | ⚡ |

### Фаза 2: Устранение дублирования (2-3 дня)
| # | Задача | Файлы | Сложность |
|---|--------|-------|-----------|
| 2.1 | Вынести общую физику в `shared/physics.ts` | `server/`, `src/gameplay/` | 🔨🔨 |
| 2.2 | Объединить `startSPHUDSync`/`startMPHUDSync` | `src/modes/` | 🔨 |
| 2.3 | Унифицировать конфигурации кораблей | `server/src/entities/`, `src/gameplay/` | 🔨 |
| 2.4 | Создать общий пакет типов (без `as any`) | `shared/types.ts` | 🔨 |

### Фаза 3: Декомпозиция сервера (2-3 дня)
| # | Задача | Файлы | Сложность |
|---|--------|-------|-----------|
| 3.1 | Выделить HTTP-роутер | `server/src/http/router.ts` | 🔨🔨 |
| 3.2 | Выделить обработчики сообщений | `server/src/handlers/` | 🔨🔨 |
| 3.3 | Выделить сервисы (TradeService, MissionService) | `server/src/services/` | 🔨🔨 |
| 3.4 | Почистить `index.ts` до точки входа | `server/src/index.ts` | 🔨 |

### Фаза 4: Производительность (2-3 дня)
| # | Задача | Файлы | Сложность |
|---|--------|-------|-----------|
| 4.1 | LOD-симуляция для гражданского трафика | `server/src/systems/TrafficSystem.ts` | 🔨🔨 |
| 4.2 | Пространственный хеш для хит-детекшна | `src/engine/SceneManager.ts` | 🔨🔨 |
| 4.3 | Фильтрация broadcast по systemSeed | `server/src/index.ts` | ⚡ |
| 4.4 | Object pool для Vector3 в HUD-синхронизации | `src/modes/` | 🔨 |
| 4.5 | Перевести HUD на React (убрать прямые DOM-манипуляции) | `src/engine/Engine.ts`, `src/components/HUD.tsx` | 🔨🔨 |
| 4.6 | Уменьшить количество traffic ships (240 → 60) | `server/src/systems/TrafficSystem.ts` | ⚡ |

### Фаза 5: Качество кода и тесты (2-3 дня)
| # | Задача | Файлы | Сложность |
|---|--------|-------|-----------|
| 5.1 | Добавить vitest, написать тесты для физики | `shared/`, `src/` | 🔨🔨 |
| 5.2 | Тесты для EconomySystem | `server/src/systems/` | 🔨 |
| 5.3 | Тесты для MissionSystem | `server/src/systems/` | 🔨 |
| 5.4 | Тесты для протокола (сериализация) | `src/network/`, `server/src/protocol/` | 🔨 |
| 5.5 | Доделать/удалить мёртвый код | `server/src/index.ts`, `src/modes/MultiplayerMode.ts` | ⚡ |
| 5.6 | Навести порядок в `as any` | Все файлы | 🔨 |
| 5.7 | Убрать window.\_\_kosm\* глобальные переменные | `src/types/globals.ts`, `src/modes/` | 🔨 |

---

## 6. Детальный план: Фаза 1 (Начать сейчас)

### 6.1. `.env` в gitignore + валидация секретов
```
# .gitignore — добавить
.env
server/.env
```

`server/src/auth.ts`:
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'kosm-dev-secret-change-in-production') {
  throw new Error('JWT_SECRET must be set in environment');
}
```

### 6.2. Zod-валидация сообщений
```typescript
// shared/messages.ts
import { z } from 'zod';

export const InputPayloadSchema = z.object({
  tick: z.number(),
  throttle: z.number().min(0).max(1),
  boost: z.boolean(),
  fire: z.boolean(),
  mine: z.boolean(),
  torque: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  thrust: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  mode: z.enum(['realistic', 'flight_assist', 'cruise']),
  orientation: z.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() }),
});
```

### 6.3. Rate limiting
```typescript
// server/src/wsServer.ts — добавить
const rateLimitMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 60; // сообщений в секунду

function checkRateLimit(playerId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(playerId);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(playerId, { count: 1, reset: now + 1000 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}
```

---

## 7. Детальный план: Фаза 2 (Shared physics)

### 7.1. Структура shared-пакета
```
shared/
├── package.json          # { "name": "@kosm/shared" }
├── tsconfig.json
├── physics.ts            # ShipEntity, FlightModel — общая реализация
├── types.ts              # Vec3, Quat, WorldSnapshot, InputPayload...
└── constants.ts           # DEFAULT_SHIP_CONFIG, SHIP_TYPES...
```

И клиент, и сервер импортируют из `@kosm/shared`:
```typescript
// server/src/entities/ShipEntity.ts
export { ShipEntity, DEFAULT_CONFIG } from '@kosm/shared/physics';

// src/gameplay/FlightModel.ts
export { FlightModel, DEFAULT_SHIP_CONFIG } from '@kosm/shared/physics';
```

### 7.2. Объединение HUD sync
```typescript
// src/modes/hudSync.ts
export function createHUDSync(options: {
  engine: Engine;
  starPos: Vector3;
  playerShip: ShipController;
  universe: Universe;
  mode: 'sp' | 'mp';
  getBlips: () => BlipData[];  // SP/MP различаются только источником блипов
}): () => void {
  // общий код HUD-синхронизации
}
```

---

## 8. План по файлам (что трогать)

### Безопасно удалить
- `src/types/globals.ts` — глобальные window-типы (заменить на gameStore)

### Реструктурировать
- `server/src/index.ts` → `http/router.ts` + `handlers/*.ts`
- `src/modes/SinglePlayerMode.ts` → `hudSync.ts` (общий) + `spCallbacks.ts`
- `src/modes/MultiplayerMode.ts` → `mpCallbacks.ts` + `mpNetwork.ts`

### Переименовать для ясности
- `src/game/bootstrap.ts` → `src/game/init.ts`
- `src/ui/store/gameStore.ts` → `src/state/gameStore.ts`
- `server/src/entities/` → `server/src/simulation/` (добавить общую физику)

### Новые файлы
- `shared/` — общий код клиент/сервер
- `server/src/middleware/` — rate limiting, валидация
- `tests/` — unit и интеграционные тесты
- `src/state/` — unified state management

---

## 9. Оценка трудозатрат

| Фаза | Задач | Дни | Приоритет |
|------|-------|-----|-----------|
| 1. Безопасность | 5 | 1-2 | 🔴 Критический |
| 2. Дублирование | 4 | 2-3 | 🔴 Высокий |
| 3. Декомпозиция | 4 | 2-3 | 🟡 Средний |
| 4. Производительность | 6 | 2-3 | 🟡 Средний |
| 5. Качество | 7 | 2-3 | 🟢 Плановый |
| **Итого** | **26** | **9-14** | |

---

## 10. Быстрые победы (Quick Wins)

Это можно сделать **прямо сейчас**, без риска:

1. ⚡ Убрать `.env` из git
2. ⚡ Удалить `KOSM.md` и `CLAUDE.md` из staged (уже удалены)
3. ⚡ Добавить `.gitignore` для `server/data/` (БД не должна коммититься)
4. ⚡ Уменьшить traffic ships с 50-79 до 15-25 на маршрут
5. ⚡ Заменить `document.getElementById` в HUD на чтение из gameStore
6. ⚡ Удалить пустой обработчик `mission_accept` из index.ts
7. ⚡ Фильтровать broadcast по systemSeed
8. ⚡ Проверить, закрывается ли БД при SIGTERM

---

## 11. Резюме

Проект на ранней стадии (~60 коммитов), архитектура ещё не устоялась. Главные проблемы:
- **Дублирование** физики и HUD-кода
- **Размазанное состояние** (3 механизма)
- **Монолитный сервер** без разделения на слои
- **Нет тестов**
- **Проблемы безопасности** (секреты в коде)

Рекомендация: **начать с Фазы 1 (безопасность)**, затем переходить к Фазе 2 (shared-код). Это даст фундамент для дальнейшей работы.

Каждая фаза — независимый PR, не ломающий обратную совместимость.
