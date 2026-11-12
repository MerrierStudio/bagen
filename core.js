(function (root) {
  'use strict';
  // Shared input/clock probe. Production roster, RNG and settlement belong to batch 3.
  class HoldProbe {
    constructor() { this.reset(); }
    reset() {
      this.owners = new Map(); this.elapsed = 0; this.arrival = 0;
      this.phase = 'arrival'; this.result = null;
    }
    begin(id, endpoint) {
      if (this.phase !== 'ready' || this.owners.has(id) || (endpoint !== 0 && endpoint !== 1) ||
          Array.from(this.owners.values()).some(v => v.endpoint === endpoint)) return false;
      this.owners.set(id, { endpoint: endpoint, distance: 0 }); return true;
    }
    move(id, distance) {
      const grip = this.owners.get(id);
      if (grip) grip.distance = Math.max(-0.4, Math.min(1, distance));
    }
    release(id) { if (this.owners.delete(id) && this.phase === 'ready') this.elapsed = 0; }
    clear() { this.owners.clear(); this.elapsed = 0; }
    pause() { if (this.phase === 'ready' || this.phase === 'arrival') { this.clear(); this.phase = 'paused'; } }
    resume() { if (this.phase === 'paused') { this.arrival = 0; this.phase = 'arrival'; } }
    discard() { this.clear(); this.phase = 'discarded'; }
    step(dt) {
      if (!(dt > 0) || !Number.isFinite(dt)) return;
      dt = Math.min(dt, 1 / 30);
      if (this.phase === 'arrival') {
        this.arrival += dt;
        if (this.arrival + 1e-9 >= 0.35) { this.clear(); this.phase = 'ready'; }
      } else if (this.phase === 'ready') {
        if (this.owners.size !== 2) { this.elapsed = 0; return; }
        this.elapsed += dt;
        if (this.elapsed + 1e-9 >= 2) {
          this.phase = 'finished'; this.result = 'probe-complete'; this.owners.clear();
        }
      }
    }
  }
  // Integrity detects accidental corruption, not tampering or a storage atomicity guarantee.
  function checksum(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
    return h.toString(16);
  }
  class ProbeArchive {
    constructor(storage) { this.storage = storage; this.epoch = 0; this.busy = false; this.loaded = false; this.value = null; this.readEpoch = 0; }
    invalidate() { this.epoch++; this.loaded = false; }
    decode(raw) {
      if (raw === null) return null;
      const e = JSON.parse(raw);
      if (e.schema !== 1 || typeof e.id !== 'string' || typeof e.payload !== 'string' || checksum(e.payload) !== e.checksum) throw Error('存档完整性检查失败，原记录保留');
      const value = JSON.parse(e.payload);
      if (value.kind !== 'bagen-probe' || !Number.isInteger(value.completed) || value.completed < 0) throw Error('存档内容无法识别，原记录保留');
      return { id: e.id, data: value };
    }
    async load() {
      if (this.busy) throw Error('正在保存，请稍后读取');
      this.loaded = false;
      const epoch = this.epoch, readEpoch = ++this.readEpoch;
      const value = this.decode(await this.storage.read());
      if (epoch !== this.epoch || readEpoch !== this.readEpoch) throw Error('读取已作废，请重新读取');
      this.value = value; this.loaded = true; return value;
    }
    async commit(id, data) {
      if (!this.loaded) throw Error('请先成功读取存档');
      if (this.busy) throw Error('正在保存，请稍候');
      const epoch = this.epoch;
      const payload = JSON.stringify(data);
      const raw = JSON.stringify({ schema: 1, id: id, payload: payload, checksum: checksum(payload) });
      this.decode(raw);
      this.busy = true;
      try {
        // Re-read protects retries after a response was lost. Full game storage is batch 4–5.
        const previous = this.decode(await this.storage.read());
        if (epoch !== this.epoch) throw Error('本次提交已作废');
        if (!previous || previous.id !== id) await this.storage.write(raw);
        const verified = this.decode(await this.storage.read());
        if (epoch !== this.epoch) throw Error('提交响应迟到，请重新读取确认');
        if (!verified || verified.id !== id || JSON.stringify(verified.data) !== payload) throw Error('写入校验失败，可重试同一结果');
        this.value = verified; return verified;
      } finally { this.busy = false; }
    }
  }
  root.BagenCore = { HoldProbe: HoldProbe, ProbeArchive: ProbeArchive, checksum: checksum };
})(typeof window === 'undefined' ? globalThis : window);
