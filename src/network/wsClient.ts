import type { ClientMessage, ServerMessage } from './protocol';

export type MessageCallback = (msg: ServerMessage) => void;

/**
 * WebSocket client with auto-reconnect and typed messages.
 */
export class WSClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private token: string = '';
  private handlers: MessageCallback[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  public connected = false;

  connect(url: string, token: string): void {
    this.url = url;
    this.token = token;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  private doConnect(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WS] Connected, sending auth...');
      // Send auth as first message
      this.ws!.send(JSON.stringify({ type: 'auth', payload: { token: this.token } }));
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data.toString()) as ServerMessage;
        // Auth response
        if (msg.type === 'auth_ok') {
          this.connected = true;
          this.reconnectAttempts = 0;
          console.log('[WS] Authenticated as', msg.payload.username);
          this.startPing();
        }
        if (msg.type === 'auth_error') {
          console.error('[WS] Auth failed:', msg.payload.reason);
          this.disconnect();
          return;
        }
        // Notify all handlers
        for (const h of this.handlers) {
          h(msg);
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.stopPing();
      console.log('[WS] Disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  /** Subscribe to server messages */
  onMessage(handler: MessageCallback): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  /** Send a typed message to the server */
  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  }

  private stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
  }

  disconnect(): void {
    this.stopPing();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}
