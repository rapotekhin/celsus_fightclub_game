import type { GameState } from '../types';
import type { IScene } from './SceneManager';
import type { LoadedAssets } from '../engine/AssetLoader';
import { SpriteAnimation } from '../engine/SpriteAnimation';
import { DESIGN_W, DESIGN_H, drawBackground, drawText, drawRoundedRect, getCanvas } from '../engine/Canvas';
import { emitAdminAction, getIsAdmin } from '../socket';
import { POSTINTRO_DIALOGUE } from '../data/dialogues';
import { audioManager } from '../audio/AudioManager';

/**
 * PostIntroScene — Качер раздаёт 100к после туториального боя.
 */
export class PostIntroScene implements IScene {
  private assets: LoadedAssets;
  private state: GameState | null = null;
  private kacherIdle: SpriteAnimation | null = null;

  // Money animation
  private moneyDisplayed = 0;
  private moneyTarget = 100_000;
  private moneyAnimStarted = false;
  private dialogStep = 0;
  private timer = 0;

  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private touchHandler: ((e: TouchEvent) => void) | null = null;

  constructor(assets: LoadedAssets) {
    this.assets = assets;
  }

  enter(state: GameState): void {
    this.state = state;
    this.dialogStep = state.dialogStep;
    this.moneyDisplayed = 0;
    this.moneyAnimStarted = false;
    this.timer = 0;

    const kacherIdleAnim = this.assets.animations.get('kacher_idle');
    this.kacherIdle = kacherIdleAnim ? new SpriteAnimation(kacherIdleAnim) : null;

    const canvas = getCanvas();
    this.clickHandler = () => {
      if (!getIsAdmin()) return;
      if (this.moneyAnimStarted && this.moneyDisplayed >= this.moneyTarget * 0.95) {
        // Go to next fight intro
        emitAdminAction('start_prefight');
      } else if (!this.moneyAnimStarted) {
        emitAdminAction('next_dialogue');
        this.moneyAnimStarted = true;
        audioManager.play('money_coins');
      }
    };
    this.touchHandler = (e: TouchEvent) => {
      e.preventDefault();
      this.clickHandler?.(null as any);
    };
    canvas.addEventListener('click', this.clickHandler);
    canvas.addEventListener('touchstart', this.touchHandler);
  }

  exit(): void {
    const canvas = getCanvas();
    if (this.clickHandler) canvas.removeEventListener('click', this.clickHandler);
    if (this.touchHandler) canvas.removeEventListener('touchstart', this.touchHandler);
    this.clickHandler = null;
    this.touchHandler = null;
  }

  onStateUpdate(state: GameState): void {
    this.state = state;
    this.dialogStep = state.dialogStep;
  }

  update(deltaMs: number): void {
    this.kacherIdle?.update(deltaMs);
    this.timer += deltaMs;

    if (this.moneyAnimStarted) {
      const speed = this.moneyTarget / 2000; // full in 2 seconds
      this.moneyDisplayed = Math.min(this.moneyDisplayed + speed * deltaMs, this.moneyTarget);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Background
    const bgImg = this.assets.images.get('bg_intro');
    if (bgImg) {
      drawBackground(bgImg);
    } else {
      ctx.fillStyle = '#1a0a2e';
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    // Kacher
    const charW = 600;
    const charH = 750;
    const charY = DESIGN_H - charH - 50;

    if (this.kacherIdle && !this.kacherIdle.isEmpty) {
      this.kacherIdle.render(ctx, DESIGN_W / 2 - charW / 2, charY, charW, charH);
    }

    drawText('Качер', DESIGN_W / 2, charY - 30, {
      font: '24px PressStart2P',
      color: '#FF4444',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 4,
    });

    // Speech bubble
    if (this.dialogStep < POSTINTRO_DIALOGUE.length) {
      const line = POSTINTRO_DIALOGUE[this.dialogStep];
      const bubbleW = 1000;
      const bubbleH = 180;
      const bubbleX = DESIGN_W / 2 - bubbleW / 2;
      const bubbleY = 60;

      drawRoundedRect(bubbleX, bubbleY, bubbleW, bubbleH, 18, 'rgba(255,255,255,0.92)', '#FFD700', 3);

      ctx.save();
      ctx.font = '20px PressStart2P';
      ctx.fillStyle = '#222';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const maxWidth = bubbleW - 50;
      const words = line.text.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);

      const lineHeight = 30;
      const startY = bubbleY + bubbleH / 2 - ((lines.length - 1) * lineHeight) / 2;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], bubbleX + bubbleW / 2, startY + i * lineHeight);
      }
      ctx.restore();
    }

    // Money animation
    if (this.moneyAnimStarted) {
      const displayVal = Math.round(this.moneyDisplayed);

      drawText(`+${displayVal.toLocaleString('ru-RU')} ₽`, DESIGN_W / 2, DESIGN_H * 0.3, {
        font: '48px PressStart2P',
        color: '#44FF44',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 6,
      });

      if (this.moneyDisplayed >= this.moneyTarget * 0.95) {
        drawText(`💰 Баланс: ${(this.state?.balance ?? this.moneyTarget).toLocaleString('ru-RU')} ₽`, DESIGN_W / 2, DESIGN_H * 0.38, {
          font: '24px PressStart2P',
          color: '#FFD700',
          stroke: true,
          strokeColor: '#000',
          strokeWidth: 4,
        });

        if (getIsAdmin()) {
          drawText('Нажмите: Далее ▶', DESIGN_W / 2, DESIGN_H - 40, {
            font: '16px PressStart2P',
            color: '#FFD700',
            stroke: true,
            strokeColor: '#000',
            strokeWidth: 3,
          });
        }
      }
    } else {
      // Hint to click
      if (getIsAdmin()) {
        drawText('Нажмите: Далее ▶', DESIGN_W / 2, DESIGN_H - 40, {
          font: '16px PressStart2P',
          color: '#FFD700',
          stroke: true,
          strokeColor: '#000',
          strokeWidth: 3,
        });
      }
    }
  }
}
