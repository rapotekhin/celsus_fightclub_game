# Бойцовский Клуб 8 Марта — Design Document

> Браузерный мультиплеерный файтинг-кликер с системой ставок. Vanilla TypeScript + Vite + Socket.IO.
> Один экран на проектор, зрители подключаются со смартфонов и влияют на бой тапами.

---

## Содержание

1. [Обзор](#1-обзор)
2. [Технологический стек](#2-технологический-стек)
3. [Структура директорий](#3-структура-директорий)
4. [Модели данных](#4-модели-данных)
5. [Backend API и WebSocket-протокол](#5-backend-api-и-websocket-протокол)
6. [Игровой движок — алгоритмы](#6-игровой-движок--алгоритмы)
7. [Frontend — экраны и компоненты](#7-frontend--экраны-и-компоненты)
8. [Система персонажей](#8-система-персонажей)
9. [Анимационная система](#9-анимационная-система)
10. [Список ассетов](#10-список-ассетов)
11. [Архитектурные решения](#11-архитектурные-решения)
12. [Запуск](#12-запуск)
13. [Тесты](#13-тесты)
14. [README](#14-readme)
15. [Release Notes v0.1.0](#15-release-notes-v010)

---

## 1. Обзор

Браузерная игра для корпоратива 8 Марта. Сценарий: компания обанкротилась, коллектив пробует разные способы заработка — и попадает на «ставки на бои без правил». Один человек (admin) управляет ставками с ноутбука/проектора; остальные участники заходят со смартфонов на тот же URL и влияют на бой тапами по экрану — чем больше тапов в секунду суммарно от болельщиков одного бойца, тем быстрее тот атакует.

**Ключевые возможности:**

- Главный экран с анимированными дверьми клуба (idle / open_door спрайт)
- Интро-диалог двух персонажей с облачками реплик
- Prefighting screen: character sheets, коэффициенты ставок, поле ввода ставки
- Fight screen в стиле Mortal Kombat: полоски HP, автобой, тап-буст от зрителей
- Всплывающие "БЕЙ!" / "ТАК ЕГО!" при тапе, привязанные к координатам касания
- Fatality-анимация победителя, beaten-анимация проигравшего
- Post-fight диалог + накопление баланса с анимацией счётчика
- Рандомный выбор пар из пула 12 персонажей без повторений
- Финальный экран победы с балансом и кнопкой закрытия
- Полная синхронизация через Socket.IO: все видят одну картину, только admin кликает UI

---

## 2. Технологический стек

| Слой | Технология | Примечание |
|------|-----------|-----------|
| Frontend framework | Vanilla TypeScript + Vite | Нет React-оверхеда; анимации через Canvas 2D API |
| Стиль | CSS Modules + custom properties | Без Tailwind — нужны кастомные пиксельные анимации |
| Realtime | Socket.IO v4 (client) | Полная синхронизация состояния игры |
| Backend | Node.js + Express + Socket.IO server | Лёгкий; весь игровой loop на сервере |
| Аудио | Howler.js | Надёжный кросс-браузерный Web Audio |
| Сборка | Vite 5 | HMR для быстрого вайбкодинга, `vite build` для деплоя |
| Пакетный менеджер | pnpm | Быстрее npm |
| Деплой | `node server.js` | Одна команда; статика сервится Express'ом |

```json
// package.json — ключевые зависимости
{
  "dependencies": {
    "express": "^4.18",
    "socket.io": "^4.7",
    "howler": "^2.2"
  },
  "devDependencies": {
    "vite": "^5.0",
    "typescript": "^5.3",
    "@types/node": "^20",
    "socket.io-client": "^4.7"
  }
}
```

**Почему не React?** Canvas-анимации со спрайтами проще управлять вручную. React reconciler конфликтует с requestAnimationFrame-циклом. Для этого проекта это избыточно.

**Почему Socket.IO, а не bare WebSocket?** Автоматический reconnect, rooms, event-based API — экономит ~200 строк кода.

---

## 3. Структура директорий

```
fighting-club/
├── server.js                    # Express + Socket.IO; весь игровой loop
├── package.json
├── tsconfig.json
├── vite.config.ts
│
├── src/
│   ├── main.ts                  # Точка входа; инициализация SceneManager
│   ├── socket.ts                # Singleton socket.io-client; emit/on обёртки
│   ├── state.ts                 # Клиентское зеркало GameState (readonly)
│   │
│   ├── scenes/
│   │   ├── SceneManager.ts      # Переключение сцен; стек истории
│   │   ├── LandingScene.ts      # Двери клуба, idle/open анимация
│   │   ├── IntroScene.ts        # Диалог двух персонажей
│   │   ├── PreFightScene.ts     # Character sheets, ставки, кнопка БОЙ
│   │   ├── FightScene.ts        # Основной бой, HP bars, тапы
│   │   ├── PostFightScene.ts    # Fatality → результат ставок
│   │   ├── PostIntroScene.ts    # Качер раздаёт 100к
│   │   └── WinScene.ts          # Финальный экран победы
│   │
│   ├── engine/
│   │   ├── AnimationController.ts  # Управление спрайт-анимациями
│   │   ├── SpriteSheet.ts          # Парсинг и рендер спрайт-шитов
│   │   ├── Canvas.ts               # Обёртка над CanvasRenderingContext2D
│   │   ├── TapEffect.ts            # Всплывающий текст "БЕЙ!" при тапе
│   │   └── CounterAnimation.ts     # Анимация накопления баланса
│   │
│   ├── audio/
│   │   └── AudioManager.ts      # Howler.js обёртка; preload, play, stop
│   │
│   ├── data/
│   │   ├── characters.ts        # CharacterDef[] — все 12 персонажей
│   │   └── dialogues.ts         # Тексты диалогов (typed)
│   │
│   └── ui/
│       ├── HealthBar.ts         # HP bar компонент (Canvas)
│       ├── BetPanel.ts          # Панель ставки (DOM overlay)
│       ├── MoneyCounter.ts      # Текущий баланс
│       └── SpeechBubble.ts      # Облачко реплики персонажа
│
├── public/
│   ├── assets/
│   │   ├── sprites/             # Спрайт-листы персонажей и окружения
│   │   │   ├── door/
│   │   │   │   ├── door_idle.png
│   │   │   │   └── door_open.png
│   │   │   ├── characters/
│   │   │   │   ├── kacher/
│   │   │   │   │   ├── idle.png
│   │   │   │   │   ├── attack.png
│   │   │   │   │   ├── beaten.png
│   │   │   │   │   ├── winner.png
│   │   │   │   │   ├── fatality.png
│   │   │   │   │   └── character_sheet.png
│   │   │   │   └── zheka/  # ... аналогично для каждого из 12 персонажей
│   │   │   └── backgrounds/
│   │   │       ├── club_exterior.png   # Фон главного экрана
│   │   │       └── fight_arena/
│   │   │           ├── bg_frame_0.png  # Анимированный фон арены
│   │   │           └── bg_frame_1.png  # ...
│   │   ├── audio/
│   │   │   ├── bg_club.mp3         # Фоновая музыка клуба
│   │   │   ├── bg_fight.mp3        # Фоновая музыка боя
│   │   │   ├── hit_1.mp3
│   │   │   ├── hit_2.mp3
│   │   │   ├── fatality.mp3
│   │   │   ├── crowd_cheer.mp3
│   │   │   └── money_coins.mp3
│   │   └── fonts/
│   │       └── fighter.ttf         # Пиксельный шрифт для UI
│   └── index.html
│
└── tests/
    ├── engine.test.ts
    ├── characters.test.ts
    └── server.test.ts
```

---

## 4. Модели данных

Все модели живут в памяти сервера. Персистентность не нужна — игра одноразовая.

```typescript
// === Характеристики персонажа ===
interface CharacterStats {
  strength:    number;  // 1–10, влияет на урон
  agility:     number;  // 1–10, влияет на скорость атаки
  endurance:   number;  // 1–10, влияет на максимальное HP (100 * endurance / 5)
  intelligence: number; // 1–10, декоративно (показывается в character_sheet)
  wisdom:      number;  // 1–10, декоративно
  charisma:    number;  // 1–10, декоративно
}

interface CharacterDef {
  id:        string;      // "kacher", "zheka", ...
  name:      string;      // "Качер", "Жека", ...
  stats:     CharacterStats;
  catchphrase: string;    // Реплика в интро нового боя
}

// === Игровое состояние (master на сервере, зеркало на клиентах) ===
type Scene =
  | 'landing'
  | 'intro'
  | 'prefight'
  | 'fight'
  | 'postfight'
  | 'postintro'
  | 'win';

interface Fighter {
  characterId:  string;
  hp:           number;   // текущее HP
  maxHp:        number;
  side:         'left' | 'right';
  tapBoost:     number;   // накопленный тап-буст (сбрасывается после применения)
}

interface BetState {
  leftOdds:   number;   // коэффициент на левого (например, 1.5)
  rightOdds:  number;   // коэффициент на правого
  playerBet:  { side: 'left' | 'right'; amount: number } | null;
}

interface GameState {
  scene:           Scene;
  balance:         number;
  round:           number;
  usedCharacterIds: string[];   // уже дрались
  fighters:        [Fighter, Fighter] | null;
  bet:             BetState | null;
  dialogStep:      number;
  fightResult:     { winner: 'left' | 'right'; payout: number } | null;
  adminSocketId:   string | null;
}

// === WebSocket события ===

// Сервер → Все клиенты
type ServerEvent =
  | { type: 'state_sync';  state: GameState }
  | { type: 'tap_effect';  side: 'left' | 'right'; x: number; y: number; phrase: string }
  | { type: 'attack_anim'; attacker: 'left' | 'right'; damage: number }
  | { type: 'money_delta'; delta: number; newBalance: number };

// Клиент → Сервер
type ClientEvent =
  | { type: 'tap';          side: 'left' | 'right'; x: number; y: number }
  | { type: 'admin_action'; action: AdminAction }
  | { type: 'place_bet';    side: 'left' | 'right'; amount: number };

type AdminAction =
  | 'enter_club'         // landing → intro
  | 'next_dialogue'      // advance dialog step
  | 'start_fight'        // prefight → fight
  | 'next_round'         // postfight → intro (или win)
  | 'close_win_screen';  // закрыть финальный экран
```

---

## 5. Backend API и WebSocket-протокол

### HTTP эндпоинты

| Метод | Путь | Ответ | Описание |
|-------|------|-------|----------|
| `GET` | `/` | `index.html` | Главная страница игры |
| `GET` | `/admin` | `index.html?role=admin` | То же, но клиент получает admin-токен |
| `GET` | `/state` | `GameState` (JSON) | Текущее состояние (для reconnect) |

### Socket.IO события

```typescript
// server.js — обработка событий

io.on('connection', (socket) => {
  const isAdmin = socket.handshake.query.role === 'admin';
  if (isAdmin && !gameState.adminSocketId) {
    gameState.adminSocketId = socket.id;
  }

  // При подключении — немедленный sync текущего состояния
  socket.emit('state_sync', { state: gameState });

  socket.on('tap', (data: { side: 'left'|'right'; x: number; y: number }) => {
    if (!gameState.fighters || gameState.scene !== 'fight') return;
    const fighter = gameState.fighters.find(f => f.side === data.side);
    if (fighter) fighter.tapBoost += 1;

    const phrase = pickTapPhrase();
    io.emit('tap_effect', { side: data.side, x: data.x, y: data.y, phrase });
  });

  socket.on('admin_action', (data: { action: AdminAction }) => {
    if (socket.id !== gameState.adminSocketId) return; // только admin
    handleAdminAction(data.action);
    io.emit('state_sync', { state: gameState });
  });

  socket.on('place_bet', (data: { side: 'left'|'right'; amount: number }) => {
    if (socket.id !== gameState.adminSocketId) return;
    if (!gameState.bet || gameState.scene !== 'prefight') return;
    if (data.amount > gameState.balance) return;
    gameState.bet.playerBet = { side: data.side, amount: data.amount };
    io.emit('state_sync', { state: gameState });
  });

  socket.on('disconnect', () => {
    if (socket.id === gameState.adminSocketId) {
      gameState.adminSocketId = null;
    }
  });
});
```

### Игровой цикл (fight loop)

```typescript
// server.js — запускается при переходе в сцену 'fight'

const FIGHT_TICK_MS = 100;  // 10 раз в секунду

function startFightLoop() {
  const interval = setInterval(() => {
    if (gameState.scene !== 'fight') {
      clearInterval(interval);
      return;
    }

    const [left, right] = gameState.fighters!;
    processFighterAttack(left, right);
    processFighterAttack(right, left);

    io.emit('state_sync', { state: gameState });

    if (left.hp <= 0 || right.hp <= 0) {
      clearInterval(interval);
      resolveFight();
    }
  }, FIGHT_TICK_MS);
}

function processFighterAttack(attacker: Fighter, target: Fighter) {
  const def = getCharacterDef(attacker.characterId);
  const baseInterval = computeAttackInterval(def.stats);      // мс
  const boostedInterval = applyTapBoost(baseInterval, attacker.tapBoost);
  attacker.tapBoost = 0;  // сброс после применения

  attacker._msSinceLastAttack = (attacker._msSinceLastAttack ?? 0) + FIGHT_TICK_MS;
  if (attacker._msSinceLastAttack >= boostedInterval) {
    attacker._msSinceLastAttack = 0;
    const damage = computeDamage(def.stats);
    target.hp = Math.max(0, target.hp - damage);
    io.emit('attack_anim', { attacker: attacker.side, damage });
  }
}
```

---

## 6. Игровой движок — алгоритмы

### Вычисление HP

```typescript
// src/engine/combat.ts

export function computeMaxHp(stats: CharacterStats): number {
  // Эндуранс масштабирует HP от 80 до 150
  return Math.round(80 + (stats.endurance - 1) * (70 / 9));
}
```

### Вычисление интервала атаки

```typescript
export function computeAttackInterval(stats: CharacterStats): number {
  // Базовый интервал 3000мс; уменьшается до 800мс при agility=10
  const base = 3000;
  const min  = 800;
  return Math.round(base - (stats.agility - 1) * ((base - min) / 9));
}
```

### Тап-буст

```typescript
export function applyTapBoost(baseInterval: number, tapBoost: number): number {
  // Каждый тап уменьшает следующий интервал на 5%, но не ниже 50% базового
  const reduction = Math.min(tapBoost * 0.05, 0.5);
  return Math.round(baseInterval * (1 - reduction));
}
```

### Вычисление урона

```typescript
export function computeDamage(stats: CharacterStats): number {
  // Урон = strength * 3 + random(0, agility)
  const base = stats.strength * 3;
  const bonus = Math.floor(Math.random() * (stats.agility + 1));
  return base + bonus;
}
```

### Вычисление коэффициентов ставок

```typescript
export function computeOdds(
  statsLeft: CharacterStats,
  statsRight: CharacterStats
): { leftOdds: number; rightOdds: number } {
  // "Сила бойца" = взвешенная сумма: сила*0.4 + ловкость*0.3 + выносливость*0.3
  const power = (s: CharacterStats) =>
    s.strength * 0.4 + s.agility * 0.3 + s.endurance * 0.3;

  const pl = power(statsLeft);
  const pr = power(statsRight);
  const total = pl + pr;

  // Коэффициент обратно пропорционален вероятности победы
  // Фаворит получает коэффициент < 2, андердог > 2
  const probLeft = pl / total;
  const probRight = pr / total;

  return {
    leftOdds:  parseFloat((1 / probLeft).toFixed(2)),
    rightOdds: parseFloat((1 / probRight).toFixed(2)),
  };
}
```

### Выплата ставки

```typescript
export function computePayout(
  bet: { side: 'left' | 'right'; amount: number },
  winner: 'left' | 'right',
  odds: { leftOdds: number; rightOdds: number }
): number {
  if (bet.side !== winner) return -bet.amount;
  const coeff = bet.side === 'left' ? odds.leftOdds : odds.rightOdds;
  return Math.round(bet.amount * coeff - bet.amount); // чистая прибыль
}
```

### Тап-фразы

```typescript
// src/data/tapPhrases.ts
export const TAP_PHRASES = [
  'БЕЙ!', 'ТАК ЕГО!', 'СИЛЬНЕЕ!', 'НЕ СДАВАЙСЯ!',
  'ДАВАЙ!', 'ВПЕРЁД!', 'КРУШИ!', 'МОЛОДЕЦ!', 'ЕЩЁ!',
];

export function pickTapPhrase(): string {
  return TAP_PHRASES[Math.floor(Math.random() * TAP_PHRASES.length)];
}
```

---

## 7. Frontend — экраны и компоненты

### Роутинг

Нет URL-роутинга. SceneManager управляет показом/скрытием Canvas-слоя и DOM-overlay'ев.

```
landing       → LandingScene
intro         → IntroScene
prefight      → PreFightScene
fight         → FightScene
postfight     → PostFightScene (fatality → деньги)
postintro     → PostIntroScene (Качер раздаёт 100к)
win           → WinScene
```

### LandingScene

```
┌─────────────────────────────────────────────────┐
│  [фоновый арт клуба снаружи]                    │
│                                                  │
│              [ДВЕРЬ — спрайт 400×600]            │
│         (hover → door_open + надпись)            │
│                                                  │
│  [кнопка УЙТИ]                                  │
│  (полупрозрачная, слева)                         │
└─────────────────────────────────────────────────┘
```

Кнопка "УЙТИ" — только у admin. У зрителей показывается текст "Ожидание...".

```typescript
// src/scenes/LandingScene.ts

export class LandingScene {
  private doorHovered = false;

  mount(canvas: HTMLCanvasElement, isAdmin: boolean) {
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.doorHovered = isDoorHitbox(x, y, canvas.width, canvas.height);
    });

    canvas.addEventListener('click', (e) => {
      if (!isAdmin) return;
      const rect = canvas.getBoundingClientRect();
      if (isDoorHitbox(e.clientX - rect.left, e.clientY - rect.top, canvas.width, canvas.height)) {
        socket.emit('admin_action', { action: 'enter_club' });
      }
    });
  }

  render(ctx: CanvasRenderingContext2D, assets: AssetMap) {
    ctx.drawImage(assets.bg_club_exterior, 0, 0);
    const doorAnim = this.doorHovered ? 'door_open' : 'door_idle';
    // анимация дверей через AnimationController
    animationController.render(ctx, 'door', doorAnim, DOOR_X, DOOR_Y);

    if (this.doorHovered) {
      ctx.font = '24px fighter';
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center';
      ctx.fillText('Войти в бойцовский клуб?', canvas.width / 2, DOOR_Y - 20);
    }
  }
}

function isDoorHitbox(x: number, y: number, w: number, h: number): boolean {
  // Дверь центрирована по горизонтали, занимает 25% ширины, вертикаль 20–90%
  const doorLeft  = w * 0.375;
  const doorRight = w * 0.625;
  const doorTop   = h * 0.20;
  const doorBot   = h * 0.90;
  return x >= doorLeft && x <= doorRight && y >= doorTop && y <= doorBot;
}
```

### IntroScene

Два персонажа выплывают слева и справа (CSS translateX анимация поверх Canvas).
Диалог продвигается кнопкой "Далее" (только admin).

```
┌─────────────────────────────────────────────────┐
│  [арт арены / клуба — фон]                      │
│                                                  │
│  [КАЧЕР]          ┌──────────┐    [ЖЕКА]        │
│  спрайт idle      │ "Ты      │    спрайт idle   │
│                   │  пидор"  │                   │
│                   └──────────┘                   │
│                              [Далее ▶] (admin)   │
└─────────────────────────────────────────────────┘
```

Диалоги захардкожены в `src/data/dialogues.ts`:

```typescript
// src/data/dialogues.ts

export interface DialogueLine {
  speaker: 'left' | 'right';
  text: string;
}

export const TUTORIAL_INTRO: DialogueLine[] = [
  { speaker: 'left',  text: 'Ты пидор' },
  { speaker: 'right', text: 'Нет, ты пидор' },
  { speaker: 'left',  text: 'Давай драться?' },
  { speaker: 'right', text: 'Давай!' },
];

export const TUTORIAL_POSTFIGHT: DialogueLine[] = [
  { speaker: 'left',  text: 'Ох, хорошо подрались' },
  { speaker: 'right', text: 'Да, размялись хорошо' },
  { speaker: 'left',  text: 'Ну пошли в клуб' },
  // right уходит (анимация exit_right)
  { speaker: 'left',  text: 'Кстати, а я рассказывал, что по ночам сдавал наш офис под хостел? Вот 100к заработал, берите, мне не жалко!' },
  // left уходит (анимация exit_left)
  // появляется счётчик + 100к
];
```

### PreFightScene

```
┌─────────────────────────────────────────────────────────────┐
│  [КАЧЕР]                               [ЖЕКА]               │
│  character_sheet.png                   character_sheet.png  │
│  ┌────────────────────┐                ┌──────────────────┐ │
│  │ Сила:       8      │                │ Сила:       5    │ │
│  │ Ловкость:   6      │                │ Ловкость:   9    │ │
│  │ Выносливость: 7    │                │ Выносливость: 4  │ │
│  │ Интеллект:  3      │                │ Интеллект:  8    │ │
│  │ Мудрость:   2      │                │ Мудрость:   7    │ │
│  │ Харизма:    9      │                │ Харизма:    6    │ │
│  └────────────────────┘                └──────────────────┘ │
│                                                             │
│               💰 Баланс: 1 000 ₽                           │
│                                                             │
│          КАЧЕР 1:3         ЖЕКА 1:1.5                       │
│                                                             │
│    [КАЧЕР ▼]  [ 500 ₽ ] ←поле ввода→  [ЖЕКА ▼]           │
│                                                             │
│                    [  БОЙ!  ]                               │
└─────────────────────────────────────────────────────────────┘
```

Поле ввода и кнопки — только у admin (DOM overlay поверх Canvas).

### FightScene

```
┌─────────────────────────────────────────────────────────────┐
│  [КАЧЕР]  ████████████████░░░  VS  ░████████████████ [ЖЕКА] │
│           HP: 87/120                    HP: 65/80           │
│                                                             │
│  [спрайт idle/attack]    [анимированный фон]   [спрайт]    │
│                                                             │
│  (зрители тапают в левую                                    │
│   или правую половину экрана)                               │
│                                                             │
│  "БЕЙ!" ← всплывает там, где тапнули                       │
└─────────────────────────────────────────────────────────────┘
```

Логика тапа:

```typescript
// src/scenes/FightScene.ts

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top)  / rect.height;
  const side: 'left' | 'right' = x < 0.5 ? 'left' : 'right';

  socket.emit('tap', {
    side,
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  });
});

// При получении tap_effect от сервера:
socket.on('tap_effect', (data) => {
  tapEffects.push({ phrase: data.phrase, x: data.x, y: data.y, ttl: 800 });
});
```

### WinScene

```
┌─────────────────────────────────────────────────┐
│                                                  │
│            🏆 ВЫ ВЫИГРАЛИ! 🏆                   │
│                                                  │
│              💰 42 500 ₽                        │
│                                                  │
│              [ Закрыть ]                         │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## 8. Система персонажей

```typescript
// src/data/characters.ts
// ⚠️ Характеристики — ЗАПОЛНИТЬ ВРУЧНУЮ

import type { CharacterDef } from '../types';

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'kacher',
    name: 'Качер',
    catchphrase: 'Кто тут ещё не попробовал моих кулаков?',
    stats: {
      strength:    0, // TODO: заполнить
      agility:     0,
      endurance:   0,
      intelligence: 0,
      wisdom:      0,
      charisma:    0,
    },
  },
  {
    id: 'zheka',
    name: 'Жека',
    catchphrase: 'Бью первым, думаю потом.',
    stats: { strength: 0, agility: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0 },
  },
  {
    id: 'romzan',
    name: 'Ромзан Безумный',
    catchphrase: 'Я дерусь как я дышу — хаотично.',
    stats: { strength: 0, agility: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0 },
  },
  {
    id: 'kolyan',
    name: 'Колян Лето',
    catchphrase: 'Лето, жара, кулак в рыло.',
    stats: { strength: 0, agility: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0 },
  },
  {
    id: 'tonik',
    name: 'Тоник',
    catchphrase: 'Освежи меня, если сможешь.',
    stats: { strength: 0, agility: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0 },
  },
  {
    id: 'makaroni',
    name: 'Евгений Макаронни',
    catchphrase: 'Аль денте — так и мои удары.',
    stats: { strength: 0, agility: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0 },
  },
  {
    id: 'durov',
    name: 'Евгений Дуров',
    catchphrase: 'Каналы закрываю, челюсти ломаю.',
    stats: { strength: 0, agility: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0 },
  },
  {
    id: 'ohrenenny',
    name: 'Евгений Охрененский',
    catchphrase: 'Говорят, я охренительный. Сейчас проверим.',
    stats: { strength: 0, agility: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0 },
  },
  {
    id: 'nikitos',
    name: 'Никитос',
    catchphrase: 'Маленький, да удаленький.',
    stats: { strength: 0, agility: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0 },
  },
  {
    id: 'biba',
    name: 'Биба',
    catchphrase: 'Где Боба, там и я — и вдвойне больней.',
    stats: { strength: 0, agility: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0 },
  },
  {
    id: 'boba',
    name: 'Боба',
    catchphrase: 'Где Биба, там и я. Он уже проиграл.',
    stats: { strength: 0, agility: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0 },
  },
  {
    id: 'novichek',
    name: 'Саша Новичёк',
    catchphrase: 'Соприкосновение со мной — необратимо.',
    stats: { strength: 0, agility: 0, endurance: 0, intelligence: 0, wisdom: 0, charisma: 0 },
  },
];

// Качер и Жека зарезервированы для туториала — не попадают в рандомный пул
export const TUTORIAL_FIGHTERS = ['kacher', 'zheka'] as const;

export function getAvailablePool(usedIds: string[]): CharacterDef[] {
  return CHARACTERS.filter(
    c => !usedIds.includes(c.id) && !TUTORIAL_FIGHTERS.includes(c.id as any)
  );
}

export function pickRandomPair(usedIds: string[]): [CharacterDef, CharacterDef] {
  const pool = getAvailablePool(usedIds);
  if (pool.length < 2) throw new Error('Not enough characters left');
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}

export function getCharacterDef(id: string): CharacterDef {
  const c = CHARACTERS.find(c => c.id === id);
  if (!c) throw new Error(`Unknown character: ${id}`);
  return c;
}
```

---

## 9. Анимационная система

Каждый персонаж — набор спрайт-шитов (одна PNG на состояние).
Спрайты сделаны так что всегда смотрят вправо!

```typescript
// src/engine/SpriteSheet.ts

export interface SpriteSheetConfig {
  image:       HTMLImageElement;
  frameWidth:  number;
  frameHeight: number;
  frameCount:  number;
  fps:         number;       // скорость анимации
  loop:        boolean;
  onComplete?: () => void;   // вызывается когда loop=false и анимация закончилась
}

export class SpriteSheet {
  private frame = 0;
  private elapsed = 0;
  private done = false;

  constructor(private config: SpriteSheetConfig) {}

  update(deltaMs: number) {
    if (this.done) return;
    this.elapsed += deltaMs;
    const frameDuration = 1000 / this.config.fps;
    if (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration;
      this.frame++;
      if (this.frame >= this.config.frameCount) {
        if (this.config.loop) {
          this.frame = 0;
        } else {
          this.frame = this.config.frameCount - 1;
          this.done = true;
          this.config.onComplete?.();
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, x: number, y: number, scaleX = 1) {
    const { image, frameWidth, frameHeight } = this.config;
    ctx.save();
    if (scaleX < 0) {
      ctx.translate(x + frameWidth, y);
      ctx.scale(-1, 1);
      ctx.drawImage(image, this.frame * frameWidth, 0, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
    } else {
      ctx.drawImage(image, this.frame * frameWidth, 0, frameWidth, frameHeight, x, y, frameWidth, frameHeight);
    }
    ctx.restore();
  }
}
```

### Состояния анимации персонажа

| Состояние | Файл | loop | Триггер |
|-----------|------|------|---------|
| `idle` | `idle.png` | ✅ | по умолчанию |
| `attack` | `attack.png` | ❌ | при нанесении удара → `onComplete` возвращает в idle |
| `beaten` | `beaten.png` | ❌ | когда HP=0 (проигравший) |
| `winner` | `winner.png` | ✅ | победитель во время fatality |
| `fatality` | `fatality.png` | ❌ | победитель, сразу после HP=0 |

### Анимация атаки (движение спрайта к оппоненту)

```typescript
// src/scenes/FightScene.ts — при получении события attack_anim

socket.on('attack_anim', (data: { attacker: 'left'|'right'; damage: number }) => {
  const attacker = data.attacker === 'left' ? leftFighter : rightFighter;
  const target   = data.attacker === 'left' ? rightFighter : leftFighter;

  // Переключить на attack анимацию
  attacker.setState('attack');

  // Рывок к оппоненту (+/- 80px) за 150мс, потом назад
  const dir = data.attacker === 'left' ? 1 : -1;
  tweenX(attacker, attacker.baseX + dir * 80, 150, 'easeOut').then(() => {
    tweenX(attacker, attacker.baseX, 150, 'easeIn');
  });

  // Эффект удара на позиции target
  hitEffects.push({ x: target.x, y: target.y, ttl: 300 });

  // Уменьшить HP bar
  target.hp = Math.max(0, target.hp - data.damage);
});
```

---

## 10. Список ассетов

### Спрайты — двери
По сути это входная дверь в клуб.

| Файл | Формат | Кадры | Размер кадра | Описание |
|------|--------|-------|-------------|----------|
| `assets/sprites/door/door_idle/` | PNG спрайт-лист | 100 | 1920x1080 | Дверь стоит, мигает свет |
| `assets/sprites/door/door_open/` | PNG спрайт-лист | 46 | 1920x1080 | Дверь открывается |

### Спрайты — персонажи (×12 персонажей)

Для каждого персонажа нужны следующие файлы в папке `public/assets/sprites/characters/{id}/`:

| Файл | Кадры | Размер кадра | Описание |
|------|-------|-------------|----------|
| `assets/sprites/characters/kacher/idle` | N | 960x540 | Стойка, покачивание |
| `assets/sprites/characters/kacher/attack` | N | 960x540 | Удар (замах → контакт → возврат) |
| `assets/sprites/characters/kacher/beaten` | N | 960x540 | Падение/нокаут |
| `assets/sprites/characters/kacher/winner` | N | 960x540 | Победная анимация (прыжок, жест) |
| `assets/sprites/characters/kacher/fatality` | N | 960x540 | Добивание — максимально нелепое |
| `assets/sprites/characters/kacher/character_sheet.png` | 1 | 1024x1024 | Портрет для PreFight экрана |

**Итого спрайтов персонажей: 12 × 5 = 72 папки с спрайтами + 1 изображение**

Персонажи правой стороны рендерятся зеркально (scaleX=-1) — отдельный флипнутый спрайт **не нужен**.

### Фоны

| Файл | Формат | Описание |
|------|--------|----------|
| `backgrounds/club_exterior.png` | PNG 1920×1080 | Снаружи клуба, ночь, неоновые вывески |
| `backgrounds/fight_arena/bg_frame_0.png` | PNG 1920×1080 | Кадр 0 анимированной арены |
| `backgrounds/fight_arena/bg_frame_1.png` | PNG 1920×1080 | Кадр 1 |
| `backgrounds/fight_arena/bg_frame_2.png` | PNG 1920×1080 | Кадр 2 |
| `backgrounds/fight_arena/bg_frame_3.png` | PNG 1920×1080 | Кадр 3 (зрители, факелы) |
| `backgrounds/intro_bg.png` | PNG 1920×1080 | Фон для диалоговых сцен |

### Аудио

| Файл | Длина | Описание |
|------|-------|----------|
| `bg_club.mp3` | loop | Эмбиент снаружи клуба |
| `bg_fight.mp3` | loop | Боевая музыка |
| `hit_1.mp3` | ~0.2с | Удар кулаком |
| `hit_2.mp3` | ~0.2с | Удар кулаком (вариация) |
| `fatality.mp3` | ~3с | Звук добивания |
| `crowd_cheer.mp3` | ~2с | Крики толпы при победе |
| `money_coins.mp3` | ~1с | Звук начисления денег |
| `door_open.mp3` | ~0.5с | Скрип двери |

### Шрифты

| Файл | Описание |
|------|----------|
| `fonts/PressStart2P-Regular.ttf` | Пиксельный / боевой шрифт для всего UI |

**Рекомендация:** Press Start 2P (Google Fonts, свободный) отлично подойдёт.

### Эффекты

| Файл | Кадры | Размер кадра | Описание |
|------|-------|-------------|----------|
| `effects/hit_effect.png` | 6 | 100×100 | Вспышка при ударе |
| `effects/money_effect.png` | 8 | 150×100 | Летящие монетки при начислении |

---

## 11. Архитектурные решения

### Canvas вместо DOM-анимаций

**Проблема:** Анимации спрайтов (60 fps, попиксельное управление) невозможно сделать красиво через CSS/DOM.

**Решение:** Canvas 2D API для всего игрового рендера. DOM-оверлеи только для интерактивных UI-элементов (поле ввода ставки, кнопки admin).

**Причина:** Полный контроль над рендером, нет layout thrashing, простое масштабирование под разные экраны через `canvas.scale()`.

---

### Игровой loop на сервере

**Проблема:** Если tick-логика на клиенте — разные клиенты увидят разные состояния боя из-за рассинхрона.

**Решение:** Все вычисления урона и HP — строго на сервере. Клиенты только рендерят полученный `GameState`.

**Причина:** Гарантированная синхронизация картинки на всех устройствах.

---

### Без персистентности

**Проблема (не проблема):** Игра одноразовая, проводится один раз.

**Решение:** Весь GameState в памяти Node.js-процесса. При перезапуске сервера игра сбрасывается.

**Причина:** Zero complexity. SQLite здесь избыточен.

---

### Responsive canvas

```typescript
// src/engine/Canvas.ts

export function resizeCanvas(canvas: HTMLCanvasElement) {
  const DESIGN_W = 1280;
  const DESIGN_H = 720;

  const scaleX = window.innerWidth  / DESIGN_W;
  const scaleY = window.innerHeight / DESIGN_H;
  const scale  = Math.min(scaleX, scaleY);

  canvas.style.width  = `${DESIGN_W * scale}px`;
  canvas.style.height = `${DESIGN_H * scale}px`;
  canvas.width  = DESIGN_W;
  canvas.height = DESIGN_H;
}

window.addEventListener('resize', () => resizeCanvas(mainCanvas));
```

Это обеспечивает корректное отображение и на проекторе 1920×1080, и на смартфоне 390×844.

---

### Admin-аутентификация

**Проблема:** Нет настоящей auth — это игра для одного вечера.

**Решение:** Admin-роль определяется query-параметром `?role=admin`. Первый подключившийся с этим параметром становится admin.

**Известное ограничение:** Если кто-то угадает URL с `?role=admin` — перехватит управление. Для вечеринки приемлемо.

---

## 12. Запуск

```bash
#!/usr/bin/env bash
# launch.sh

set -e

check() { command -v "$1" &>/dev/null || { echo "❌ $1 не найден"; exit 1; }; }
check node
check pnpm

echo "📦 Установка зависимостей..."
pnpm install

echo "🏗️  Сборка фронтенда..."
pnpm build

echo "🚀 Запуск сервера..."
NODE_ENV=production node server.js &
SERVER_PID=$!

echo "✅ Сервер запущен на http://localhost:${PORT:-3000}"
echo "🎮 Admin URL: http://localhost:${PORT:-3000}/?role=admin"
echo "👥 Игроки: http://$(hostname -I | awk '{print $1}'):${PORT:-3000}/"
echo ""
echo "Ctrl+C для остановки"

trap "kill $SERVER_PID 2>/dev/null; echo 'Сервер остановлен'" INT TERM
wait $SERVER_PID
```

```bash
# Режимы запуска:
./launch.sh                     # prod, порт 3000
PORT=8080 ./launch.sh           # другой порт
pnpm dev                        # dev-режим с HMR (vite dev server + nodemon)
```

```json
// package.json scripts
{
  "scripts": {
    "dev":   "concurrently \"nodemon server.js\" \"vite\"",
    "build": "vite build",
    "start": "node server.js",
    "test":  "vitest run"
  }
}
```

---

## 13. Тесты

```typescript
// tests/engine.test.ts
import { describe, it, expect } from 'vitest';
import { computeMaxHp, computeAttackInterval, computeDamage, computeOdds, applyTapBoost } from '../src/engine/combat';

const weakStats  = { strength: 1, agility: 1, endurance: 1, intelligence: 1, wisdom: 1, charisma: 1 };
const strongStats = { strength: 10, agility: 10, endurance: 10, intelligence: 10, wisdom: 10, charisma: 10 };

describe('computeMaxHp', () => {
  it('минимум при endurance=1', () => expect(computeMaxHp(weakStats)).toBe(80));
  it('максимум при endurance=10', () => expect(computeMaxHp(strongStats)).toBe(150));
});

describe('computeAttackInterval', () => {
  it('медленнее при agility=1', () => expect(computeAttackInterval(weakStats)).toBe(3000));
  it('быстрее при agility=10', () => expect(computeAttackInterval(strongStats)).toBe(800));
  it('значение в диапазоне [800, 3000]', () => {
    for (let a = 1; a <= 10; a++) {
      const interval = computeAttackInterval({ ...weakStats, agility: a });
      expect(interval).toBeGreaterThanOrEqual(800);
      expect(interval).toBeLessThanOrEqual(3000);
    }
  });
});

describe('applyTapBoost', () => {
  it('0 тапов — интервал не изменился', () => expect(applyTapBoost(3000, 0)).toBe(3000));
  it('10 тапов — интервал уменьшился на 50%', () => expect(applyTapBoost(3000, 10)).toBe(1500));
  it('100 тапов — интервал не ниже 50%', () => expect(applyTapBoost(3000, 100)).toBe(1500));
});

describe('computeOdds', () => {
  it('коэффициенты симметричны при равных характеристиках', () => {
    const { leftOdds, rightOdds } = computeOdds(weakStats, weakStats);
    expect(leftOdds).toBeCloseTo(rightOdds, 1);
  });
  it('слабый боец получает бо́льший коэффициент', () => {
    const { leftOdds, rightOdds } = computeOdds(weakStats, strongStats);
    expect(leftOdds).toBeGreaterThan(rightOdds);
  });
});
```

```typescript
// tests/characters.test.ts
import { describe, it, expect } from 'vitest';
import { CHARACTERS, getAvailablePool, pickRandomPair, TUTORIAL_FIGHTERS } from '../src/data/characters';

describe('characters pool', () => {
  it('всего 12 персонажей', () => expect(CHARACTERS).toHaveLength(12));

  it('у каждого персонажа уникальный id', () => {
    const ids = CHARACTERS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('пул исключает туториальных персонажей', () => {
    const pool = getAvailablePool([]);
    const ids = pool.map(c => c.id);
    for (const tutId of TUTORIAL_FIGHTERS) {
      expect(ids).not.toContain(tutId);
    }
  });

  it('pickRandomPair не возвращает одного и того же персонажа дважды', () => {
    const [a, b] = pickRandomPair([]);
    expect(a.id).not.toBe(b.id);
  });

  it('pickRandomPair исключает уже использованных', () => {
    const usedIds = CHARACTERS.slice(0, 8).map(c => c.id);
    const [a, b] = pickRandomPair(usedIds);
    expect(usedIds).not.toContain(a.id);
    expect(usedIds).not.toContain(b.id);
  });

  it('бросает ошибку когда персонажей недостаточно', () => {
    const usedIds = CHARACTERS.filter(c => !TUTORIAL_FIGHTERS.includes(c.id as any)).map(c => c.id).slice(0, -1);
    expect(() => pickRandomPair(usedIds)).toThrow();
  });
});
```

---

## 14. README

```markdown
# 🥊 Бойцовский Клуб 8 Марта

Браузерный файтинг-кликер для корпоратива. Один экран на проектор,
зрители подключаются со смартфонов и болеют за своих бойцов тапами.

## Требования

- Node.js 20+
- pnpm (`npm install -g pnpm`)

## Быстрый старт

```bash
git clone <repo>
cd fighting-club
pnpm install
pnpm build
node server.js
```

Откройте в браузере:
- **Admin (проектор):** `http://localhost:3000/?role=admin`
- **Зрители (смартфоны):** `http://<ваш-IP>:3000/`

## Как добавить ассеты

Положите PNG-спрайты в `public/assets/sprites/characters/{id}/`.
Требуемые файлы: `idle.png`, `attack.png`, `beaten.png`, `winner.png`, `fatality.png`, `character_sheet.png`.

## Как заполнить характеристики персонажей

Откройте `src/data/characters.ts` и заполните поля `stats` для каждого персонажа.
Все значения от 1 до 10.

## Запуск тестов

```bash
pnpm test
```
```

---

## 15. Release Notes v0.1.0

### Новые возможности

- Полный игровой цикл: Landing → Intro → PreFight → Fight → PostFight → Win
- Туториальный бой Качер vs Жека с диалогами и бонусом 100к
- Автоматический рандомный выбор пар из 10 оставшихся персонажей
- Real-time синхронизация через Socket.IO — все видят одну картинку
- Тап-механика для зрителей со смартфонов
- Система ставок с коэффициентами на основе характеристик
- Fatality-анимация победителя
- Анимированный счётчик баланса

### Известные ограничения

- Admin-аутентификация через query param — не для продакшена
- Характеристики персонажей нужно заполнить вручную
- Все ассеты (спрайты, аудио) нужно создать/найти самостоятельно
- Нет персистентности: перезапуск сервера сбрасывает игру

### Планы v0.2.0

- Генерация спрайтов через Midjourney / DALL-E
- Настраиваемый начальный баланс через admin-панель
- История ставок с таблицей результатов
- Мобильный UI для admin (сейчас только desktop)
- Звуковые эффекты и фоновая музыка
