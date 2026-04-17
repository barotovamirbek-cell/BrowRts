export class NetClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.handlers = new Map();
    this.connected = false;
  }

  emit(type, payload = {}) {
    const handler = this.handlers.get(type);
    if (handler) {
      handler({ type, ...payload });
    }
  }

  connect(timeoutMs = 5000) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return Promise.resolve({ type: "connected", playerId: null });
    }

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

      this.connected = false;
      if (this.socket && this.socket.readyState < WebSocket.CLOSING) {
        this.socket.close();
      }

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
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === "connected") {
          finishResolve(message);
        }
        this.emit(message.type, message);
      });
      this.socket.addEventListener("error", () => {
        this.emit("socket_error", { message: `WebSocket error: ${this.url}` });
        finishReject(new Error(`WebSocket error: ${this.url}`));
      });
      this.socket.addEventListener("close", () => {
        this.connected = false;
        this.emit("closed", { message: `Connection closed: ${this.url}` });
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
    if (!this.connected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({ type, ...payload }));
  }

  close() {
    this.connected = false;
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) {
      this.socket.close();
    }
    this.socket = null;
  }
}
