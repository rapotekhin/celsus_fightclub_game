import type { GameState } from '../types';
import type { IScene } from './SceneManager';
import type { LoadedAssets } from '../engine/AssetLoader';
import { SpriteAnimation } from '../engine/SpriteAnimation';
import { DESIGN_W, DESIGN_H, drawBackground, drawText, getCanvas } from '../engine/Canvas';
import { emitAdminAction, getIsAdmin } from '../socket';
import { getCharacterDef } from '../data/characters';
import { audioManager } from '../audio/AudioManager';

export class PostFightScene implements IScene {
  private assets: LoadedAssets;
  private state: GameState | null = null;

  // Animations
  private winnerFatalityAnim: SpriteAnimation | null = null;
  private winnerWinAnim: SpriteAnimation | null = null;
  private loserIdleAnim: SpriteAnimation | null = null;
  private loserBeatenAnim: SpriteAnimation | null = null;

  // Character IDs
  private winnerId = '';
  private loserId = '';
  private winnerSide: 'left' | 'right' = 'left';

  // Phase: 'fatality' → 'result'
  private phase: 'fatality' | 'result' = 'fatality';
  private beatenStarted = false;
  private resultTimer = 0;

  // Money animation
  private moneyDisplayed = 0;
  private moneyTarget = 0;

  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private touchHandler: ((e: TouchEvent) => void) | null = null;

  constructor(assets: LoadedAssets) {
    this.assets = assets;
  }

  enter(state: GameState): void {
    this.state = state;
    this.phase = 'fatality';
    this.beatenStarted = false;
    this.resultTimer = 0;
    this.moneyDisplayed = 0;

    if (state.fighters && state.fightResult) {
      const winner = state.fightResult.winner;
      this.winnerSide = winner;
      const winnerFighter = state.fighters[winner === 'left' ? 0 : 1];
      const loserFighter = state.fighters[winner === 'left' ? 1 : 0];
      this.winnerId = winnerFighter.characterId;
      this.loserId = loserFighter.characterId;

      // Winner fatality
      const fatalityAnim = this.assets.animations.get(`${this.winnerId}_fatality`);
      if (fatalityAnim && fatalityAnim.frames.length > 0) {
        this.winnerFatalityAnim = new SpriteAnimation(fatalityAnim, () => {
          this.startResultPhase();
        });
      } else {
        this.startResultPhase();
      }

      // Loser idle (plays until beaten kicks in)
      const loserIdleData = this.assets.animations.get(`${this.loserId}_idle`);
      this.loserIdleAnim = loserIdleData && loserIdleData.frames.length > 0
        ? new SpriteAnimation(loserIdleData) : null;

      // Loser beaten (starts at 50% of fatality)
      const beatenAnim = this.assets.animations.get(`${this.loserId}_beaten`);
      this.loserBeatenAnim = beatenAnim && beatenAnim.frames.length > 0
        ? new SpriteAnimation(beatenAnim) : null;

      // Winner celebration (for result phase)
      const winnerAnim = this.assets.animations.get(`${this.winnerId}_winner`);
      this.winnerWinAnim = winnerAnim && winnerAnim.frames.length > 0
        ? new SpriteAnimation(winnerAnim) : null;

      console.log(`[PostFight] winner=${this.winnerId} (${this.winnerSide}), loser=${this.loserId}`);
      console.log(`[PostFight] fatality frames: ${fatalityAnim?.frames.length ?? 0}`);
      console.log(`[PostFight] loserIdle frames: ${loserIdleData?.frames.length ?? 0}`);
      console.log(`[PostFight] loserBeaten frames: ${beatenAnim?.frames.length ?? 0}`);

      this.moneyTarget = state.fightResult.payout;

      audioManager.play('fatality');
    }

    const canvas = getCanvas();
    this.clickHandler = () => {
      if (!getIsAdmin()) return;
      if (this.phase === 'result') {
        emitAdminAction('next_round');
      }
    };
    this.touchHandler = (e: TouchEvent) => {
      e.preventDefault();
      this.clickHandler?.(null as any);
    };
    canvas.addEventListener('click', this.clickHandler);
    canvas.addEventListener('touchstart', this.touchHandler);
  }

  private startResultPhase(): void {
    this.phase = 'result';
    this.resultTimer = 0;
    audioManager.play('crowd_cheer');
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
  }

