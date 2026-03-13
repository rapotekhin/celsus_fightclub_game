import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import gameConfig from './gameConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

const PORT = process.env.PORT || 3000;

// ========================
// CHARACTER DATA (mirrored from src/data/characters.ts)
// ========================

const CHARACTERS = [
  { id: 'kacher', name: 'Качер', stats: { strength: 10, agility: 5, endurance: 10, intelligence: 1, wisdom: 10, charisma: 10 } },
  { id: 'zheka', name: 'Жека', stats: { strength: 5, agility: 5, endurance: 5, intelligence: 10, wisdom: 10, charisma: 10 } },
  { id: 'kolyan', name: 'Колян Лето', stats: { strength: 8, agility: 5, endurance: 4, intelligence: 4, wisdom: 4, charisma: 5 } },
  { id: 'tonik', name: 'Тоник', stats: { strength: 7, agility: 5, endurance: 6, intelligence: 5, wisdom: 5, charisma: 8 } },
  { id: 'makaroni', name: 'Евгений Макаронни', stats: { strength: 6, agility: 6, endurance: 6, intelligence: 6, wisdom: 6, charisma: 6 } },
  { id: 'ohrenenny', name: 'Евгений Охрененский', stats: { strength: 2, agility: 9, endurance: 6, intelligence: 9, wisdom: 6, charisma: 6 } },
];

const TUTORIAL_FIGHTERS = ['kacher', 'zheka'];

// Characters with available sprites
const CHARACTERS_WITH_SPRITES = ['kacher', 'zheka', 'kolyan', 'makaroni', 'ohrenenny', 'tonik'];

function getCharacterDef(id) {
  const c = CHARACTERS.find((ch) => ch.id === id);
  if (!c) throw new Error(`Unknown character: ${id}`);
  return c;
}

function getAvailablePool(usedIds) {
  return CHARACTERS.filter(
    (c) =>
      !usedIds.includes(c.id) &&
      CHARACTERS_WITH_SPRITES.includes(c.id)
  );
}

function pickRandomPair(usedIds) {
  const pool = getAvailablePool(usedIds);
  if (pool.length < 2) return null;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}

// ========================
// COMBAT ENGINE (uses gameConfig)
// ========================

function computeMaxHp(stats) {
  return Math.round(gameConfig.BASE_HP + (stats.endurance - 1) * gameConfig.HP_PER_ENDURANCE);
}

function computeAttackInterval(stats) {
  const base = gameConfig.BASE_ATTACK_INTERVAL_MS;
  const min = gameConfig.MIN_ATTACK_INTERVAL_MS;
  return Math.round(base - (stats.agility - 1) * ((base - min) / 9));
}

function applyTapBoost(baseInterval, tapBoost) {
  const reduction = Math.min(tapBoost * gameConfig.TAP_BOOST_PER_TAP, gameConfig.TAP_BOOST_MAX_REDUCTION);
  return Math.round(baseInterval * (1 - reduction));
}

function computeDamage(stats) {
  const base = stats.strength * gameConfig.DAMAGE_STRENGTH_MULTIPLIER;
  const bonus = Math.floor(Math.random() * (stats.agility * gameConfig.DAMAGE_AGILITY_BONUS_MULTIPLIER + 1));
  return base + bonus;
}

function computeOdds(statsLeft, statsRight) {
  const power = (s) =>
    s.strength * gameConfig.ODDS_STRENGTH_WEIGHT +
    s.agility * gameConfig.ODDS_AGILITY_WEIGHT +
    s.endurance * gameConfig.ODDS_ENDURANCE_WEIGHT;
  const pl = power(statsLeft);
  const pr = power(statsRight);
  const total = pl + pr;
  const probLeft = pl / total;
  const probRight = pr / total;
  return {
    leftOdds: parseFloat((1 / probLeft).toFixed(2)),
    rightOdds: parseFloat((1 / probRight).toFixed(2)),
  };
}

function computePayout(bet, winner, odds) {
  if (bet.side !== winner) return -bet.amount;
  const coeff = bet.side === 'left' ? odds.leftOdds : odds.rightOdds;
  return Math.round(bet.amount * coeff - bet.amount);
}

// ========================
// TAP PHRASES
// ========================

