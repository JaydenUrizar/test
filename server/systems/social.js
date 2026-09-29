// Chat, slash-commands, teams, owner admin tools.
import { GameWorld } from '../game.js';
import { ITEMS } from '../../shared/items.js';
import { groundAt } from '../../shared/physics.js';
import { cleanText, clamp, int } from '../util.js';

const MAX_TEAM = 8;
let teamCounter = 1;

Object.assign(GameWorld.prototype, {
  teamsView() { return Object.values(this.teams).map((t) => this.teamView(t)); },
  teamView(t) {
    return { id: t.id, name: t.name, leader: t.leader, members: t.members.map((uid) => { const o = this.byUid.get(uid); return { uid, name: this.names[uid] || '?', online: !!(o && o.ws), eid: o ? o.eid : 0 }; }) };
  },
  pushTeam(t) {
    const v = this.teamView(t);
    for (const uid of t.members) { const p = this.byUid.get(uid); if (p) this.emit(p, { e: 'team', team: v }); }
  },
  nextTeamId() { let id = teamCounter; while (this.teams[id]) id++; teamCounter = id + 1; return id; },

  setTeam(p, id) { p.teamId = id; this.emitAll({ e: 'pteam', eid: p.eid, team: id }); },

  h_team(p, m) {
    const op = m.op;
    const mine = p.teamId ? this.teams[p.teamId] : null;
    if (op === 'create') {
      if (mine) return this.toast(p, 'You are already in a team. Leave it first.', 'warn');
      const id = this.nextTeamId();
      const t = { id, name: cleanText(m.name, 20) || `${p.name}'s crew`, leader: p.uid, members: [p.uid] };
      this.teams[id] = t; this.setTeam(p, id); this.pushTeam(t);
      this.toast(p, `Team "${t.name}" created. Invite friends by name.`, 'good');
    } else if (op === 'invite') {
      if (!mine || mine.leader !== p.uid) return this.toast(p, 'Only the team leader can invite.', 'warn');
      if (mine.members.length >= MAX_TEAM) return this.toast(p, 'Team is full.', 'warn');
      const target = [...this.players.values()].find((q) => q.ws && q.name.toLowerCase() === String(m.name || '').toLowerCase());
      if (!target) return this.toast(p, 'That player isn’t online here.', 'warn');
      if (target.teamId) return this.toast(p, `${target.name} is already in a team.`, 'warn');
      target.invite = { team: mine.id, from: p.name, exp: this.clock + 60 };
      this.emit(target, { e: 'invite', from: p.name, team: mine.name });
      this.toast(p, `Invite sent to ${target.name}.`, 'good');
    } else if (op === 'accept') {
      const inv = p.invite;
      if (!inv || this.clock > inv.exp) return this.toast(p, 'No pending invite.', 'warn');
      const t = this.teams[inv.team];
      p.invite = null;
      if (!t || p.teamId || t.members.length >= MAX_TEAM) return this.toast(p, 'That team is no longer available.', 'warn');
      t.members.push(p.uid); this.setTeam(p, t.id); this.pushTeam(t);
      this.toast(p, `You joined ${t.name}.`, 'good');
    } else if (op === 'decline') { p.invite = null; }
    else if (op === 'leave') {
      if (!mine) return;
      this.removeFromTeam(mine, p.uid);
    } else if (op === 'kick') {
      if (!mine || mine.leader !== p.uid) return;
      const uid = Object.keys(this.names).find((u) => this.names[u].toLowerCase() === String(m.name || '').toLowerCase());
      if (uid && uid !== p.uid && mine.members.includes(uid)) this.removeFromTeam(mine, uid);
    }
  },
  removeFromTeam(t, uid) {
    t.members = t.members.filter((u) => u !== uid);
    const o = this.byUid.get(uid);
    if (o) { this.setTeam(o, 0); this.emit(o, { e: 'team', team: null }); this.toast(o, 'You left the team.', 'info'); }
    else if (this.saved[uid]) this.saved[uid].teamId = 0;
    if (!t.members.length) delete this.teams[t.id];
    else { if (t.leader === uid) t.leader = t.members[0]; this.pushTeam(t); }
  },

  // ---------------------------------------------------------------- chat
  handleChat(p, m) {
    let text = cleanText(m.text, 140);
    if (!text) return;
    if (this.clock < (p.muteUntil || 0)) return;
    if (text[0] === '/') return this.command(p, text.slice(1));
    const ch = m.ch === 'team' ? 'team' : 'all';
    const ev = { e: 'chat', ch, from: p.name, eid: p.eid, text };
    if (ch === 'team') {
      const t = this.teams[p.teamId];
      if (!t) return this.toast(p, 'You are not in a team.', 'warn');
      for (const uid of t.members) { const o = this.byUid.get(uid); if (o) this.emit(o, ev); }
    } else this.emitAll(ev);
  },

  command(p, line) {
    const [cmd, ...args] = line.split(' ');
    const owner = this.cfg.ownerUid === p.uid;
    const sys = (t) => this.emit(p, { e: 'chat', ch: 'sys', text: t });
    switch (cmd.toLowerCase()) {
      case 'help':
        sys('Commands: /me <action>, /seed, /players, /team (see Team panel), /kill (respawn). Owner: /kick <name>, /ban <name>, /time <0-24>, /weather <clear|rain|storm|fog|cloudy>, /give <item> [n], /tp <name>, /say <msg>');
        break;
      case 'seed': sys(`World seed: ${this.cfg.seedRaw ?? this.cfg.seed}`); break;
      case 'players': sys(`Online (${this.players.size}/${this.cfg.maxPlayers}): ${[...this.players.values()].map((q) => q.name).join(', ')}`); break;
      case 'me': this.emitAll({ e: 'chat', ch: 'all', from: p.name, eid: p.eid, text: args.join(' '), me: true }); break;
      case 'kill': if (!p.dead) this.hurtPlayer(p, 9999, { kind: 'suicide' }); break;
      case 'say': if (owner) this.emitAll({ e: 'chat', ch: 'announce', text: args.join(' ') }); break;
      case 'kick': case 'ban': {
        if (!owner) return sys('Only the server owner can do that.');
        const t = [...this.players.values()].find((q) => q.name.toLowerCase() === (args[0] || '').toLowerCase());
        if (!t || t === p) return sys('Player not found.');
        if (cmd === 'ban') { this.bans.add(t.uid); this.S.bans = [...this.bans]; }
        if (t.ws) { try { t.ws.send(JSON.stringify({ t: 'kicked', reason: cmd === 'ban' ? 'You were banned from this server' : 'You were kicked by the owner' })); t.ws.close(); } catch {} }
        this.removePlayer(t);
        sys(`${t.name} was ${cmd === 'ban' ? 'banned' : 'kicked'}.`);
        break;
      }
      case 'time': {
        if (!owner) return sys('Only the server owner can do that.');
        const h = parseFloat(args[0]);
        if (Number.isFinite(h)) { this.hour = ((h % 24) + 24) % 24; this.emitAll({ e: 'time', h: this.hour, d: this.day }); }
        break;
      }
      case 'weather': {
        if (!owner) return sys('Only the server owner can do that.');
        if (['clear', 'cloudy', 'rain', 'storm', 'fog'].includes(args[0])) { this.weather = { type: args[0], next: this.clock + 300 }; this.emitAll({ e: 'weather', type: args[0] }); }
        break;
      }
      case 'give': {
        if (!owner) return sys('Only the server owner can do that.');
        const id = args[0];
        if (!ITEMS[id]) return sys('Unknown item id. Example: /give iron_ingot 50');
        this.give(p, id, clamp(int(parseInt(args[1]) || 1), 1, 1000));
        break;
      }
      case 'tp': {
        if (!owner) return sys('Only the server owner can do that.');
        const t = [...this.players.values()].find((q) => q.name.toLowerCase() === (args[0] || '').toLowerCase());
        if (!t) return sys('Player not found.');
        p.x = t.x + 1.5; p.z = t.z; p.y = t.y; p.budget = 999;
        this.emit(p, { e: 'corr', x: p.x, y: p.y, z: p.z, s: p.lastSeq, force: true });
        break;
      }
      default: sys('Unknown command. Try /help');
    }
  },
});
