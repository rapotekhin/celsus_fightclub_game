/**
 * Canvas helper — setup, resize, and utility drawing functions.
 */

export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

let _canvas: HTMLCanvasElement;
let _ctx: CanvasRenderingContext2D;

export function initCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  _canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  _ctx = _canvas.getContext('2d')!;

  _canvas.width = DESIGN_W;
  _canvas.height = DESIGN_H;

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  return { canvas: _canvas, ctx: _ctx };
}

export function getCanvas(): HTMLCanvasElement {
  return _canvas;
}

export function getCtx(): CanvasRenderingContext2D {
  return _ctx;
}

export function resizeCanvas(): void {
  if (!_canvas) return;

  const scaleX = window.innerWidth / DESIGN_W;
  const scaleY = window.innerHeight / DESIGN_H;
  const scale = Math.min(scaleX, scaleY);

  _canvas.style.width = `${DESIGN_W * scale}px`;
  _canvas.style.height = `${DESIGN_H * scale}px`;
}

/**
 * Convert screen coordinates (from pointer events) to canvas design coordinates.
 */
export function screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
  const rect = _canvas.getBoundingClientRect();
  const scaleX = DESIGN_W / rect.width;
  const scaleY = DESIGN_H / rect.height;
  return {
    x: (screenX - rect.left) * scaleX,
    y: (screenY - rect.top) * scaleY,
  };
}

/**
 * Clear the entire canvas.
 */
export function clearCanvas(): void {
  _ctx.clearRect(0, 0, DESIGN_W, DESIGN_H);
}

/**
 * Fill the canvas with a solid color.
 */
export function fillBackground(color: string): void {
  _ctx.fillStyle = color;
  _ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
}

/**
 * Draw an image covering the entire canvas (background).
 */
export function drawBackground(img: HTMLImageElement): void {
  _ctx.drawImage(img, 0, 0, DESIGN_W, DESIGN_H);
}

/**
 * Draw text with common settings.
 */
export function drawText(
  text: string,
  x: number,
  y: number,
  options: {
    font?: string;
    color?: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    maxWidth?: number;
    stroke?: boolean;
    strokeColor?: string;
    strokeWidth?: number;
  } = {}
): void {
  _ctx.save();
  _ctx.font = options.font ?? '24px PressStart2P';
  _ctx.fillStyle = options.color ?? '#FFFFFF';
  _ctx.textAlign = options.align ?? 'center';
  _ctx.textBaseline = options.baseline ?? 'middle';

  if (options.stroke) {
    _ctx.strokeStyle = options.strokeColor ?? '#000000';
    _ctx.lineWidth = options.strokeWidth ?? 4;
    _ctx.lineJoin = 'round';
    _ctx.strokeText(text, x, y, options.maxWidth);
  }

  _ctx.fillText(text, x, y, options.maxWidth);
  _ctx.restore();
}

/**
 * Draw a rounded rectangle.
 */
export function drawRoundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fillColor: string,
  strokeColor?: string,
  strokeWidth?: number
): void {
  _ctx.save();
  _ctx.beginPath();
  _ctx.roundRect(x, y, w, h, radius);
  _ctx.fillStyle = fillColor;
  _ctx.fill();
  if (strokeColor) {
    _ctx.strokeStyle = strokeColor;
    _ctx.lineWidth = strokeWidth ?? 2;
    _ctx.stroke();
  }
  _ctx.restore();
}
