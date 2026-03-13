import type { GameState } from '../types';
import type { IScene } from './SceneManager';
import type { LoadedAssets } from '../engine/AssetLoader';
import { DESIGN_W, DESIGN_H, drawBackground, drawText, getCanvas } from '../engine/Canvas';
import { emitAdminAction, getIsAdmin } from '../socket';
import { audioManager } from '../audio/AudioManager';

export class WinScene implements IScene {
  private assets: LoadedAssets;
  private state: GameState | null = null;
  private timer = 0;
  private overlay: HTMLDivElement | null = null;

  constructor(assets: LoadedAssets) {
    this.assets = assets;
  }

  enter(state: GameState): void {
    this.state = state;
    this.timer = 0;

    audioManager.stopBg();
    audioManager.play('crowd_cheer');

    this.createOverlay();
  }

  exit(): void {
    this.removeOverlay();
  }

  onStateUpdate(state: GameState): void {
    this.state = state;
  }

  update(deltaMs: number): void {
    this.timer += deltaMs;
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Background
    const bgImg = this.assets.images.get('bg_intro');
    if (bgImg) {
      drawBackground(bgImg);
    } else {
      ctx.fillStyle = '#0a0a2e';
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    }

    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    // Trophy
    const pulse = Math.sin(this.timer / 500) * 0.1 + 1;
    ctx.save();
    ctx.translate(DESIGN_W / 2, DESIGN_H * 0.25);
    ctx.scale(pulse, pulse);
    drawText('🏆', 0, 0, {
      font: '120px PressStart2P',
    });
    ctx.restore();

    // Title
    drawText('ВЫ ВЫИГРАЛИ!', DESIGN_W / 2, DESIGN_H * 0.45, {
      font: '48px PressStart2P',
      color: '#FFD700',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 8,
    });

    // Balance
    const balance = this.state?.balance ?? 0;
    drawText(`💰 ${balance.toLocaleString('ru-RU')} ₽`, DESIGN_W / 2, DESIGN_H * 0.55, {
      font: '36px PressStart2P',
      color: balance > 0 ? '#44FF44' : '#FF4444',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 6,
    });

    // Rounds played
    drawText(`Раундов: ${this.state?.round ?? 0}`, DESIGN_W / 2, DESIGN_H * 0.63, {
      font: '20px PressStart2P',
      color: '#AAAAAA',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 3,
    });
  }

  private createOverlay(): void {
    if (!getIsAdmin()) return;
    this.removeOverlay();

    const container = document.getElementById('ui-overlay')!;
    const div = document.createElement('div');
    div.id = 'win-controls';
    div.style.cssText = `
      position: absolute;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10;
    `;

    const btn = document.createElement('button');
    btn.textContent = 'Закрыть';
    btn.style.cssText = `
      font-family: PressStart2P;
      font-size: 20px;
      padding: 16px 40px;
      border-radius: 12px;
      background: linear-gradient(180deg, #444, #222);
      color: #FFD700;
      border: 2px solid #FFD700;
      cursor: pointer;
    `;
    btn.onclick = () => {
      emitAdminAction('close_win_screen');
    };

    div.appendChild(btn);
    container.appendChild(div);
    this.overlay = div;
  }

  private removeOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
