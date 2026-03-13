import type { Scene, GameState } from '../types';
import type { LoadedAssets } from '../engine/AssetLoader';

/**
 * IScene — interface that all scenes must implement.
 */
export interface IScene {
  /** Called when scene becomes active. */
  enter(state: GameState): void;
  /** Called when scene is no longer active. */
  exit(): void;
  /** Called on state_sync from server. */
  onStateUpdate(state: GameState): void;
  /** Called each frame. */
  update(deltaMs: number): void;
  /** Called each frame to render. */
  render(ctx: CanvasRenderingContext2D): void;
}

/**
 * SceneManager — switches between game scenes based on GameState.scene.
 */
export class SceneManager {
  private scenes: Map<Scene, IScene> = new Map();
  private currentScene: Scene | null = null;
  private assets: LoadedAssets;

  constructor(assets: LoadedAssets) {
    this.assets = assets;
  }

  register(sceneName: Scene, scene: IScene): void {
    this.scenes.set(sceneName, scene);
  }

  getAssets(): LoadedAssets {
    return this.assets;
  }

  getCurrentScene(): IScene | undefined {
    if (!this.currentScene) return undefined;
    return this.scenes.get(this.currentScene);
  }

  /**
   * Transition to a new scene.
   */
  switchTo(sceneName: Scene, state: GameState): void {
    if (this.currentScene === sceneName) return;

    // Exit current scene
    if (this.currentScene) {
      const current = this.scenes.get(this.currentScene);
      current?.exit();
    }

    this.currentScene = sceneName;
    const next = this.scenes.get(sceneName);
    if (next) {
      next.enter(state);
    } else {
      console.warn(`Scene not found: ${sceneName}`);
    }
  }

  /**
   * Handle state sync from server — may trigger scene switch.
   */
  onStateUpdate(state: GameState): void {
    if (state.scene !== this.currentScene) {
      this.switchTo(state.scene, state);
    }

    const scene = this.scenes.get(state.scene);
    scene?.onStateUpdate(state);
  }

  update(deltaMs: number): void {
    if (!this.currentScene) return;
    const scene = this.scenes.get(this.currentScene);
    scene?.update(deltaMs);
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.currentScene) return;
    const scene = this.scenes.get(this.currentScene);
    scene?.render(ctx);
  }
}
