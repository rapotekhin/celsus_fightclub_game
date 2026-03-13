import type { FrameAnimation } from './AssetLoader';

/**
 * SpriteAnimation — plays frame-by-frame animations loaded from folders.
 * Supports loop, onComplete callback, speed control via setDuration, and mirroring.
 */
export class SpriteAnimation {
  private currentFrame = 0;
  private elapsed = 0;
  private done = false;
  private animation: FrameAnimation;
  private overrideFps: number | null = null;
  public onComplete?: () => void;
  /** Called every time a looping animation completes one cycle */
  public onCycleComplete?: () => void;

  constructor(animation: FrameAnimation, onComplete?: () => void) {
    this.animation = animation;
    this.onComplete = onComplete;
  }

  get isEmpty(): boolean {
    return this.animation.frames.length === 0;
  }

  get isDone(): boolean {
    return this.done;
  }

  get frameCount(): number {
    return this.animation.frames.length;
  }

  get frameWidth(): number {
    if (this.animation.frames.length === 0) return 0;
    return this.animation.frames[0].naturalWidth;
  }

  get frameHeight(): number {
    if (this.animation.frames.length === 0) return 0;
    return this.animation.frames[0].naturalHeight;
  }

  get isLoop(): boolean {
    return this.animation.loop;
  }

  /** Progress of current cycle: 0.0 → 1.0 */
  get progress(): number {
    if (this.animation.frames.length === 0) return 0;
    return this.currentFrame / this.animation.frames.length;
  }

  reset(): void {
    this.currentFrame = 0;
    this.elapsed = 0;
    this.done = false;
  }

  setAnimation(animation: FrameAnimation, onComplete?: () => void): void {
    this.animation = animation;
    this.onComplete = onComplete;
    this.overrideFps = null;
    this.reset();
  }

  /**
   * Set the total duration of one animation cycle in milliseconds.
   * This overrides the default fps so that all frames fit within `durationMs`.
   * Example: 8 frames, durationMs=800 → each frame is 100ms → effective fps=10.
   */
  setDuration(durationMs: number): void {
    if (this.animation.frames.length === 0 || durationMs <= 0) return;
    this.overrideFps = (this.animation.frames.length * 1000) / durationMs;
  }

  /** Get the effective FPS (considering duration override) */
  private getEffectiveFps(): number {
    return this.overrideFps ?? this.animation.fps;
  }

  update(deltaMs: number): void {
    if (this.done || this.animation.frames.length === 0) return;

    this.elapsed += deltaMs;
    const frameDuration = 1000 / this.getEffectiveFps();

    while (this.elapsed >= frameDuration && !this.done) {
      this.elapsed -= frameDuration;
      this.currentFrame++;

      if (this.currentFrame >= this.animation.frames.length) {
        if (this.animation.loop) {
          this.currentFrame = 0;
          this.onCycleComplete?.();
        } else {
          this.currentFrame = this.animation.frames.length - 1;
          this.done = true;
          this.onComplete?.();
        }
      }
    }
  }

  /**
   * Render the current frame.
   */
  render(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width?: number,
    height?: number,
    mirror: boolean = false
  ): void {
    if (this.animation.frames.length === 0) return;

    const frame = this.animation.frames[this.currentFrame];
    if (!frame) return;

    const w = width ?? frame.naturalWidth;
    const h = height ?? frame.naturalHeight;

    ctx.save();
    if (mirror) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(frame, 0, 0, w, h);
    } else {
      ctx.drawImage(frame, x, y, w, h);
    }
    ctx.restore();
  }
}
