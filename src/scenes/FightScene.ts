import type { GameState, Fighter } from '../types';
import type { IScene } from './SceneManager';
import type { LoadedAssets } from '../engine/AssetLoader';
import type { FrameAnimation } from '../engine/AssetLoader';
import { SpriteAnimation } from '../engine/SpriteAnimation';
import { DESIGN_W, DESIGN_H, drawBackground, drawText, screenToCanvas, getCanvas } from '../engine/Canvas';
import { emitTap, getSocket } from '../socket';
import { getCharacterDef } from '../data/characters';
import { audioManager } from '../audio/AudioManager';

interface TapEffectData {
  phrase: string;
  x: number;
  y: number;
  ttl: number;
  maxTtl: number;
}

interface HitEffectData {
  x: number;
  y: number;
  ttl: number;
  damage: number;
}

export class FightScene implements IScene {
  private assets: LoadedAssets;
  private state: GameState | null = null;

  // Character attack animations (looping continuously)
  private leftAttackAnim: SpriteAnimation | null = null;
  private rightAttackAnim: SpriteAnimation | null = null;

  // Raw animation data for creating new instances
  private leftAttackData: FrameAnimation | null = null;
  private rightAttackData: FrameAnimation | null = null;

  // Character IDs
  private leftCharId = '';
  private rightCharId = '';

  // Current intervals from server (for animation speed sync)
  private leftInterval = 2000;
  private rightInterval = 2000;

  // Position
  private leftBaseX = 200;
  private rightBaseX = DESIGN_W - 200 - 600;

  // HP (smoothed for display)
  private leftHpDisplay = 0;
  private rightHpDisplay = 0;

  // Effects
  private tapEffects: TapEffectData[] = [];
  private hitEffects: HitEffectData[] = [];

  // Arena background animation
  private arenaBgAnim: SpriteAnimation | null = null;

  // Event handlers
  private pointerHandler: ((e: PointerEvent) => void) | null = null;
  private tapEffectHandler: ((data: any) => void) | null = null;
  private attackHitHandler: ((data: any) => void) | null = null;

  constructor(assets: LoadedAssets) {
    this.assets = assets;
  }

  enter(state: GameState): void {
    this.state = state;
    this.tapEffects = [];
    this.hitEffects = [];

    const arenaAnim = this.assets.animations.get('bg_arena');
    this.arenaBgAnim = arenaAnim ? new SpriteAnimation(arenaAnim) : null;

    if (state.fighters) {
      const [left, right] = state.fighters;
      this.leftHpDisplay = left.hp;
      this.rightHpDisplay = right.hp;
      this.leftCharId = left.characterId;
      this.rightCharId = right.characterId;

      // Get initial intervals
      this.leftInterval = left.attackInterval ?? 2000;
      this.rightInterval = right.attackInterval ?? 2000;

      // Load attack animations as LOOPING
      this.leftAttackData = this.assets.animations.get(`${left.characterId}_attack`) ?? null;
      this.rightAttackData = this.assets.animations.get(`${right.characterId}_attack`) ?? null;

      // Create looping attack animations
      this.setupAttackAnim('left');
      this.setupAttackAnim('right');
    }

    const canvas = getCanvas();

    // Tap handler — boosts the fighter you bet on
    this.pointerHandler = (e: PointerEvent) => {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      emitTap(x, y);
    };
    canvas.addEventListener('pointerdown', this.pointerHandler);

    // Tap effect from server
    const socket = getSocket();
    this.tapEffectHandler = (data: { side: string; x: number; y: number; phrase: string }) => {
      this.tapEffects.push({
        phrase: data.phrase,
        x: data.x,
        y: data.y,
        ttl: 800,
        maxTtl: 800,
      });
    };
    socket.on('tap_effect', this.tapEffectHandler);

    // Attack hit from server (damage was dealt at end of attack cycle)
    this.attackHitHandler = (data: { attacker: string; damage: number }) => {
      const attackerSide = data.attacker as 'left' | 'right';

      // Hit effect at target position
      const targetX = attackerSide === 'left' ? this.rightBaseX + 100 : this.leftBaseX + 300;
      const targetY = DESIGN_H * 0.45;
      this.hitEffects.push({ x: targetX, y: targetY, ttl: 400, damage: data.damage });

      // Play hit sound
      audioManager.playHit();
    };
    socket.on('attack_hit', this.attackHitHandler);

    audioManager.playBg('bg_fight');
  }