const TAP_PHRASES = [
  'БЕЙ!', 'ТАК ЕГО!', 'СИЛЬНЕЕ!', 'НЕ СДАВАЙСЯ!',
  'ДАВАЙ!', 'ВПЕРЁД!', 'КРУШИ!', 'МОЛОДЕЦ!', 'ЕЩЁ!',
  'МОЧИ!', 'В РЫЛО!', 'КРАСАВА!',
];

function pickTapPhrase() {
  return TAP_PHRASES[Math.floor(Math.random() * TAP_PHRASES.length)];
}

// ========================
// GAME STATE
// ========================

const gameState = {
  scene: 'landing',
  balance: 1000,
  round: 0,
  usedCharacterIds: [],
  fighters: null,
  bet: null,
  dialogStep: 0,
  fightResult: null,
  adminSocketId: null,
};

// ========================
// FIGHT LOOP
// ========================

let fightInterval = null;

function startFightLoop() {
  if (fightInterval) clearInterval(fightInterval);

  // Initialize attack timers & intervals
  for (const fighter of gameState.fighters) {
    fighter._msSinceLastAttack = 0;
    const def = getCharacterDef(fighter.characterId);
    fighter._currentInterval = computeAttackInterval(def.stats);
  }

  // Send initial intervals so clients can set up animation speed
  io.emit('state_sync', { state: getPublicState() });

  const tickMs = gameConfig.FIGHT_TICK_MS;
  fightInterval = setInterval(() => {
    if (gameState.scene !== 'fight' || !gameState.fighters) {
      clearInterval(fightInterval);
      fightInterval = null;
      return;
    }

    const [left, right] = gameState.fighters;

    // Process each fighter's attack cycle
    processFighterAttack(left, right, tickMs);
    processFighterAttack(right, left, tickMs);

    // Sync state (includes HP + current intervals)
    io.emit('state_sync', { state: getPublicState() });

    // Check for KO
    if (left.hp <= 0 || right.hp <= 0) {
      clearInterval(fightInterval);
      fightInterval = null;
      resolveFight();
    }
  }, tickMs);
}

function processFighterAttack(attacker, target, tickMs) {
  const def = getCharacterDef(attacker.characterId);
  const baseInterval = computeAttackInterval(def.stats);

  // Compute boosted interval using accumulated taps (NOT reset every tick)
  const boostedInterval = applyTapBoost(baseInterval, attacker.tapBoost);

  // Store current interval for client to sync animation speed
  attacker._currentInterval = boostedInterval;

  attacker._msSinceLastAttack = (attacker._msSinceLastAttack || 0) + tickMs;

  // Attack fires when one full cycle completes
  if (attacker._msSinceLastAttack >= boostedInterval) {
    attacker._msSinceLastAttack = 0;
    attacker.tapBoost = 0; // Reset taps only after attack fires

    const damage = computeDamage(def.stats);
    target.hp = Math.max(0, target.hp - damage);

    // Tell client: hit landed
    io.emit('attack_hit', { attacker: attacker.side, damage });
  }
}

function resolveFight() {
  const [left, right] = gameState.fighters;
  const winner = left.hp <= 0 ? 'right' : 'left';

  let payout = 0;
  if (gameState.bet && gameState.bet.playerBet) {
    payout = computePayout(
      gameState.bet.playerBet,
      winner,
      { leftOdds: gameState.bet.leftOdds, rightOdds: gameState.bet.rightOdds }
    );
    gameState.balance += payout;
  }

  gameState.fightResult = { winner, payout };
  gameState.scene = 'postfight';
  gameState.dialogStep = 0;

  // Mark these characters as used
  gameState.usedCharacterIds.push(left.characterId, right.characterId);

  io.emit('state_sync', { state: getPublicState() });
}

// ========================
// ADMIN ACTIONS
// ========================

function setupFighters(leftDef, rightDef) {
  const leftMaxHp = computeMaxHp(leftDef.stats);
  const rightMaxHp = computeMaxHp(rightDef.stats);
  const odds = computeOdds(leftDef.stats, rightDef.stats);

  gameState.fighters = [
    { characterId: leftDef.id, hp: leftMaxHp, maxHp: leftMaxHp, side: 'left', tapBoost: 0, _msSinceLastAttack: 0 },
    { characterId: rightDef.id, hp: rightMaxHp, maxHp: rightMaxHp, side: 'right', tapBoost: 0, _msSinceLastAttack: 0 },
  ];

  gameState.bet = {
    leftOdds: odds.leftOdds,
    rightOdds: odds.rightOdds,
    playerBet: null,
  };
}

