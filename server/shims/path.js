// Browser stand-in for node:path (POSIX subset).
const norm = (p) => { const out = []; for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); } return (p.startsWith('/') ? '/' : '') + out.join('/'); };
const path = {
  join: (...a) => norm(a.filter(Boolean).join('/')) || '.',
  resolve: (...a) => norm('/' + a.filter(Boolean).join('/')),
  dirname(p) { const i = p.lastIndexOf('/'); return i <= 0 ? (i === 0 ? '/' : '.') : p.slice(0, i); },
};
export default path;
