/**
 * AssetLoader — loads frame-folder sprites, single images, and tracks progress.
 * Sprites are folders of individual PNG files sorted by name.
 */

export interface FrameAnimation {
  frames: HTMLImageElement[];
  fps: number;
  loop: boolean;
}

interface SpriteManifest {
  frames: string[];
}

const imageCache = new Map<string, HTMLImageElement>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  if (imageCache.has(src)) return Promise.resolve(imageCache.get(src)!);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

// Must match FRAME_STEP on the server (server.js)
const FRAME_STEP = 10;

/**
 * Fetch the list of frame files from a sprite folder via the server API.
 */
async function fetchFrameList(folderPath: string): Promise<string[]> {
  try {
    const resp = await fetch(`/api/sprite-frames/${folderPath}`);
    const data: SpriteManifest = await resp.json();
    return data.frames;
  } catch {
    console.warn(`Could not fetch frame list for ${folderPath}`);
    return [];
  }
}

/**
 * Load all frames from a sprite folder.
 * @param folderPath Path relative to assets/ (e.g. "sprites/characters/kacher/idle")
 * @param fps Playback speed
 * @param loop Whether animation loops
 * @param onProgress Optional callback for loading progress
 */
export async function loadFrameAnimation(
  folderPath: string,
  fps: number = 24,
  loop: boolean = true,
  onProgress?: (loaded: number, total: number) => void
): Promise<FrameAnimation> {
  const fileNames = await fetchFrameList(folderPath);

  if (fileNames.length === 0) {
    console.warn(`No frames found in ${folderPath}`);
    return { frames: [], fps, loop };
  }

  const frames: HTMLImageElement[] = [];
  let loaded = 0;

  // Load frames in parallel batches of 10
  const batchSize = 10;
  for (let i = 0; i < fileNames.length; i += batchSize) {
    const batch = fileNames.slice(i, i + batchSize);
    const batchFrames = await Promise.all(
      batch.map((fileName) => loadImage(`/${folderPath}/${fileName}`))
    );
    frames.push(...batchFrames);
    loaded += batchFrames.length;
    onProgress?.(loaded, fileNames.length);
  }

  // With thinned frames (every Nth), keep fps moderate so loops aren't too frantic.
  // Original: 145 frames @ 24fps ≈ 6s. Thinned: 15 frames @ 8fps ≈ 1.9s loop — looks fine.
  const adjustedFps = Math.max(Math.round(fps / (FRAME_STEP / 3)), 4);

  return { frames, fps: adjustedFps, loop };
}

/**
 * Preload a set of assets and report overall progress.
 */
export interface AssetManifestEntry {
  key: string;
  type: 'image' | 'animation';
  path: string;
  fps?: number;
  loop?: boolean;
}

export interface LoadedAssets {
  images: Map<string, HTMLImageElement>;
  animations: Map<string, FrameAnimation>;
}

export async function preloadAssets(
  manifest: AssetManifestEntry[],
  onProgress?: (loaded: number, total: number) => void
): Promise<LoadedAssets> {
  const result: LoadedAssets = {
    images: new Map(),
    animations: new Map(),
  };

  let loaded = 0;
  const total = manifest.length;

  for (const entry of manifest) {
    try {
      if (entry.type === 'image') {
        const img = await loadImage(entry.path);
        result.images.set(entry.key, img);
      } else if (entry.type === 'animation') {
        const anim = await loadFrameAnimation(
          entry.path,
          entry.fps ?? 24,
          entry.loop ?? true
        );
        result.animations.set(entry.key, anim);
      }
    } catch (e) {
      console.error(`Failed to load asset "${entry.key}":`, e);
    }
    loaded++;
    onProgress?.(loaded, total);
  }

  return result;
}

/**
 * Build manifest for a character's sprite animations.
 */
export function characterAnimManifest(charId: string): AssetManifestEntry[] {
  const basePath = `sprites/characters/${charId}`;
  return [
    { key: `${charId}_idle`, type: 'animation', path: `${basePath}/idle`, fps: 24, loop: true },
    { key: `${charId}_attack`, type: 'animation', path: `${basePath}/attack`, fps: 30, loop: false },
    { key: `${charId}_beaten`, type: 'animation', path: `${basePath}/beaten`, fps: 24, loop: false },
    { key: `${charId}_winner`, type: 'animation', path: `${basePath}/winner`, fps: 24, loop: false },
    { key: `${charId}_fatality`, type: 'animation', path: `${basePath}/fatality`, fps: 24, loop: false },
    { key: `${charId}_sheet`, type: 'image', path: `/${basePath}/character_sheet.png` },
  ];
}

/**
 * Build manifest for common game assets.
 */
export function commonAssetManifest(): AssetManifestEntry[] {
  return [
    // Backgrounds
    { key: 'bg_club_exterior', type: 'image', path: '/sprites/backgrounds/club_exterior.png' },
    { key: 'bg_intro', type: 'image', path: '/sprites/backgrounds/intro_bg.png' },
    { key: 'bg_arena', type: 'animation', path: 'sprites/backgrounds/fight_arena', fps: 24, loop: true },
    { key: 'character_sheet_bg', type: 'image', path: '/sprites/characters/character_sheet_background.png' },

    // Door animations
    { key: 'door_idle', type: 'animation', path: 'sprites/door/door_idle', fps: 24, loop: true },
    { key: 'door_open', type: 'animation', path: 'sprites/door/door_open', fps: 24, loop: false },

    // Effects
    { key: 'hit_effect', type: 'animation', path: 'sprites/effects/hit_effect', fps: 12, loop: false },
    { key: 'money_effect', type: 'animation', path: 'sprites/effects/money_effect', fps: 12, loop: false },

    // QR Code
    { key: 'qr_code', type: 'image', path: '/qr-code.gif' },
  ];
}