function handleAdminAction(action, params) {
  console.log(`[Admin] Action: ${action}, current scene: ${gameState.scene}`, params ? `params: ${JSON.stringify(params)}` : '');

  switch (action) {
    case 'set_game_params': {
      if (gameState.scene !== 'landing') return;
      if (params?.balance !== undefined) {
        gameState.balance = params.balance;
      }
      break;
    }

    case 'enter_club': {
      if (gameState.scene !== 'landing') return;
      // Setup tutorial fight: Kacher vs Zheka
      const kacher = getCharacterDef('kacher');
      const zheka = getCharacterDef('zheka');
      setupFighters(kacher, zheka);
      gameState.scene = 'intro';
      gameState.dialogStep = 0;
      // round уже установлен через set_game_params, если нужно
      break;
    }

    case 'next_dialogue': {
      gameState.dialogStep++;
      if (gameState.scene === 'postintro' && gameState.dialogStep === 1) {
        gameState.balance += 100_000;
      }
      break;
    }

    case 'start_prefight': {
      if (gameState.scene === 'intro') {
        gameState.scene = 'prefight';
        gameState.dialogStep = 0;
      } else if (gameState.scene === 'postintro') {
        // After postintro, fighters were cleared — pick a new pair and go to intro
        const pair = pickRandomPair(gameState.usedCharacterIds);
        if (!pair) {
          gameState.scene = 'win';
          break;
        }
        setupFighters(pair[0], pair[1]);
        gameState.scene = 'intro';
        gameState.dialogStep = 0;
      }
      break;
    }

    case 'start_fight': {
      if (gameState.scene !== 'prefight') return;
      if (!gameState.bet?.playerBet) return;
      gameState.scene = 'fight';
      gameState.fightResult = null;
      startFightLoop();
      break;
    }

    case 'next_round': {
      if (gameState.scene !== 'postfight') return;

      gameState.round++;
      gameState.fightResult = null;
      gameState.fighters = null;
      gameState.bet = null;
      gameState.dialogStep = 0;

      // After tutorial fight (round 0 → 1), go to postintro (Kacher gives 100k)
      if (gameState.round === 1) {
        gameState.usedCharacterIds = [];
        gameState.scene = 'postintro';
        gameState.dialogStep = 0;
        break;
      }

      // Try to pick a new pair with available sprites
      const pair = pickRandomPair(gameState.usedCharacterIds);
      if (!pair) {
        // No more fighters — go to win screen
        gameState.scene = 'win';
        break;
      }

      setupFighters(pair[0], pair[1]);
      gameState.scene = 'intro';
      break;
    }

    case 'close_win_screen': {
      // Reset the game
      gameState.scene = 'landing';
      gameState.balance = 1000;
      gameState.round = 0;
      gameState.usedCharacterIds = [];
      gameState.fighters = null;
      gameState.bet = null;
      gameState.dialogStep = 0;
      gameState.fightResult = null;
      break;
    }

    default:
      console.warn(`Unknown admin action: ${action}`);
  }
}

// ========================
// PUBLIC STATE (strip internal fields)
// ========================

function getPublicState() {
  const state = { ...gameState };
  if (state.fighters) {
    state.fighters = state.fighters.map((f) => {
      const { _msSinceLastAttack, _currentInterval, ...rest } = f;
      return {
        ...rest,
        attackInterval: _currentInterval ?? 2000, // expose for client animation sync
      };
    });
  }
  return state;
}

// ========================
// STATIC FILES
// ========================

// Serve assets from assets/ folder (always — mounted via Docker volume)
const assetsPath = path.join(__dirname, 'assets');
app.use('/sprites', express.static(path.join(assetsPath, 'sprites')));
app.use('/audio', express.static(path.join(assetsPath, 'audio')));
app.use('/fonts', express.static(path.join(assetsPath, 'fonts')));
// Serve root-level static files (like qr-code.gif) - only specific files
app.get('/qr-code.gif', (_req, res) => {
  res.sendFile(path.join(__dirname, 'qr-code.gif'));
});

// JSON body parser for config API
app.use(express.json());

// API routes BEFORE SPA fallback
app.get('/state', (_req, res) => {
  res.json(getPublicState());
});

// ── Config API: view / update balance in real-time ──

