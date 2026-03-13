import type { GameState } from '../types';
import type { IScene } from './SceneManager';
import type { LoadedAssets } from '../engine/AssetLoader';
import { SpriteAnimation } from '../engine/SpriteAnimation';
import { DESIGN_W, DESIGN_H, drawBackground, drawText, drawRoundedRect, screenToCanvas, getCanvas, getCtx } from '../engine/Canvas';
import { emitAdminAction, getIsAdmin } from '../socket';
import { getCharacterDef } from '../data/characters';
import { TUTORIAL_INTRO, getFightIntroDialogue, type DialogueLine } from '../data/dialogues';
import { audioManager } from '../audio/AudioManager';

export class IntroScene implements IScene {
  private assets: LoadedAssets;
  private leftIdle: SpriteAnimation | null = null;
  private rightIdle: SpriteAnimation | null = null;
  private dialogueLines: DialogueLine[] = [];
  private dialogStep = 0;
  private leftName = '';
  private rightName = '';
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private touchHandler: ((e: TouchEvent) => void) | null = null;

  // Phase: 'background' shows only bg + "Далее", 'dialogue' is the main intro
  private phase: 'background' | 'dialogue' = 'background';

  // Animation: characters slide in
  private slideProgress = 0;
  private readonly SLIDE_DURATION = 800; // ms

  // "Далее" button pulse
  private btnPulse = 0;

  constructor(assets: LoadedAssets) {
    this.assets = assets;
  }

  enter(state: GameState): void {
    this.dialogStep = state.dialogStep;
    this.slideProgress = 0;
    this.phase = 'background';
    this.btnPulse = 0;

    if (state.fighters) {
      const leftId = state.fighters[0].characterId;
      const rightId = state.fighters[1].characterId;
      const leftDef = getCharacterDef(leftId);
      const rightDef = getCharacterDef(rightId);

      this.leftName = leftDef.name;
      this.rightName = rightDef.name;

      const leftIdleAnim = this.assets.animations.get(`${leftId}_idle`);
      const rightIdleAnim = this.assets.animations.get(`${rightId}_idle`);

      this.leftIdle = leftIdleAnim ? new SpriteAnimation(leftIdleAnim) : null;
      this.rightIdle = rightIdleAnim ? new SpriteAnimation(rightIdleAnim) : null;

      // Determine dialogue
      if (state.round === 0) {
        this.dialogueLines = TUTORIAL_INTRO;
      } else {
        this.dialogueLines = getFightIntroDialogue(
          leftDef.name, rightDef.name,
          leftDef.catchphrase, rightDef.catchphrase
        );
      }
    }

    const canvas = getCanvas();
    this.clickHandler = () => {
      if (!getIsAdmin()) return;

      // Phase 1: background only — click "Далее" to start dialogue
      if (this.phase === 'background') {
        this.phase = 'dialogue';
        this.slideProgress = 0;
        return;
      }

      // Phase 2: dialogue — advance or go to prefight
      if (this.dialogStep >= this.dialogueLines.length - 1) {
        emitAdminAction('start_prefight');
      } else {
        emitAdminAction('next_dialogue');
      }
    };
    this.touchHandler = (e: TouchEvent) => {
      e.preventDefault();
      this.clickHandler?.(null as any);
    };
    canvas.addEventListener('click', this.clickHandler);
    canvas.addEventListener('touchstart', this.touchHandler);

    audioManager.playBg('bg_club');
  }

  exit(): void {
    const canvas = getCanvas();
    if (this.clickHandler) canvas.removeEventListener('click', this.clickHandler);
    if (this.touchHandler) canvas.removeEventListener('touchstart', this.touchHandler);
    this.clickHandler = null;
    this.touchHandler = null;
  }

  onStateUpdate(state: GameState): void {
    this.dialogStep = state.dialogStep;
  }

