import { initCanvas, clearCanvas, getCtx, DESIGN_W, DESIGN_H, drawText } from './engine/Canvas';
import { preloadAssets, commonAssetManifest, characterAnimManifest, type LoadedAssets } from './engine/AssetLoader';
import { initSocket, setupStateSync, onStateSync } from './socket';
import { updateState, getState } from './state';
import { SceneManager } from './scenes/SceneManager';
import { LandingScene } from './scenes/LandingScene';
import { IntroScene } from './scenes/IntroScene';
import { PreFightScene } from './scenes/PreFightScene';
import { FightScene } from './scenes/FightScene';
import { PostFightScene } from './scenes/PostFightScene';
import { PostIntroScene } from './scenes/PostIntroScene';
import { WinScene } from './scenes/WinScene';
import { TUTORIAL_FIGHTERS, CHARACTERS, hasSprites } from './data/characters';

// ========================
// INIT
// ========================

async function main() {
  console.log('🥊 Бойцовский Клуб — инициализация...');

  // Init canvas
  const { canvas, ctx } = initCanvas();

  // Show loading screen
  renderLoading(ctx, 'Загрузка ассетов...', 0);

  // Init socket
  const socket = initSocket();
  setupStateSync();

  // Build asset manifest — load all characters that have sprites
  const characterManifests = CHARACTERS
    .filter((c) => hasSprites(c.id))
    .flatMap((c) => characterAnimManifest(c.id));

  const manifest = [
    ...commonAssetManifest(),
    ...characterManifests,
  ];

  // Preload all assets
  let assets: LoadedAssets;
  try {
    assets = await preloadAssets(manifest, (loaded, total) => {
      renderLoading(ctx, 'Загрузка ассетов...', loaded / total);
    });
    console.log(`✅ Loaded ${assets.images.size} images, ${assets.animations.size} animations`);
  } catch (e) {
    console.error('Failed to load assets:', e);
    renderLoading(ctx, 'Ошибка загрузки!', 0);
    return;
  }

  // Create scene manager
  const sceneManager = new SceneManager(assets);

  // Register all scenes
  sceneManager.register('landing', new LandingScene(assets));
  sceneManager.register('intro', new IntroScene(assets));
  sceneManager.register('prefight', new PreFightScene(assets));
  sceneManager.register('fight', new FightScene(assets));
  sceneManager.register('postfight', new PostFightScene(assets));
  sceneManager.register('postintro', new PostIntroScene(assets));
  sceneManager.register('win', new WinScene(assets));

  // Listen for state updates
  onStateSync((state) => {
    updateState(state);
    sceneManager.onStateUpdate(state);
  });

  // Start with initial state from server
  const initialState = getState();
  sceneManager.switchTo(initialState.scene, initialState);

  // ========================
  // GAME LOOP
  // ========================

  let lastTime = performance.now();

  function gameLoop(now: number) {
    const deltaMs = now - lastTime;
    lastTime = now;

    // Clear
    clearCanvas();

    // Update & render current scene
    sceneManager.update(deltaMs);
    sceneManager.render(ctx);

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
  console.log('🎮 Game loop started');
}

// ========================
// LOADING SCREEN
// ========================

function renderLoading(ctx: CanvasRenderingContext2D, message: string, progress: number): void {
  ctx.fillStyle = '#0a0a1e';
  ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

  // Title
  ctx.font = '36px PressStart2P';
  ctx.fillStyle = '#FFD700';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🥊 БОЙЦОВСКИЙ КЛУБ 🥊', DESIGN_W / 2, DESIGN_H * 0.35);

  // Progress bar background
  const barW = 600;
  const barH = 30;
  const barX = DESIGN_W / 2 - barW / 2;
  const barY = DESIGN_H / 2;

  ctx.fillStyle = '#333';
  ctx.fillRect(barX, barY, barW, barH);

  // Progress bar fill
  ctx.fillStyle = '#FFD700';
  ctx.fillRect(barX, barY, barW * progress, barH);

  // Border
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barW, barH);

  // Message
  ctx.font = '16px PressStart2P';
  ctx.fillStyle = '#AAA';
  ctx.fillText(message, DESIGN_W / 2, DESIGN_H * 0.58);

  // Percentage
  ctx.font = '14px PressStart2P';
  ctx.fillStyle = '#FFD700';
  ctx.fillText(`${Math.round(progress * 100)}%`, DESIGN_W / 2, barY + barH / 2);
}

// ========================
// START
// ========================

// Wait for fonts to load, then start
document.fonts.ready.then(() => {
  main().catch(console.error);
});