  /** Create a looping attack animation for a side, with onCycleComplete for damage sync */
  private setupAttackAnim(side: 'left' | 'right'): void {
    const data = side === 'left' ? this.leftAttackData : this.rightAttackData;
    if (!data || data.frames.length === 0) return;

    // Force loop: create a looping copy of the animation data
    const loopingData: FrameAnimation = { ...data, loop: true };
    const anim = new SpriteAnimation(loopingData);

    // Set duration to match the server's attack interval
    const interval = side === 'left' ? this.leftInterval : this.rightInterval;
    anim.setDuration(interval);

    if (side === 'left') {
      this.leftAttackAnim = anim;
    } else {
      this.rightAttackAnim = anim;
    }
  }

  exit(): void {
    const canvas = getCanvas();
    if (this.pointerHandler) canvas.removeEventListener('pointerdown', this.pointerHandler);

    const socket = getSocket();
    if (this.tapEffectHandler) socket.off('tap_effect', this.tapEffectHandler);
    if (this.attackHitHandler) socket.off('attack_hit', this.attackHitHandler);

    this.pointerHandler = null;
    this.tapEffectHandler = null;
    this.attackHitHandler = null;
  }

  onStateUpdate(state: GameState): void {
    this.state = state;

    // Update animation speed when interval changes
    if (state.fighters) {
      const [left, right] = state.fighters;
      const newLeftInterval = left.attackInterval ?? 2000;
      const newRightInterval = right.attackInterval ?? 2000;

      // Only update if interval changed significantly (avoid jitter)
      if (Math.abs(newLeftInterval - this.leftInterval) > 10) {
        this.leftInterval = newLeftInterval;
        this.leftAttackAnim?.setDuration(newLeftInterval);
      }
      if (Math.abs(newRightInterval - this.rightInterval) > 10) {
        this.rightInterval = newRightInterval;
        this.rightAttackAnim?.setDuration(newRightInterval);
      }
    }
  }

  update(deltaMs: number): void {
    // Update looping attack animations
    this.leftAttackAnim?.update(deltaMs);
    this.rightAttackAnim?.update(deltaMs);

    // Smooth HP display
    if (this.state?.fighters) {
      const [left, right] = this.state.fighters;
      this.leftHpDisplay += (left.hp - this.leftHpDisplay) * 0.15;
      this.rightHpDisplay += (right.hp - this.rightHpDisplay) * 0.15;
    }

    // Update tap effects
    for (let i = this.tapEffects.length - 1; i >= 0; i--) {
      this.tapEffects[i].ttl -= deltaMs;
      if (this.tapEffects[i].ttl <= 0) {
        this.tapEffects.splice(i, 1);
      }
    }

    // Update hit effects
    for (let i = this.hitEffects.length - 1; i >= 0; i--) {
      this.hitEffects[i].ttl -= deltaMs;
      if (this.hitEffects[i].ttl <= 0) {
        this.hitEffects.splice(i, 1);
      }
    }

    // Arena bg animation
    this.arenaBgAnim?.update(deltaMs);
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.state || !this.state.fighters) return;

    const [left, right] = this.state.fighters;

    // Arena background
    if (this.arenaBgAnim && !this.arenaBgAnim.isEmpty) {
      this.arenaBgAnim.render(ctx, 0, 0, DESIGN_W, DESIGN_H);
    } else {
      ctx.fillStyle = '#0a0a1e';
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    }

