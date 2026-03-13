import type { GameState } from '../types';
import type { IScene } from './SceneManager';
import type { LoadedAssets } from '../engine/AssetLoader';
import { SpriteAnimation } from '../engine/SpriteAnimation';
import { DESIGN_W, DESIGN_H, drawBackground, drawText, screenToCanvas, getCanvas } from '../engine/Canvas';
import { emitAdminAction, getIsAdmin } from '../socket';
import { audioManager } from '../audio/AudioManager';

export class LandingScene implements IScene {
  private assets: LoadedAssets;
  private doorIdle!: SpriteAnimation;
  private doorOpen!: SpriteAnimation;
  private doorHovered = false;
  private isOpening = false;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private moveHandler: ((e: MouseEvent) => void) | null = null;
  private touchHandler: ((e: TouchEvent) => void) | null = null;

  constructor(assets: LoadedAssets) {
    this.assets = assets;
  }

  enter(_state: GameState): void {
    this.doorHovered = false;
    this.isOpening = false;

    const doorIdleAnim = this.assets.animations.get('door_idle');
    const doorOpenAnim = this.assets.animations.get('door_open');

    if (doorIdleAnim) {
      this.doorIdle = new SpriteAnimation(doorIdleAnim);
    }
    if (doorOpenAnim) {
      this.doorOpen = new SpriteAnimation(doorOpenAnim, () => {
        // Door open animation finished — send enter_club
        emitAdminAction('enter_club');
      });
    }

    const canvas = getCanvas();

    this.moveHandler = (e: MouseEvent) => {
      if (!getIsAdmin() || this.isOpening) return;
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      this.doorHovered = this.isDoorHitbox(x, y);
      canvas.style.cursor = this.doorHovered ? 'pointer' : 'default';
    };

    this.clickHandler = (e: MouseEvent) => {
      if (!getIsAdmin() || this.isOpening) return;
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      if (this.isDoorHitbox(x, y)) {
        this.startOpening();
      }
    };

    this.touchHandler = (e: TouchEvent) => {
      if (!getIsAdmin() || this.isOpening) return;
      const touch = e.touches[0];
      if (!touch) return;
      const { x, y } = screenToCanvas(touch.clientX, touch.clientY);
      if (this.isDoorHitbox(x, y)) {
        this.startOpening();
      }
    };

    canvas.addEventListener('mousemove', this.moveHandler);
    canvas.addEventListener('click', this.clickHandler);
    canvas.addEventListener('touchstart', this.touchHandler);

    audioManager.playBg('bg_club');
  }

  exit(): void {
    const canvas = getCanvas();
    if (this.moveHandler) canvas.removeEventListener('mousemove', this.moveHandler);
    if (this.clickHandler) canvas.removeEventListener('click', this.clickHandler);
    if (this.touchHandler) canvas.removeEventListener('touchstart', this.touchHandler);
    canvas.style.cursor = 'default';
    this.moveHandler = null;
    this.clickHandler = null;
    this.touchHandler = null;
  }

  onStateUpdate(_state: GameState): void {
    // Nothing to update on landing
  }

  private startOpening(): void {
    this.isOpening = true;
    this.doorOpen?.reset();
    audioManager.play('door_open');
  }

  private isDoorHitbox(x: number, y: number): boolean {
    // 512x512 box centered on screen (design coords: 1920x1080)
    const cx = DESIGN_W / 2;   // 960
    const cy = DESIGN_H / 2;   // 540
    const half = 256;           // 512 / 2
    return x >= cx - half && x <= cx + half && y >= cy - half && y <= cy + half;
  }

  update(deltaMs: number): void {
    if (this.isOpening && this.doorOpen) {
      this.doorOpen.update(deltaMs);
    } else if (this.doorIdle) {
      this.doorIdle.update(deltaMs);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Background
    const bgImg = this.assets.images.get('bg_club_exterior');
    if (bgImg) {
      drawBackground(bgImg);
    } else {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    }

    // Door animation (overlay on background)
    if (this.isOpening && this.doorOpen && !this.doorOpen.isEmpty) {
      this.doorOpen.render(ctx, 0, 0, DESIGN_W, DESIGN_H);
    } else if (this.doorIdle && !this.doorIdle.isEmpty) {
      this.doorIdle.render(ctx, 0, 0, DESIGN_W, DESIGN_H);
    }

    // Hover text
    if (this.doorHovered && !this.isOpening && getIsAdmin()) {
      drawText('Войти в бойцовский клуб?', DESIGN_W / 2, DESIGN_H * 0.06, {
        font: '28px PressStart2P',
        color: '#FFD700',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 5,
      });
    }

    // Waiting text for non-admin
    if (!getIsAdmin()) {
      drawText('Ожидание начала игры...', DESIGN_W / 2, DESIGN_H * 0.92, {
        font: '20px PressStart2P',
        color: '#AAAAAA',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 3,
      });
    }
  }
}
