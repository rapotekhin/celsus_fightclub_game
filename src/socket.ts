import { io, Socket } from 'socket.io-client';
import type { GameState, AdminAction } from './types';

/**
 * Socket.IO client singleton.
 */

let socket: Socket;
let isAdmin = false;

export function initSocket(): Socket {
  // Detect admin role from URL
  const params = new URLSearchParams(window.location.search);
  isAdmin = params.get('role') === 'admin';

  socket = io({
    query: { role: isAdmin ? 'admin' : 'player' },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log(`[Socket] Connected as ${isAdmin ? 'ADMIN' : 'player'}: ${socket.id}`);
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
  });

  return socket;
}

export function getSocket(): Socket {
  return socket;
}

export function getIsAdmin(): boolean {
  return isAdmin;
}

// === Emit helpers ===

export function emitAdminAction(action: AdminAction, params?: { balance?: number }): void {
  if (!isAdmin) return;
  socket.emit('admin_action', { action, params });
}

export function emitTap(x: number, y: number): void {
  socket.emit('tap', { x, y });
}

export function emitPlaceBet(side: 'left' | 'right', amount: number): void {
  if (!isAdmin) return;
  socket.emit('place_bet', { side, amount });
}

// === State listener ===

type StateListener = (state: GameState) => void;
const stateListeners: StateListener[] = [];

export function onStateSync(listener: StateListener): void {
  stateListeners.push(listener);
}

export function setupStateSync(): void {
  socket.on('state_sync', (data: { state: GameState }) => {
    for (const listener of stateListeners) {
      listener(data.state);
    }
  });
}

// === Event listeners ===

type TapEffectListener = (data: { side: 'left' | 'right'; x: number; y: number; phrase: string }) => void;
type AttackHitListener = (data: { attacker: 'left' | 'right'; damage: number }) => void;

export function onTapEffect(listener: TapEffectListener): void {
  socket.on('tap_effect', listener);
}

export function onAttackHit(listener: AttackHitListener): void {
  socket.on('attack_hit', listener);
}