  update(deltaMs: number): void {
    // Button pulse animation (for background phase)
    this.btnPulse += deltaMs;

    if (this.phase === 'background') return;

    // Slide-in animation
    if (this.slideProgress < this.SLIDE_DURATION) {
      this.slideProgress = Math.min(this.slideProgress + deltaMs, this.SLIDE_DURATION);
    }

    this.leftIdle?.update(deltaMs);
    this.rightIdle?.update(deltaMs);
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

    // ── Phase: background only ──
    if (this.phase === 'background') {
      // Slight dim overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

      // Title
      drawText('БОЙЦОВСКИЙ КЛУБ', DESIGN_W / 2, DESIGN_H * 0.30, {
        font: '48px PressStart2P',
        color: '#FFD700',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 8,
      });
      drawText('8 Марта', DESIGN_W / 2, DESIGN_H * 0.30 + 70, {
        font: '36px PressStart2P',
        color: '#FF6699',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 6,
      });

      // "Далее" button for admin
      if (getIsAdmin()) {
        const pulse = Math.sin(this.btnPulse / 400) * 0.08 + 1;
        const btnW = 320;
        const btnH = 70;
        const btnX = DESIGN_W / 2 - (btnW * pulse) / 2;
        const btnY = DESIGN_H * 0.65 - (btnH * pulse) / 2;

        ctx.save();
        ctx.globalAlpha = 0.95;
        drawRoundedRect(btnX, btnY, btnW * pulse, btnH * pulse, 18, '#FFD700', '#000', 4);
        ctx.restore();

        drawText('Далее ▶', DESIGN_W / 2, DESIGN_H * 0.65, {
          font: '26px PressStart2P',
          color: '#000',
        });
      } else {
        drawText('Ожидание ведущего...', DESIGN_W / 2, DESIGN_H * 0.70, {
          font: '20px PressStart2P',
          color: '#CCCCCC',
          stroke: true,
          strokeColor: '#000',
          strokeWidth: 3,
        });
      }

      return; // Don't render characters or dialogue yet
    }

    // ── Phase: dialogue ──
    // Dim overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    const slideT = easeOutCubic(this.slideProgress / this.SLIDE_DURATION);

    // Character sprite sizes
    const charW = 600;
    const charH = 750;
    const charY = DESIGN_H - charH - 50;

    // Left character slides from left
    const leftX = -charW + slideT * (150 + charW);
    if (this.leftIdle && !this.leftIdle.isEmpty) {
      this.leftIdle.render(ctx, leftX, charY, charW, charH, false);
    }

    // Right character slides from right
    const rightX = DESIGN_W - slideT * (150 + charW) + charW;
    const rightDrawX = DESIGN_W - (slideT * (150 + charW));
    if (this.rightIdle && !this.rightIdle.isEmpty) {
      this.rightIdle.render(ctx, rightDrawX, charY, charW, charH, true);
    }

    // Names
    drawText(this.leftName, leftX + charW / 2, charY - 30, {
      font: '22px PressStart2P',
      color: '#FF4444',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 4,
    });
    drawText(this.rightName, rightDrawX + charW / 2, charY - 30, {
      font: '22px PressStart2P',
      color: '#4488FF',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 4,
    });

    // VS text
    drawText('VS', DESIGN_W / 2, DESIGN_H * 0.25, {
      font: '64px PressStart2P',
      color: '#FFD700',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 8,
    });

    // Speech bubble
    if (this.dialogueLines.length > 0 && this.dialogStep < this.dialogueLines.length) {
      const line = this.dialogueLines[this.dialogStep];
      this.renderSpeechBubble(ctx, line);
    }

    // "Next" hint for admin
    if (getIsAdmin()) {
      const hintText = this.dialogStep >= this.dialogueLines.length - 1 ? 'Нажмите: К бою ▶' : 'Нажмите: Далее ▶';
      drawText(hintText, DESIGN_W / 2, DESIGN_H - 30, {
        font: '16px PressStart2P',
        color: '#FFD700',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 3,
      });
    }
  }

  private renderSpeechBubble(ctx: CanvasRenderingContext2D, line: DialogueLine): void {
    const isLeft = line.speaker === 'left';
    const bubbleW = 800;
    const bubbleH = 150;
    const bubbleX = isLeft ? 180 : DESIGN_W - 180 - bubbleW;
    const bubbleY = DESIGN_H * 0.32;

    drawRoundedRect(bubbleX, bubbleY, bubbleW, bubbleH, 18, 'rgba(255,255,255,0.92)', '#333', 3);

    ctx.save();
    ctx.font = '21px PressStart2P';
    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = bubbleW - 50;
    const words = line.text.split(' ');
    let lines: string[] = [];
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

    const lineHeight = 32;
    const startY = bubbleY + bubbleH / 2 - ((lines.length - 1) * lineHeight) / 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bubbleX + bubbleW / 2, startY + i * lineHeight);
    }
    ctx.restore();
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
