import type { GameState } from '../types';
import type { IScene } from './SceneManager';
import type { LoadedAssets } from '../engine/AssetLoader';
import { DESIGN_W, DESIGN_H, drawBackground, drawText, drawRoundedRect, getCanvas } from '../engine/Canvas';
import { emitAdminAction, emitPlaceBet, getIsAdmin } from '../socket';
import { getCharacterDef } from '../data/characters';

export class PreFightScene implements IScene {
  private assets: LoadedAssets;
  private state: GameState | null = null;
  private overlay: HTMLDivElement | null = null;
  private betAmount = 0;
  private betSide: 'left' | 'right' = 'left';

  constructor(assets: LoadedAssets) {
    this.assets = assets;
  }

  enter(state: GameState): void {
    this.state = state;
    this.betAmount = 0;
    this.betSide = 'left';
    this.createOverlay();
  }

  exit(): void {
    this.removeOverlay();
  }

  onStateUpdate(state: GameState): void {
    this.state = state;
    this.updateOverlay();
  }

  update(_deltaMs: number): void {
    // Static scene
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.state || !this.state.fighters || !this.state.bet) return;

    const [left, right] = this.state.fighters;
    const leftDef = getCharacterDef(left.characterId);
    const rightDef = getCharacterDef(right.characterId);

    // Background
    const arenaAnim = this.assets.animations.get('bg_arena');
    const bgImg = this.assets.images.get('character_sheet_bg') || (arenaAnim?.frames[0] ?? null);
    if (bgImg) {
      drawBackground(bgImg);
    } else {
      ctx.fillStyle = '#0a0a2e';
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    }

    // Dim overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);

    // Character sheets — large, closer to center
    const sheetW = 450;
    const sheetH = 675;
    const sheetY = 40;
    const leftCenterX = DESIGN_W * 0.27;
    const rightCenterX = DESIGN_W * 0.73;

    const leftSheet = this.assets.images.get(`${left.characterId}_sheet`);
    if (leftSheet) {
      const leftX = leftCenterX - sheetW / 2;
      drawRoundedRect(leftX - 10, sheetY - 10, sheetW + 20, sheetH + 20, 14, 'rgba(255,50,50,0.2)', '#FF4444', 3);
      ctx.drawImage(leftSheet, leftX, sheetY, sheetW, sheetH);
    }

    const rightSheet = this.assets.images.get(`${right.characterId}_sheet`);
    if (rightSheet) {
      const rightX = rightCenterX - sheetW / 2;
      drawRoundedRect(rightX - 10, sheetY - 10, sheetW + 20, sheetH + 20, 14, 'rgba(50,50,255,0.2)', '#4488FF', 3);
      ctx.drawImage(rightSheet, rightX, sheetY, sheetW, sheetH);
    }

    // Names under sheets
    drawText(leftDef.name, leftCenterX, sheetY + sheetH + 35, {
      font: '24px PressStart2P',
      color: '#FF4444',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 4,
    });
    drawText(rightDef.name, rightCenterX, sheetY + sheetH + 35, {
      font: '24px PressStart2P',
      color: '#4488FF',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 4,
    });

    // VS centered between sheets
    drawText('VS', DESIGN_W / 2, sheetY + sheetH / 2, {
      font: '56px PressStart2P',
      color: '#FFD700',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 8,
    });

    // Odds under names
    drawText(`x${this.state.bet.leftOdds}`, leftCenterX, sheetY + sheetH + 75, {
      font: '28px PressStart2P',
      color: '#FF4444',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 4,
    });
    drawText(`x${this.state.bet.rightOdds}`, rightCenterX, sheetY + sheetH + 75, {
      font: '28px PressStart2P',
      color: '#4488FF',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 4,
    });

    // Bet info (above balance)
    if (this.state.bet.playerBet) {
      const betSideText = this.state.bet.playerBet.side === 'left' ? leftDef.name : rightDef.name;
      const betColor = this.state.bet.playerBet.side === 'left' ? '#FF4444' : '#4488FF';
      drawText(
        `Ставка: ${this.state.bet.playerBet.amount.toLocaleString('ru-RU')} ₽ на ${betSideText}`,
        DESIGN_W / 2, sheetY + sheetH + 130,
        {
          font: '18px PressStart2P',
          color: betColor,
          stroke: true,
          strokeColor: '#000',
          strokeWidth: 3,
        }
      );
    }

