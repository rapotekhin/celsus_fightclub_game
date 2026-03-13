import { Howl, Howler } from 'howler';

/**
 * AudioManager — centralized audio playback using Howler.js.
 */

interface SoundDef {
  src: string[];
  loop?: boolean;
  volume?: number;
}

const SOUNDS: Record<string, SoundDef> = {
  bg_club: { src: ['/audio/bg_club.wav'], loop: true, volume: 0.3 },
  bg_fight: { src: ['/audio/bg_fight.wav'], loop: true, volume: 0.4 },
  hit_1: { src: ['/audio/hit_1.wav'], volume: 0.5 },
  hit_2: { src: ['/audio/hit_2.wav'], volume: 0.5 },
  fatality: { src: ['/audio/fatality.mp3'], volume: 0.7 },
  crowd_cheer: { src: ['/audio/crowd_cheer.wav'], volume: 0.6 },
  money_coins: { src: ['/audio/money_coins.wav'], volume: 0.5 },
  door_open: { src: ['/audio/door_open.wav'], volume: 0.6 },
};

class AudioManager {
  private howls: Map<string, Howl> = new Map();
  private currentBg: string | null = null;
  private muted = false;

  constructor() {
    // Pre-create all howl instances
    for (const [key, def] of Object.entries(SOUNDS)) {
      this.howls.set(
        key,
        new Howl({
          src: def.src,
          loop: def.loop ?? false,
          volume: def.volume ?? 1.0,
          preload: true,
        })
      );
    }
  }

  play(soundKey: string): void {
    const howl = this.howls.get(soundKey);
    if (howl) howl.play();
  }

  stop(soundKey: string): void {
    const howl = this.howls.get(soundKey);
    if (howl) howl.stop();
  }

  /**
   * Play background music (stops any currently playing bg).
   */
  playBg(soundKey: string): void {
    if (this.currentBg === soundKey) return;
    if (this.currentBg) {
      this.stop(this.currentBg);
    }
    this.currentBg = soundKey;
    this.play(soundKey);
  }

  stopBg(): void {
    if (this.currentBg) {
      this.stop(this.currentBg);
      this.currentBg = null;
    }
  }

  /**
   * Play a random hit sound.
   */
  playHit(): void {
    const key = Math.random() < 0.5 ? 'hit_1' : 'hit_2';
    this.play(key);
  }

  toggleMute(): void {
    this.muted = !this.muted;
    Howler.mute(this.muted);
  }

  get isMuted(): boolean {
    return this.muted;
  }
}

export const audioManager = new AudioManager();
