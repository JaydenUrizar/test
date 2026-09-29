// WebSocket transport with automatic reconnect, ping/RTT measurement and message queueing.
export class Net {
  constructor(handlers) {
    this.h = handlers;          // { message(m), status(state, info) }
    this.ws = null; this.joinMsg = null; this.rtt = 60; this.closedByUs = false;
    this.attempt = 0; this.timer = 0; this.pingTimer = 0; this.connected = false; this.joined = false;
    this.lastRx = 0;
  }
  connect(joinMsg) {
    this.joinMsg = joinMsg; this.closedByUs = false; this.attempt = 0;
    return new Promise((resolve, reject) => { this._first = { resolve, reject }; this.open(); });
  }
  open() {
    clearTimeout(this.timer);
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws; this.joined = false;
    ws.onopen = () => { this.connected = true; ws.send(JSON.stringify(this.joinMsg)); };
    ws.onmessage = (ev) => {
      this.lastRx = performance.now();
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'joined') { this.joined = true; this.attempt = 0; this.h.status(this.reconnecting ? 'reconnected' : 'joined'); this.reconnecting = false; if (this._first) { this._first.resolve(m); this._first = null; } this.startPing(); return; }
      if (m.t === 'error') { this.fatal = true; if (this._first) { this._first.reject(new Error(m.error)); this._first = null; } this.h.status('error', m.error); return; }
      if (m.t === 'kicked') { this.fatal = true; this.h.status('kicked', m.reason); return; }
      this.h.message(m);
    };
    ws.onclose = () => {
      this.connected = false; clearInterval(this.pingTimer);
      if (this.closedByUs || this.fatal) { this.h.status('closed'); return; }
      if (this._first) { this._first.reject(new Error('Could not reach the server')); this._first = null; this.h.status('error', 'Could not reach the server'); return; }
      this.reconnecting = true;
      this.attempt++;
      if (this.attempt > 12) { this.h.status('lost'); return; }
      this.h.status('reconnecting', this.attempt);
      this.timer = setTimeout(() => this.open(), Math.min(4000, 400 * this.attempt));
    };
    ws.onerror = () => {};
  }
  startPing() {
    clearInterval(this.pingTimer);
    const ping = () => this.send({ t: 'ping', ts: performance.now(), rtt: Math.round(this.rtt) });
    ping(); this.pingTimer = setInterval(ping, 2000);
  }
  gotPong(ts) { const r = performance.now() - ts; this.rtt = this.rtt * 0.6 + r * 0.4; }
  send(o) { if (this.ws && this.ws.readyState === 1 && this.joined) this.ws.send(JSON.stringify(o)); }
  close() { this.closedByUs = true; clearTimeout(this.timer); clearInterval(this.pingTimer); try { this.ws && this.ws.close(); } catch {} }
  silentFor() { return performance.now() - this.lastRx; }
}