app.get('/api/config', (_req, res) => {
  res.json(gameConfig);
});

app.post('/api/config', (req, res) => {
  const updates = req.body;
  const applied = {};
  const rejected = {};
  for (const [key, value] of Object.entries(updates)) {
    if (key in gameConfig && typeof value === 'number') {
      gameConfig[key] = value;
      applied[key] = value;
    } else {
      rejected[key] = typeof value === 'number' ? 'unknown key' : `expected number, got ${typeof value}`;
    }
  }
  console.log('[Config] Updated:', applied);
  if (Object.keys(rejected).length > 0) console.log('[Config] Rejected:', rejected);
  res.json({ applied, rejected, current: gameConfig });
});

// Take every Nth frame to reduce loading time (~145 → ~73 frames per animation)
const FRAME_STEP = 2;

app.get('/api/sprite-frames/:path(*)', (req, res) => {
  const spritePath = path.join(__dirname, 'assets', req.params.path);
  try {
    if (!fs.existsSync(spritePath) || !fs.statSync(spritePath).isDirectory()) {
      return res.json({ frames: [] });
    }

    // Prefer WebP files; fall back to PNG/JPG if WebP not available
    const allImageFiles = fs.readdirSync(spritePath)
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));

    // Group by base name — prefer .webp over .png
    const byBase = new Map();
    for (const f of allImageFiles) {
      const base = f.replace(/\.(png|jpg|jpeg|webp)$/i, '');
      const ext = f.split('.').pop().toLowerCase();
      const existing = byBase.get(base);
      if (!existing || ext === 'webp') {
        byBase.set(base, f);
      }
    }

    const allFiles = [...byBase.values()].sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    // Thin out frames: take every FRAME_STEP-th frame (+ always include last frame)
    const step = parseInt(req.query.step, 10) || FRAME_STEP;
    let files;
    if (step > 1 && allFiles.length > step) {
      files = allFiles.filter((_, i) => i % step === 0);
      // Always include the last frame so animations end cleanly
      const lastFrame = allFiles[allFiles.length - 1];
      if (!files.includes(lastFrame)) {
        files.push(lastFrame);
      }
    } else {
      files = allFiles;
    }

    res.json({ frames: files });
  } catch {
    res.json({ frames: [] });
  }
});

// In production, serve built frontend from dist/
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback — serve index.html for any unmatched route
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ========================
// SOCKET.IO
// ========================

io.on('connection', (socket) => {
  const isAdmin = socket.handshake.query.role === 'admin';
  console.log(`[Socket] ${isAdmin ? 'ADMIN' : 'Player'} connected: ${socket.id}`);

  if (isAdmin && !gameState.adminSocketId) {
    gameState.adminSocketId = socket.id;
    console.log(`[Socket] Admin registered: ${socket.id}`);
  }

  // Send current state immediately
  socket.emit('state_sync', { state: getPublicState() });

  socket.on('tap', (data) => {
    if (!gameState.fighters || gameState.scene !== 'fight') return;
    if (!gameState.bet?.playerBet) return;
    const betSide = gameState.bet.playerBet.side;
    const fighter = gameState.fighters.find((f) => f.side === betSide);
    if (fighter) fighter.tapBoost += 1;

    const phrase = pickTapPhrase();
    io.emit('tap_effect', { side: betSide, x: data.x, y: data.y, phrase });
  });

  socket.on('admin_action', (data) => {
    if (socket.id !== gameState.adminSocketId) return;
    handleAdminAction(data.action, data.params);
    io.emit('state_sync', { state: getPublicState() });
  });

  socket.on('place_bet', (data) => {
    if (socket.id !== gameState.adminSocketId) return;
    if (!gameState.bet || gameState.scene !== 'prefight') return;
    if (data.amount > gameState.balance || data.amount <= 0) return;
    gameState.bet.playerBet = { side: data.side, amount: data.amount };
    io.emit('state_sync', { state: getPublicState() });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    if (socket.id === gameState.adminSocketId) {
      gameState.adminSocketId = null;
      console.log('[Socket] Admin disconnected');
    }
  });
});

// ========================
// START
// ========================

server.listen(PORT, () => {
  console.log(`\n🥊 Бойцовский Клуб сервер запущен!`);
  console.log(`   http://localhost:${PORT}/`);
  console.log(`   Admin: http://localhost:${PORT}/?role=admin`);
  console.log('');
});
