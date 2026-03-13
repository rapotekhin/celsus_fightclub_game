// === Характеристики персонажа ===
export interface CharacterStats {
  strength: number;    // 1–10, влияет на урон
  agility: number;     // 1–10, влияет на скорость атаки
  endurance: number;   // 1–10, влияет на максимальное HP
  intelligence: number; // 1–10, декоративно
  wisdom: number;      // 1–10, декоративно
  charisma: number;    // 1–10, декоративно
}

export interface CharacterDef {
  id: string;
  name: string;
  stats: CharacterStats;
  catchphrase: string;
}

// === Сцены ===
export type Scene =
  | 'landing'
  | 'intro'
  | 'prefight'
  | 'fight'
  | 'postfight'
  | 'postintro'
  | 'win';

// === Игровое состояние ===
export interface Fighter {
  characterId: string;
  hp: number;
  maxHp: number;
  side: 'left' | 'right';
  tapBoost: number;
  /** Current attack interval in ms (sent by server, used to sync animation speed) */
  attackInterval?: number;
}

export interface BetState {
  leftOdds: number;
  rightOdds: number;
  playerBet: { side: 'left' | 'right'; amount: number } | null;
}

export interface GameState {
  scene: Scene;
  balance: number;
  round: number;
  usedCharacterIds: string[];
  fighters: [Fighter, Fighter] | null;
  bet: BetState | null;
  dialogStep: number;
  fightResult: { winner: 'left' | 'right'; payout: number } | null;
  adminSocketId: string | null;
}

// === Admin actions ===
export type AdminAction =
  | 'enter_club'
  | 'next_dialogue'
  | 'start_prefight'
  | 'start_fight'
  | 'next_round'
  | 'close_win_screen'
  | 'set_game_params';

// === WebSocket события: Сервер → Клиент ===
export type ServerEvent =
  | { type: 'state_sync'; state: GameState }
  | { type: 'tap_effect'; side: 'left' | 'right'; x: number; y: number; phrase: string }
  | { type: 'attack_hit'; attacker: 'left' | 'right'; damage: number }
  | { type: 'money_delta'; delta: number; newBalance: number };

// === WebSocket события: Клиент → Сервер ===
export type ClientEvent =
  | { type: 'tap'; side: 'left' | 'right'; x: number; y: number }
  | { type: 'admin_action'; action: AdminAction; params?: { balance?: number } }
  | { type: 'place_bet'; side: 'left' | 'right'; amount: number };
