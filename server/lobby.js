// Lobby: server registry (official / public / private), world lifecycle, tick loop.
import path from 'node:path';
import { JsonStore } from './store.js';
import { GameWorld, TICK, normalizeRules } from './game.js';
import './systems/index.js';
import { MODES, RULE_KEYS } from '../shared/items.js';
import { cleanText, rid, sha256, clamp } from './util.js';
import crypto from 'node:crypto';

const OFFICIAL = [
  { id: 'official-coop', name: 'Emberwild Official · Cooperative', mode: 'cooperative', seed: 'EMBER-COOP', desc: 'Friendly PvE. Build, explore and survive together.' },
  { id: 'official-pvp', name: 'Emberwild Official · Survival PvP', mode: 'survival', seed: 'ASHFALL-PVP', desc: 'Full PvP and base raiding. Trust no one.' },
  { id: 'official-relaxed', name: 'Emberwild Official · Relaxed', mode: 'relaxed', seed: 'HOLLOW-CHILL', desc: 'Boosted gathering, keep your gear on death. Great for learning.' },
];
const WORDS = ['EMBER', 'ASH', 'COVE', 'PINE', 'DUSK', 'RAVEN', 'FROST', 'MOSS', 'CRAG', 'TIDE', 'HOLLOW', 'GLEAM'];

export function randomSeed() { return WORDS[Math.floor(Math.random() * WORDS.length)] + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(); }

export class Lobby {
  constructor(dir, opts = {}) {
    this.dir = dir;
    this.maxLoaded = opts.maxWorlds || 8;
    this.store = new JsonStore(path.join(dir, 'servers.json'), { servers: [] });
    this.servers = this.store.data.servers ||= [];
    for (const o of OFFICIAL) {
      if (!this.servers.some((s) => s.id === o.id)) this.servers.push({ ...o, seedRaw: o.seed, official: true, maxPlayers: 40, created: Date.now(), private: false, rules: {}, invite: null });
    }
    this.store.touch(100);
    this.worlds = new Map();
    this.timer = null;
    this.nextTick = 0;
  }

  start() {
    this.nextTick = performance.now();
    const loop = () => {
      const now = performance.now();
      let steps = 0;
      while (now >= this.nextTick && steps < 3) {
        for (const w of this.worlds.values()) {
          try { w.tick(); } catch (e) { console.error(`[world ${w.id}] tick error:`, e); }
        }
        this.nextTick += TICK * 1000; steps++;
      }
      if (now - this.nextTick > 500) this.nextTick = now;
      this.timer = setTimeout(loop, Math.max(1, this.nextTick - performance.now()));
    };
    loop();
    this.gc = setInterval(() => this.collect(), 10000);
  }
  stop() {
    clearTimeout(this.timer); clearInterval(this.gc);
    for (const w of this.worlds.values()) w.save(true);
    this.store.flush();
  }

  collect() {
    for (const [id, w] of this.worlds) {
      if (w.players.size === 0 && w.emptySince && Date.now() - w.emptySince > 60000) {
        w.save(true);
        this.worlds.delete(id);
        console.log(`[lobby] unloaded world ${id}`);
      }
    }
  }

  view(s, uid) {
    const w = this.worlds.get(s.id);
    const rules = normalizeRules(s.mode, s.rules);
    return {
      id: s.id, name: s.name, desc: s.desc || '', mode: s.mode, modeLabel: MODES[s.mode]?.label || s.mode, official: !!s.official,
      players: w ? [...w.players.values()].filter((p) => p.ws).length : 0, maxPlayers: s.maxPlayers,
      seed: s.seedRaw ?? s.seed, private: !!s.private, hasPassword: !!s.passHash, owner: s.ownerName || 'Emberwild', mine: !!uid && s.ownerUid === uid,
      invite: uid && s.ownerUid === uid ? s.invite : undefined,
      rules: { pvp: rules.pvp, raiding: rules.raiding, friendlyFire: rules.friendlyFire, mobs: rules.mobs, deathDrop: rules.deathDrop, gatherRate: rules.gatherRate, lootRate: rules.lootRate, dayLength: rules.dayLength },
      day: w ? w.day : undefined, created: s.created,
    };
  }
  list(uid) {
    return this.servers.filter((s) => !s.private || s.ownerUid === uid).map((s) => this.view(s, uid)).sort((a, b) => (b.official - a.official) || (b.players - a.players));
  }
  find(id) { return this.servers.find((s) => s.id === id); }
  byInvite(code) { code = String(code || '').toUpperCase().trim(); return this.servers.find((s) => s.invite && s.invite === code); }

  create(user, body) {
    const mine = this.servers.filter((s) => s.ownerUid === user.uid);
    if (mine.length >= 3) throw new Error('You can host up to 3 servers. Delete one first.');
    const name = cleanText(body.name, 32);
    if (name.length < 3) throw new Error('Server name must be at least 3 characters');
    const mode = MODES[body.mode] ? body.mode : 'cooperative';
    const seedRaw = cleanText(String(body.seed ?? ''), 32) || randomSeed();
    const rules = {};
    const inr = body.rules && typeof body.rules === 'object' ? body.rules : {};
    for (const k of RULE_KEYS) if (inr[k] !== undefined) rules[k] = inr[k];
    const s = {
      id: 's' + rid(5), name, mode, seed: seedRaw, seedRaw, desc: cleanText(body.desc, 80), rules: {},
      ownerUid: user.uid, ownerName: user.name, private: !!body.private, maxPlayers: clamp(parseInt(body.maxPlayers) || 16, 2, 32),
      created: Date.now(), invite: rid(3).toUpperCase(), official: false,
    };
    s.rules = normalizeRules(mode, rules);
    if (typeof body.password === 'string' && body.password.length) { s.passSalt = rid(8); s.passHash = sha256(s.passSalt + body.password); }
    this.servers.push(s);
    this.store.touch(100);
    return s;
  }
  remove(user, id) {
    const i = this.servers.findIndex((s) => s.id === id);
    if (i < 0) throw new Error('No such server');
    const s = this.servers[i];
    if (s.official || s.ownerUid !== user.uid) throw new Error('Not your server');
    const w = this.worlds.get(id);
    if (w) { for (const p of w.players.values()) if (p.ws) { try { p.ws.send(JSON.stringify({ t: 'kicked', reason: 'This server was deleted by its owner' })); p.ws.close(); } catch {} } this.worlds.delete(id); }
    this.servers.splice(i, 1);
    this.store.touch(100);
    import('node:fs').then((fs) => fs.promises.rm(path.join(this.dir, 'worlds', id + '.json'), { force: true }).catch(() => {}));
  }

  world(s) {
    let w = this.worlds.get(s.id);
    if (!w) {
      if (this.worlds.size >= this.maxLoaded) throw new Error('The host is at capacity. Try again shortly.');
      w = new GameWorld(s, this.dir);
      this.worlds.set(s.id, w);
      console.log(`[lobby] loaded world ${s.id} (${s.name}) seed=${s.seedRaw}`);
    }
    return w;
  }

  authorizeJoin(user, s, { password, invite }) {
    if (s.ownerUid === user.uid) return true;
    if (s.private && !(invite && s.invite && String(invite).toUpperCase() === s.invite)) throw new Error('This is a private server — you need its invite code.');
    if (s.passHash && sha256(s.passSalt + String(password || '')) !== s.passHash) throw new Error('Wrong server password');
    return true;
  }
}
