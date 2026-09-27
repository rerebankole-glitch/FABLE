// Multiplayer networking layer.
// The game talks to a server through the Transport interface using the JSON protocol below.
// In singleplayer a NullTransport is used. A WebSocketTransport connects to any server that speaks
// this protocol; the server is authoritative for block changes, time, and entity state.

export type ClientMessage =
  | { t: 'join'; name: string; protocol: number }
  | { t: 'pos'; x: number; y: number; z: number; yaw: number; pitch: number }
  | { t: 'block'; x: number; y: number; z: number; id: number }
  | { t: 'chat'; text: string }
  | { t: 'ping'; time: number };

export type ServerMessage =
  | { t: 'welcome'; id: string; seed: number; time: number; spawn: [number, number, number]; mode: string; difficulty: string; worldType: string }
  | { t: 'reject'; reason: string }
  | { t: 'players'; players: { id: string; name: string; x: number; y: number; z: number; yaw: number; pitch: number }[] }
  | { t: 'leave'; id: string }
  | { t: 'block'; x: number; y: number; z: number; id: number }
  | { t: 'blocks'; changes: number[] }
  | { t: 'chat'; from: string; text: string }
  | { t: 'time'; time: number }
  | { t: 'pong'; time: number };

export const PROTOCOL_VERSION = 1;

export interface Transport {
  readonly connected: boolean;
  send(msg: ClientMessage): void;
  onMessage(fn: (msg: ServerMessage) => void): void;
  onClose(fn: (reason: string) => void): void;
  close(): void;
}

export class NullTransport implements Transport {
  connected = false;
  send(): void { /* singleplayer: nothing to send */ }
  onMessage(): void { /* no-op */ }
  onClose(): void { /* no-op */ }
  close(): void { /* no-op */ }
}

export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private handlers: ((m: ServerMessage) => void)[] = [];
  private closeHandlers: ((r: string) => void)[] = [];
  connected = false;

  connect(url: string, name: string, timeoutMs = 6000): Promise<Extract<ServerMessage, { t: 'welcome' }>> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url.startsWith('ws') ? url : `ws://${url}`);
      } catch (e) {
        reject(new Error('Invalid server address'));
        return;
      }
      this.ws = ws;
      const timer = setTimeout(() => { if (!settled) { settled = true; ws.close(); reject(new Error('Connection timed out')); } }, timeoutMs);
      ws.onopen = () => { this.connected = true; this.send({ t: 'join', name, protocol: PROTOCOL_VERSION }); };
      ws.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Could not connect to server')); } };
      ws.onclose = (ev) => {
        this.connected = false;
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('Connection closed (' + ev.code + ')')); }
        this.closeHandlers.forEach((h) => h(ev.reason || 'Disconnected'));
      };
      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (!settled) {
          if (msg.t === 'welcome') { settled = true; clearTimeout(timer); resolve(msg); }
          else if (msg.t === 'reject') { settled = true; clearTimeout(timer); ws.close(); reject(new Error(msg.reason)); return; }
        }
        this.handlers.forEach((h) => h(msg));
      };
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
  onMessage(fn: (m: ServerMessage) => void): void { this.handlers.push(fn); }
  onClose(fn: (r: string) => void): void { this.closeHandlers.push(fn); }
  close(): void { this.ws?.close(); this.connected = false; }
}

export interface RemotePlayer { id: string; name: string; x: number; y: number; z: number; yaw: number; pitch: number; tx: number; ty: number; tz: number }
