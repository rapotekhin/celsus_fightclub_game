import type { GameState } from '../types';
import type { IScene } from './SceneManager';
import type { LoadedAssets } from '../engine/AssetLoader';
import { SpriteAnimation } from '../engine/SpriteAnimation';
import { DESIGN_W, DESIGN_H, drawBackground, drawText, drawRoundedRect, screenToCanvas, getCanvas, getCtx } from '../engine/Canvas';
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
  
  // Settings UI state
  private showSettings = false;
  private settingsButtonHovered = false;
  private balanceInput = '1000';
  private currentState: GameState | null = null;
  private activeInput: 'balance' | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(assets: LoadedAssets) {
    this.assets = assets;
  }

  enter(state: GameState): void {
    this.doorHovered = false;
    this.isOpening = false;
    this.showSettings = false;
    this.settingsButtonHovered = false;
    this.currentState = state;
    this.balanceInput = state.balance.toString();

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
      this.settingsButtonHovered = this.isSettingsButtonHitbox(x, y);
      canvas.style.cursor = (this.doorHovered || this.settingsButtonHovered) ? 'pointer' : 'default';
    };

    this.clickHandler = (e: MouseEvent) => {
      if (!getIsAdmin() || this.isOpening) return;
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      
      if (this.showSettings) {
        // Handle settings panel clicks
        if (this.isApplyButtonHitbox(x, y)) {
          this.applySettings();
        } else if (this.isCancelButtonHitbox(x, y)) {
          this.showSettings = false;
          this.activeInput = null;
        } else if (this.isBalanceInputHitbox(x, y)) {
          this.activeInput = 'balance';
        } else if (this.isSettingsPanelHitbox(x, y)) {
          // Click inside panel - do nothing (keep it open)
          return;
        } else {
          // Click outside - close panel
          this.showSettings = false;
          this.activeInput = null;
        }
      } else {
        // Normal mode
        if (this.isSettingsButtonHitbox(x, y)) {
          this.showSettings = true;
          // Update inputs from current state when opening
          if (this.currentState) {
            this.balanceInput = this.currentState.balance.toString();
          }
        } else if (this.isDoorHitbox(x, y)) {
          this.startOpening();
        }
      }
    };

    this.touchHandler = (e: TouchEvent) => {
      if (!getIsAdmin() || this.isOpening) return;
      const touch = e.touches[0];
      if (!touch) return;
      const { x, y } = screenToCanvas(touch.clientX, touch.clientY);
      
      if (this.showSettings) {
        if (this.isApplyButtonHitbox(x, y)) {
          this.applySettings();
        } else if (this.isCancelButtonHitbox(x, y)) {
          this.showSettings = false;
        }
      } else {
        if (this.isSettingsButtonHitbox(x, y)) {
          this.showSettings = true;
          // Update inputs from current state when opening
          if (this.currentState) {
            this.balanceInput = this.currentState.balance.toString();
          }
        } else if (this.isDoorHitbox(x, y)) {
          this.startOpening();
        }
      }
    };

    canvas.addEventListener('mousemove', this.moveHandler);
    canvas.addEventListener('click', this.clickHandler);
    canvas.addEventListener('touchstart', this.touchHandler);

    // Keyboard handler for settings input
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.showSettings || !getIsAdmin()) return;
      
      if (e.key === 'Enter') {
        this.applySettings();
        return;
      }
      if (e.key === 'Escape') {
        this.showSettings = false;
        this.activeInput = null;
        return;
      }
      
      // Handle input field selection
      if (e.key === '1' && e.ctrlKey) {
        this.activeInput = 'balance';
        return;
      }
      
      // Handle typing in active input
      if (this.activeInput === 'balance') {
        if (e.key === 'Backspace') {
          this.balanceInput = this.balanceInput.slice(0, -1);
        } else if (/^\d$/.test(e.key)) {
          // Only allow digits
          this.balanceInput += e.key;
        }
        e.preventDefault();
      }
    };
    
    window.addEventListener('keydown', this.keyHandler);

    audioManager.playBg('bg_club');
  }

  exit(): void {
    const canvas = getCanvas();
    if (this.moveHandler) canvas.removeEventListener('mousemove', this.moveHandler);
    if (this.clickHandler) canvas.removeEventListener('click', this.clickHandler);
    if (this.touchHandler) canvas.removeEventListener('touchstart', this.touchHandler);
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    canvas.style.cursor = 'default';
    this.moveHandler = null;
    this.clickHandler = null;
    this.touchHandler = null;
    this.keyHandler = null;
    this.showSettings = false;
    this.activeInput = null;
  }

  onStateUpdate(state: GameState): void {
    this.currentState = state;
    // Update inputs if they haven't been manually changed
    if (!this.showSettings) {
      this.balanceInput = state.balance.toString();
    }
  }
  
  private applySettings(): void {
    const balance = parseInt(this.balanceInput, 10);
    
    if (!isNaN(balance)) {
      emitAdminAction('set_game_params', { balance });
      this.showSettings = false;
    }
  }
  
  private isSettingsButtonHitbox(x: number, y: number): boolean {
    const btnX = DESIGN_W * 0.05;
    const btnY = DESIGN_H * 0.05;
    const btnW = 200;
    const btnH = 50;
    return x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH;
  }
  
  private isSettingsPanelHitbox(x: number, y: number): boolean {
    const panelX = DESIGN_W * 0.3;
    const panelY = DESIGN_H * 0.3;
    const panelW = DESIGN_W * 0.4;
    const panelH = DESIGN_H * 0.4;
    return x >= panelX && x <= panelX + panelW && y >= panelY && y <= panelY + panelH;
  }
  
  private isApplyButtonHitbox(x: number, y: number): boolean {
    const panelX = DESIGN_W * 0.3;
    const panelY = DESIGN_H * 0.3;
    const panelW = DESIGN_W * 0.4;
    const panelH = DESIGN_H * 0.4;
    const btnX = panelX + panelW * 0.2;
    const btnY = panelY + panelH - 100; // Match render position
    const btnW = 150;
    const btnH = 50;
    return x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH;
  }
  
  private isCancelButtonHitbox(x: number, y: number): boolean {
    const panelX = DESIGN_W * 0.3;
    const panelY = DESIGN_H * 0.3;
    const panelW = DESIGN_W * 0.4;
    const panelH = DESIGN_H * 0.4;
    const btnX = panelX + panelW * 0.6;
    const btnY = panelY + panelH - 100; // Match render position
    const btnW = 150;
    const btnH = 50;
    return x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH;
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

    // Settings button (only for admin, when not opening)
    if (getIsAdmin() && !this.isOpening) {
      const btnX = DESIGN_W * 0.05;
      const btnY = DESIGN_H * 0.05;
      const btnW = 200;
      const btnH = 50;
      
      drawRoundedRect(btnX, btnY, btnW, btnH, 8, 
        this.settingsButtonHovered ? '#444' : '#222', 
        '#FFD700', 2);
      drawText('⚙️ Настройки', btnX + btnW / 2, btnY + btnH / 2, {
        font: '16px PressStart2P',
        color: '#FFD700',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 2,
      });
    }

    // Settings panel
    if (this.showSettings && getIsAdmin()) {
      const panelX = DESIGN_W * 0.3;
      const panelY = DESIGN_H * 0.3;
      const panelW = DESIGN_W * 0.4;
      const panelH = DESIGN_H * 0.4;
      
      // Dark overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
      
      // Panel background
      drawRoundedRect(panelX, panelY, panelW, panelH, 12, '#1a1a1a', '#FFD700', 3);
      
      // Title
      drawText('Настройки игры', panelX + panelW / 2, panelY + 40, {
        font: '24px PressStart2P',
        color: '#FFD700',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 3,
      });
      
      // Balance input area
      const inputY1 = panelY + 120;
      drawText('Баланс:', panelX + 50, inputY1, {
        font: '18px PressStart2P',
        color: '#FFF',
        align: 'left',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 2,
      });
      const balanceInputX = panelX + 200;
      const balanceInputY = inputY1 - 25;
      drawRoundedRect(balanceInputX, balanceInputY, 200, 40, 6, 
        this.activeInput === 'balance' ? '#444' : '#333', 
        this.activeInput === 'balance' ? '#FFF' : '#FFD700', 2);
      drawText(this.balanceInput || '0', balanceInputX + 100, inputY1, {
        font: '18px PressStart2P',
        color: '#FFD700',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 2,
      });
      if (this.activeInput === 'balance') {
        // Cursor indicator
        const ctx = getCtx();
        const textWidth = ctx.measureText(this.balanceInput || '0').width;
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(balanceInputX + 100 + textWidth / 2, inputY1 - 15, 2, 20);
      }
      
      // Apply button (moved down to avoid overlapping input fields)
      const btnW = 150;
      const btnH = 50;
      const applyX = panelX + panelW * 0.2;
      const applyY = panelY + panelH - 100; // Move buttons to bottom of panel
      drawRoundedRect(applyX, applyY, btnW, btnH, 8, '#2a5', '#FFF', 2);
      drawText('Применить', applyX + btnW / 2, applyY + btnH / 2, {
        font: '16px PressStart2P',
        color: '#FFF',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 2,
      });
      
      // Cancel button (moved down to avoid overlapping input fields)
      const cancelX = panelX + panelW * 0.6;
      const cancelY = panelY + panelH - 100; // Move buttons to bottom of panel
      drawRoundedRect(cancelX, cancelY, btnW, btnH, 8, '#a22', '#FFF', 2);
      drawText('Отмена', cancelX + btnW / 2, cancelY + btnH / 2, {
        font: '16px PressStart2P',
        color: '#FFF',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 2,
      });
      
      // Hint text (moved up to avoid overlapping with buttons)
      drawText('Кликните на поле или Ctrl+1 для выбора', panelX + panelW / 2, panelY + panelH - 150, {
        font: '12px PressStart2P',
        color: '#AAA',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 2,
      });
      drawText('Enter - применить, Esc - отмена', panelX + panelW / 2, panelY + panelH - 125, {
        font: '12px PressStart2P',
        color: '#AAA',
        stroke: true,
        strokeColor: '#000',
        strokeWidth: 2,
      });
    }

    // Hover text
    if (this.doorHovered && !this.isOpening && !this.showSettings && getIsAdmin()) {
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

    // QR Code in bottom right corner
    const qrImg = this.assets.images.get('qr_code');
    if (qrImg) {
      const qrSize = 200; // Size of QR code
      const qrX = DESIGN_W - qrSize - 20; // 20px from right edge
      const qrY = DESIGN_H - qrSize - 20; // 20px from bottom edge
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    }
  }
}
