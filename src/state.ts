import type { GameState, Scene } from './types';

/**
 * Client-side mirror of the game state (read-only).
 */

let currentState: GameState = {
  scene: 'landing',
  balance: 0,
  round: 0,
  usedCharacterIds: [],
  fighters: null,
  bet: null,
  dialogStep: 0,
  fightResult: null,
  adminSocketId: null,
};

export function updateState(state: GameState): void {
  currentState = state;
}

export function getState(): GameState {
  return currentState;
}

export function getScene(): Scene {
  return currentState.scene;
}