    // Balance
    drawText(`💰 ${this.state.balance.toLocaleString('ru-RU')} ₽`, DESIGN_W / 2, sheetY + sheetH + 170, {
      font: '24px PressStart2P',
      color: '#FFD700',
      stroke: true,
      strokeColor: '#000',
      strokeWidth: 4,
    });
  }

  private createOverlay(): void {
    if (!getIsAdmin()) return;

    this.removeOverlay();

    const overlay = document.getElementById('ui-overlay')!;
    const div = document.createElement('div');
    div.id = 'prefight-controls';
    div.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 12px;
      align-items: center;
      flex-direction: column;
      z-index: 10;
    `;

    // Bet controls
    const betRow = document.createElement('div');
    betRow.style.cssText = 'display: flex; gap: 10px; align-items: center;';

    const sideSelect = document.createElement('select');
    sideSelect.style.cssText = 'font-family: PressStart2P; font-size: 12px; padding: 8px; border-radius: 8px; background: #222; color: #fff; border: 2px solid #FFD700;';

    const leftName = this.state?.fighters ? getCharacterDef(this.state.fighters[0].characterId).name : 'Левый';
    const rightName = this.state?.fighters ? getCharacterDef(this.state.fighters[1].characterId).name : 'Правый';

    sideSelect.innerHTML = `
      <option value="left">${leftName}</option>
      <option value="right">${rightName}</option>
    `;
    sideSelect.onchange = () => {
      this.betSide = sideSelect.value as 'left' | 'right';
    };

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.placeholder = 'Ставка ₽';
    amountInput.min = '0';
    amountInput.max = String(this.state?.balance ?? 0);
    amountInput.style.cssText = 'font-family: PressStart2P; font-size: 12px; padding: 8px; width: 150px; border-radius: 8px; background: #222; color: #FFD700; border: 2px solid #FFD700; text-align: center;';
    amountInput.oninput = () => {
      this.betAmount = parseInt(amountInput.value) || 0;
    };

    const betBtn = document.createElement('button');
    betBtn.textContent = 'Ставка!';
    betBtn.style.cssText = 'font-family: PressStart2P; font-size: 14px; padding: 10px 20px; border-radius: 8px; background: #FFD700; color: #000; border: none; cursor: pointer;';
    betBtn.onclick = () => {
      if (this.betAmount > 0) {
        emitPlaceBet(this.betSide, this.betAmount);
      }
    };

    betRow.append(sideSelect, amountInput, betBtn);

    // Fight button — disabled until bet is placed
    const fightBtn = document.createElement('button');
    fightBtn.textContent = '⚔️ БОЙ! ⚔️';
    fightBtn.dataset.id = 'fight-btn';
    const fightBtnActiveStyle = `
      font-family: PressStart2P;
      font-size: 24px;
      padding: 16px 48px;
      border-radius: 12px;
      background: linear-gradient(180deg, #FF4444, #CC0000);
      color: #FFD700;
      border: 3px solid #FFD700;
      cursor: pointer;
      text-shadow: 2px 2px 4px #000;
      box-shadow: 0 4px 12px rgba(255,0,0,0.5);
      transition: transform 0.1s, opacity 0.3s;
      opacity: 1;
    `;
    const fightBtnDisabledStyle = `
      font-family: PressStart2P;
      font-size: 24px;
      padding: 16px 48px;
      border-radius: 12px;
      background: linear-gradient(180deg, #666, #444);
      color: #999;
      border: 3px solid #666;
      cursor: not-allowed;
      text-shadow: 2px 2px 4px #000;
      box-shadow: none;
      transition: transform 0.1s, opacity 0.3s;
      opacity: 0.5;
    `;

    const hasBet = !!this.state?.bet?.playerBet;
    fightBtn.style.cssText = hasBet ? fightBtnActiveStyle : fightBtnDisabledStyle;

    fightBtn.onmousedown = () => { if (this.state?.bet?.playerBet) fightBtn.style.transform = 'scale(0.95)'; };
    fightBtn.onmouseup = () => { fightBtn.style.transform = 'scale(1)'; };
    fightBtn.onclick = () => {
      if (!this.state?.bet?.playerBet) return;
      emitAdminAction('start_fight');
    };

    div.append(betRow, fightBtn);
    overlay.appendChild(div);
    this.overlay = div;
  }

  private updateOverlay(): void {
    if (!this.overlay || !this.state) return;

    const input = this.overlay.querySelector('input');
    if (input) {
      (input as HTMLInputElement).max = String(this.state.balance);
    }

    // Toggle fight button based on bet
    const fightBtn = this.overlay.querySelector('[data-id="fight-btn"]') as HTMLButtonElement | null;
    if (fightBtn) {
      const hasBet = !!this.state.bet?.playerBet;
      if (hasBet) {
        fightBtn.style.background = 'linear-gradient(180deg, #FF4444, #CC0000)';
        fightBtn.style.color = '#FFD700';
        fightBtn.style.border = '3px solid #FFD700';
        fightBtn.style.cursor = 'pointer';
        fightBtn.style.boxShadow = '0 4px 12px rgba(255,0,0,0.5)';
        fightBtn.style.opacity = '1';
      } else {
        fightBtn.style.background = 'linear-gradient(180deg, #666, #444)';
        fightBtn.style.color = '#999';
        fightBtn.style.border = '3px solid #666';
        fightBtn.style.cursor = 'not-allowed';
        fightBtn.style.boxShadow = 'none';
        fightBtn.style.opacity = '0.5';
      }
    }
  }

  private removeOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
