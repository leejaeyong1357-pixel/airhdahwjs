// 웹소켓 (RFC 6455 최소 구현 — 텍스트 메시지만). npm 설치 없이 쓰려고 직접 만들었다.
import { createHash } from "node:crypto";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frag = [];
    this.alive = true;
    this.onmessage = () => {};
    this.onclose = () => {};
    socket.on("data", (d) => this.read(d));
    socket.on("close", () => this.closed());
    socket.on("error", () => this.closed());
  }
  read(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (len > 1 << 20) return this.close(); // 1MB 넘는 메시지는 받지 않는다
      const maskAt = off;
      if (masked) off += 4;
      if (b.length < off + len) return;
      const payload = Buffer.from(b.subarray(off, off + len));
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= b[maskAt + (i & 3)];
      this.buf = b.subarray(off + len);

      if (op === 0x8) return this.close();
      if (op === 0x9) { this.frame(0xa, payload); continue; } // ping → pong
      if (op === 0xa) continue;
      if (op === 0x1) this.frag = [payload];
      else if (op === 0x0) this.frag.push(payload);
      else continue;
      if (fin) {
        const text = Buffer.concat(this.frag).toString("utf8");
        this.frag = [];
        let msg;
        try { msg = JSON.parse(text); } catch { continue; } // 잘못된 메시지는 무시
        try { this.onmessage(msg); } catch (err) { console.error("메시지 처리 오류:", err); }
      }
    }
  }
  frame(op, data) {
    if (!this.alive) return;
    const len = data.length;
    let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    this.socket.write(Buffer.concat([head, data]));
  }
  send(obj) { this.frame(0x1, Buffer.from(JSON.stringify(obj))); }
  sendRaw(text) { this.frame(0x1, Buffer.from(text)); }
  close() {
    if (this.alive) { try { this.frame(0x8, Buffer.alloc(0)); } catch { /* 이미 끊김 */ } }
    this.socket.end();
    this.closed();
  }
  closed() {
    if (!this.alive) return;
    this.alive = false;
    this.onclose();
  }
}

/** HTTP upgrade 요청을 웹소켓으로 바꾼다. 실패하면 null */
export function accept(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return null; }
  const hash = createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${hash}\r\n\r\n`,
  );
  socket.setNoDelay(true);
  return new Conn(socket);
}
