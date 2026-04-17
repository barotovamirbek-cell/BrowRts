export class NetClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.handlers = new Map();
    this.connected = false;
  }

  connect(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finishResolve = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      };
      const finishReject = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      };

      const timeoutId = setTimeout(() => {
        try {
          this.socket?.close();
        } catch {
          // ignore close errors on timeout
        }
        finishReject(new Error(`Connection timeout: ${this.url}`));
      }, timeoutMs);

      this.socket = new WebSocket(this.url);
      this.socket.addEventListener("open", () => {
        this.connected = true;
      });
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "connected") {
          finishResolve(message);
        }
        const handler = this.handlers.get(message.type);
        if (handler) {
          handler(message);
        }
      });
      this.socket.addEventListener("error", () => {
        finishReject(new Error(`WebSocket error: ${this.url}`));
      });
      this.socket.addEventListener("close", () => {
        this.connected = false;
        if (!settled) {
          finishReject(new Error(`Connection closed: ${this.url}`));
        }
      });
    });
  }

  on(type, handler) {
    this.handlers.set(type, handler);
  }

  send(type, payload = {}) {
    if (!this.connected) {
      return;
    }
    this.socket.send(JSON.stringify({ type, ...payload }));
  }
}