    // Character sprites
    const charW = 600;
    const charH = 750;
    const charY = DESIGN_H - charH - 80;

    if (this.leftAttackAnim && !this.leftAttackAnim.isEmpty) {
      this.leftAttackAnim.render(ctx, this.leftBaseX, charY, charW, charH, false);
    }
    if (this.rightAttackAnim && !this.rightAttackAnim.isEmpty) {
      this.rightAttackAnim.render(ctx, this.rightBaseX, charY, charW, charH, true);
    }

    // HP bars
    this.renderHpBar(ctx, left, this.leftHpDisplay, 'left');
    this.renderHpBar(ctx, right, this.rightHpDisplay, 'right');

    // Names
    const leftDef = getCharacterDef(left.characterId);
    const rightDef = getCharacterDef(right.characterId);

    drawText(leftDef.name, DESIGN_W * 0.25, 30, {
      font: '20px PressStart2P',
      color: '#FF4444',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 3,
    });
    drawText(rightDef.name, DESIGN_W * 0.75, 30, {
      font: '20px PressStart2P',
      color: '#4488FF',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 3,
    });

    // VS
    drawText('VS', DESIGN_W / 2, 50, {
      font: '28px PressStart2P',
      color: '#FFD700',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 4,
    });

    // Hit effects (flash + damage number)
    for (const hit of this.hitEffects) {
      const alpha = hit.ttl / 400;
      const size = 80 * (1 + (1 - alpha) * 0.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#FFFF00';
      ctx.shadowColor = '#FF0000';
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(hit.x, hit.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Floating damage number
      const floatY = hit.y - (1 - alpha) * 60;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '24px PressStart2P';
      ctx.fillStyle = '#FF2222';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeText(`-${hit.damage}`, hit.x, floatY);
      ctx.fillText(`-${hit.damage}`, hit.x, floatY);
      ctx.restore();
    }

    // Tap effects (floating text)
    for (const tap of this.tapEffects) {
      const progress = 1 - tap.ttl / tap.maxTtl;
      const alpha = 1 - progress;
      const y = tap.y - progress * 80;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '18px PressStart2P';
      ctx.fillStyle = tap.x < DESIGN_W / 2 ? '#FF6666' : '#6688FF';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(tap.phrase, tap.x, y);
      ctx.fillText(tap.phrase, tap.x, y);
      ctx.restore();
    }

    // Tap hint
    drawText('📱 ТАПАЙ — усиливай своего бойца!', DESIGN_W / 2, DESIGN_H - 30, {
      font: '14px PressStart2P',
      color: 'rgba(255,255,255,0.5)',
    });
  }

  private renderHpBar(
    ctx: CanvasRenderingContext2D,
    fighter: Fighter,
    displayHp: number,
    side: 'left' | 'right'
  ): void {
    const barW = 500;
    const barH = 30;
    const barY = 60;
    const barX = side === 'left' ? 50 : DESIGN_W - 50 - barW;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);

    // Red (damage)
    ctx.fillStyle = '#440000';
    ctx.fillRect(barX, barY, barW, barH);

    // HP fill
    const hpRatio = Math.max(0, displayHp / fighter.maxHp);
    const hpColor = hpRatio > 0.5 ? '#44FF44' : hpRatio > 0.25 ? '#FFAA00' : '#FF2222';

    if (side === 'left') {
      ctx.fillStyle = hpColor;
      ctx.fillRect(barX, barY, barW * hpRatio, barH);
    } else {
      // Right bar fills from right to left
      ctx.fillStyle = hpColor;
      ctx.fillRect(barX + barW * (1 - hpRatio), barY, barW * hpRatio, barH);
    }

    // HP text
    drawText(`${Math.ceil(displayHp)}/${fighter.maxHp}`, barX + barW / 2, barY + barH / 2, {
      font: '12px PressStart2P',
      color: '#FFF',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 2,
    });
  }
}