  update(deltaMs: number): void {
    switch (this.phase) {
      case 'fatality':
        this.winnerFatalityAnim?.update(deltaMs);

        // At 50% of fatality, switch loser from idle to beaten
        if (!this.beatenStarted && this.winnerFatalityAnim && this.winnerFatalityAnim.progress >= 0.5) {
          this.beatenStarted = true;
          this.loserBeatenAnim?.reset();
        }

        if (this.beatenStarted) {
          this.loserBeatenAnim?.update(deltaMs);
        } else {
          this.loserIdleAnim?.update(deltaMs);
        }
        break;

      case 'result':
        this.winnerWinAnim?.update(deltaMs);
        this.loserBeatenAnim?.update(deltaMs);
        this.resultTimer += deltaMs;

        if (this.moneyTarget !== 0) {
          const speed = Math.abs(this.moneyTarget) / 1000;
          if (this.moneyTarget > 0) {
            this.moneyDisplayed = Math.min(this.moneyDisplayed + speed * deltaMs, this.moneyTarget);
          } else {
            this.moneyDisplayed = Math.max(this.moneyDisplayed - speed * deltaMs, this.moneyTarget);
          }
        }
        break;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.state || !this.state.fighters || !this.state.fightResult) return;

    const winnerDef = getCharacterDef(this.winnerId);
    const loserDef = getCharacterDef(this.loserId);
    const mirrorWinner = this.winnerSide === 'right';
    const mirrorLoser = this.winnerSide === 'left';

    // Background
    const arenaAnim = this.assets.animations.get('bg_arena');
    if (arenaAnim && arenaAnim.frames.length > 0) {
      drawBackground(arenaAnim.frames[0]);
    } else {
      ctx.fillStyle = '#0a0a1e';
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    const charW = 600;
    const charH = 750;
    const charY = DESIGN_H - charH - 80;
    const leftX = 200;
    const rightX = DESIGN_W - 200 - charW;

    // ===== FATALITY PHASE: both characters side by side =====
    if (this.phase === 'fatality') {
      const winX = this.winnerSide === 'left' ? leftX : rightX;
      const loseX = this.winnerSide === 'left' ? rightX : leftX;

      // Winner: fatality animation
      if (this.winnerFatalityAnim && !this.winnerFatalityAnim.isEmpty) {
        this.winnerFatalityAnim.render(ctx, winX, charY, charW, charH, mirrorWinner);
      }

      // Loser: idle → beaten at 50%
      if (this.beatenStarted) {
        if (this.loserBeatenAnim) {
          this.loserBeatenAnim.render(ctx, loseX, charY, charW, charH, mirrorLoser);
        }
      } else {
        if (this.loserIdleAnim) {
          this.loserIdleAnim.render(ctx, loseX, charY, charW, charH, mirrorLoser);
        }
      }

      // Names above each character
      drawText(winnerDef.name, winX + charW / 2, charY - 30, {
        font: '22px PressStart2P',
        color: '#FF4444',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 4,
      });
      drawText(loserDef.name, loseX + charW / 2, charY - 30, {
        font: '22px PressStart2P',
        color: '#4488FF',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 4,
      });

      drawText('FATALITY', DESIGN_W / 2, 100, {
        font: '64px PressStart2P',
        color: '#FF0000',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 8,
      });
    }

    // ===== RESULT PHASE: winner celebrates, loser lies down =====
    if (this.phase === 'result') {
      const winX = this.winnerSide === 'left' ? leftX : rightX;
      const loseX = this.winnerSide === 'left' ? rightX : leftX;

      if (this.winnerWinAnim && !this.winnerWinAnim.isEmpty) {
        this.winnerWinAnim.render(ctx, winX, charY, charW, charH, mirrorWinner);
      }

      if (this.loserBeatenAnim && !this.loserBeatenAnim.isEmpty) {
        this.loserBeatenAnim.render(ctx, loseX, charY, charW, charH, mirrorLoser);
      }

      drawText(`🏆 ${winnerDef.name} ПОБЕДИЛ! 🏆`, DESIGN_W / 2, 100, {
        font: '36px PressStart2P',
        color: '#FFD700',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 6,
      });

      const payout = this.state.fightResult.payout;
      const payoutText = payout >= 0
        ? `+${Math.round(this.moneyDisplayed).toLocaleString('ru-RU')} ₽`
        : `${Math.round(this.moneyDisplayed).toLocaleString('ru-RU')} ₽`;
      const payoutColor = payout >= 0 ? '#44FF44' : '#FF4444';

      drawText(payoutText, DESIGN_W / 2, 180, {
        font: '32px PressStart2P',
        color: payoutColor,
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 5,
      });

      drawText(`💰 Баланс: ${this.state.balance.toLocaleString('ru-RU')} ₽`, DESIGN_W / 2, 240, {
        font: '24px PressStart2P',
        color: '#FFD700',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 4,
      });

      if (getIsAdmin()) {
        drawText('Нажмите: Следующий раунд ▶', DESIGN_W / 2, DESIGN_H - 40, {
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
