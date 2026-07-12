import { io } from 'socket.io-client';

/**
 * Singleton wrapper around the Socket.io connection.
 * Connects lazily; auth payload (name + optional Supabase JWT) is provided
 * at connect time.
 */
class SocketClient {
  constructor() {
    this.socket = null;
  }

  connect({ name, token }) {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.socket = io({
      auth: { name, token },
      transports: ['websocket'],
    });
    return new Promise((resolve, reject) => {
      this.socket.once('connect', () => resolve(this.socket));
      this.socket.once('connect_error', (err) => reject(err));
    });
  }

  get id() {
    return this.socket?.id ?? null;
  }

  get connected() {
    return Boolean(this.socket?.connected);
  }

  emit(event, payload) {
    this.socket?.emit(event, payload);
  }

  /** emit with ack callback, promisified */
  request(event, payload) {
    return new Promise((resolve) => {
      if (!this.socket) return resolve({ ok: false, error: 'Not connected' });
      this.socket.timeout(5000).emit(event, payload, (err, res) => {
        if (err) return resolve({ ok: false, error: 'Server timeout' });
        resolve(res);
      });
    });
  }

  on(event, fn) {
    this.socket?.on(event, fn);
    return () => this.socket?.off(event, fn);
  }

  off(event, fn) {
    this.socket?.off(event, fn);
  }
}

export const socketClient = new SocketClient();
