// Throw-away harness: mock `game` per docs/CLIENT_API.md to test map/minimap/skills/team standalone.
import { WorldData } from '/shared/worldgen.js';
import { MapUI, Minimap } from '../js/ui/map.js';
import { SkillsUI, TeamUI } from '../js/ui/panels.js';
import { xpForLevel } from '/shared/items.js';

const params = new URLSearchParams(location.search);
const logEl = document.getElementById('log');
const log = (...a) => { const d = document.createElement('div'); d.textContent = a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); logEl.prepend(d); };

const t0 = performance.now();
const data = new WorldData('EMBER-COOP');
window.worldMs = performance.now() - t0;
const handlers = {};
const game = {
  world: { data },
  worldInfo: { name: 'Ember Hollow (Co-op)', seed: 'EMBER-COOP', mode: 'cooperative', day: 3, hour: 14.5 },
  me: { x: 180, y: 8, z: -300, yaw: 0.6, pitch: 0 },
  myEid: 1, uid: 'u1', selfName: 'Ash',
  state: {
    level: 7, xp: 420, xpNext: xpForLevel(7), points: 3, perks: { gather: 2, vital: 1, endure: 0, brawn: 5, craft: 0, scav: 3 },
    disc: new Set([0, 3, 7, 12, 14, 18]), waypoint: null, invite: null,
    team: null,
    players: new Map([[1, { name: 'Ash', team: 0 }], [2, { name: 'Birch', team: 0 }], [3, { name: 'Cedar', team: 5 }], [4, { name: 'Dusk', team: 0 }], [5, { name: 'Ember_Fox', team: 0 }]]),
    teamPos: new Map(),
    stats: { kills: 12, deaths: 3, playSeconds: 5400 },
  },
  send(m) {
    log('send', m);
    const s = this.state;
    if (m.t === 'perk' && s.points > 0) { s.points--; s.perks[m.id] = (s.perks[m.id] || 0) + 1; this.emit('perks'); }
    if (m.t === 'team') {
      if (m.op === 'create') { s.team = { id: 1, name: m.name || "Ash's crew", leader: 'u1', members: [{ uid: 'u1', name: 'Ash', online: true, eid: 1 }] }; this.emit('team'); }
      if (m.op === 'invite') log('invite ->', m.name);
      if (m.op === 'leave') { s.team = null; this.emit('team'); }
      if (m.op === 'kick' && s.team) { s.team.members = s.team.members.filter((x) => x.name !== m.name); this.emit('team'); }
      if (m.op === 'accept') { s.team = { id: 5, name: 'Redwood', leader: 'u9', members: [{ uid: 'u9', name: 'Cedar', online: true, eid: 3 }, { uid: 'u1', name: 'Ash', online: true, eid: 1 }] }; this.emit('team'); }
    }
  },
  on(evt, fn) { (handlers[evt] ||= new Set()).add(fn); return () => handlers[evt].delete(fn); },
  emit(evt, ...a) { for (const f of handlers[evt] || []) f(...a); },
  uiOpened(n) { log('uiOpened', n); }, uiClosed(n) { log('uiClosed', n); },
  audio: { ui() {} },
  mapMarkers() { return [{ kind: 'death', x: 120, z: -220, label: 'Death' }, { kind: 'bag', x: 210, z: -260, label: 'Bag' }]; },
};
game.state.teamPos.set(2, { x: 230, z: -320, name: 'Birch' });
window.game = game;

const map = new MapUI(game, document.getElementById('map-root'));
const skills = new SkillsUI(game, document.getElementById('panel-root'));
const team = new TeamUI(game, document.getElementById('panel-root'));
const mini = new Minimap(document.getElementById('minimap'), game);
Object.assign(window, { map, skills, team, mini });

let walking = params.get('walk') !== '0';
let last = performance.now(), fps = { n: 0, worst: 0, t: performance.now() };
window.frameStats = { worst: 0, frames: 0, slow: 0 };
function loop(t) {
  const dt = Math.min(0.1, (t - last) / 1000); last = t;
  const rawDt = t - (loop.prev || t); loop.prev = t;
  window.frameStats.frames++; if (rawDt > window.frameStats.worst) window.frameStats.worst = rawDt; if (rawDt > 34) window.frameStats.slow++;
  if (walking) { game.me.yaw += dt * 0.5; game.me.x += -Math.sin(game.me.yaw) * dt * 4; game.me.z += -Math.cos(game.me.yaw) * dt * 4; }
  mini.draw(game.me.x, game.me.z, game.me.yaw, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.setWalk = (v) => { walking = v; };

const act = {
  map: () => map.toggle(), skills: () => skills.toggle(), team: () => team.toggle(),
  walk: () => { walking = !walking; },
  invite: () => { game.state.invite = { from: 'Cedar', team: 'Redwood' }; game.emit('invite'); },
  discover: () => { data.landmarks.forEach((l) => game.state.disc.add(l.id)); },
};
document.getElementById('bar').addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) act[b.dataset.a](); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { map.close(); skills.close(); team.close(); }
  else if (!e.target.matches('input')) { if (e.key === 'm') map.toggle(); if (e.key === 'k') skills.toggle(); if (e.key === 'p') team.toggle(); }
});
window.harnessReady = true;
