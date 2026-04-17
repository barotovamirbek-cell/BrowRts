export class NetClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.handlers = new Map();
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener("open", () => {
        this.connected = true;
      });
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "connected") {
          resolve(message);
        }
        const handler = this.handlers.get(message.type);
        if (handler) {
          handler(message);
        }
      });
      this.socket.addEventListener("error", reject);
      this.socket.addEventListener("close", () => {
        this.connected = false;
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
