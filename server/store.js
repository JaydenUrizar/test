// Small, crash-safe JSON persistence: atomic write (tmp + rename), debounced async saves, sync flush on exit.
import fs from 'node:fs';
import path from 'node:path';

export class JsonStore {
  constructor(file, defaults = {}) {
    this.file = file;
    this.data = defaults;
    this.timer = null;
    this.writing = false;
    this.dirty = false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.load(defaults);
  }
  load(defaults) {
    for (const f of [this.file, this.file + '.bak']) {
      try {
        if (fs.existsSync(f)) { this.data = JSON.parse(fs.readFileSync(f, 'utf8')); return; }
      } catch (e) { console.error(`[store] failed to read ${f}: ${e.message}`); }
    }
    this.data = defaults;
  }
  touch(delay = 1500) {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.saveAsync(); }, delay);
  }
  async saveAsync() {
    if (this.writing) { this.dirty = true; setTimeout(() => this.touch(200), 200); return; }
    this.writing = true; this.dirty = false;
    try {
      const tmp = this.file + '.tmp';
      await fs.promises.writeFile(tmp, JSON.stringify(this.data));
      try { await fs.promises.copyFile(this.file, this.file + '.bak'); } catch {}
      await fs.promises.rename(tmp, this.file);
    } catch (e) { console.error(`[store] save failed ${this.file}: ${e.message}`); }
    this.writing = false;
  }
  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    try {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      try { fs.copyFileSync(this.file, this.file + '.bak'); } catch {}
      fs.renameSync(tmp, this.file);
      this.dirty = false;
    } catch (e) { console.error(`[store] flush failed ${this.file}: ${e.message}`); }
  }
}
