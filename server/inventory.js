// Item instances and slot-array operations (inventory, containers, equipment).
import { ITEMS, INV_SLOTS, EQUIP_SLOTS } from '../shared/items.js';

export function mkItem(id, n = 1) {
  const d = ITEMS[id];
  if (!d) return null;
  const it = { id, n: Math.max(1, Math.min(n, d.stack)) };
  if (d.dur) it.dur = d.dur;
  if (d.gun && d.gun.mag) it.ammo = 0;
  return it;
}
export const maxStack = (id) => ITEMS[id]?.stack || 1;
export const emptySlots = (n) => Array.from({ length: n }, () => null);
export const cloneItem = (it) => (it ? { ...it } : null);

// add up to `n` of item id into slots; returns leftover count
export function addTo(slots, id, n, extra = null, from = 0, to = slots.length) {
  const max = maxStack(id);
  if (!ITEMS[id]) return n;
  if (max > 1) {
    for (let i = from; i < to && n > 0; i++) {
      const s = slots[i];
      if (s && s.id === id && s.n < max) { const t = Math.min(n, max - s.n); s.n += t; n -= t; }
    }
  }
  for (let i = from; i < to && n > 0; i++) {
    if (!slots[i]) {
      const it = mkItem(id, Math.min(n, max));
      if (extra) Object.assign(it, extra);
      slots[i] = it; n -= it.n;
    }
  }
  return n;
}
export function addInstance(slots, inst, from = 0, to = slots.length) {
  // keep durability/ammo for unstackables
  if (maxStack(inst.id) === 1) {
    for (let i = from; i < to; i++) if (!slots[i]) { slots[i] = { ...inst }; return 0; }
    return inst.n;
  }
  return addTo(slots, inst.id, inst.n, null, from, to);
}
export function count(slots, id) { let c = 0; for (const s of slots) if (s && s.id === id) c += s.n; return c; }
export function canAfford(slots, cost) { for (const [id, n] of Object.entries(cost)) if (count(slots, id) < n) return false; return true; }
export function take(slots, id, n) {
  if (count(slots, id) < n) return false;
  // take from the back first (keeps hotbar tidy)
  for (let i = slots.length - 1; i >= 0 && n > 0; i--) {
    const s = slots[i];
    if (s && s.id === id) { const t = Math.min(n, s.n); s.n -= t; n -= t; if (s.n <= 0) slots[i] = null; }
  }
  return true;
}
export function spend(slots, cost) {
  if (!canAfford(slots, cost)) return false;
  for (const [id, n] of Object.entries(cost)) take(slots, id, n);
  return true;
}
// capacity check without mutation
export function canFit(slots, id, n) {
  const max = maxStack(id);
  let room = 0;
  for (const s of slots) { if (!s) room += max; else if (s.id === id && max > 1) room += max - s.n; }
  return room >= n;
}
export const sanitizeSlots = (slots, len) => {
  const out = emptySlots(len);
  if (Array.isArray(slots)) for (let i = 0; i < len; i++) {
    const s = slots[i];
    if (s && ITEMS[s.id]) { const it = { id: s.id, n: Math.max(1, Math.min(ITEMS[s.id].stack, s.n | 0 || 1)) }; if (s.dur != null) it.dur = s.dur; if (s.ammo != null) it.ammo = s.ammo; out[i] = it; }
  }
  return out;
};

// Validate an item may live in a container slot.
export function slotAccepts(kind, index, id) {
  const d = ITEMS[id];
  if (!d) return false;
  if (kind === 'eq') return d.cat === 'armor' && EQUIP_SLOTS[index] === d.slot;
  if (kind === 'furnace') { if (index === 0) return id === 'wood'; if (index >= 1 && index <= 3) return id === 'iron_ore'; return false; }
  if (kind === 'campfire') { if (index === 0) return id === 'wood'; if (index === 1 || index === 2) return id === 'raw_meat'; return false; }
  if (kind === 'turret') return id === 'pistol_ammo';
  return true;
}

// Move n from (fromSlots[fi]) to (toSlots[ti]). Returns true on success.
export function moveSlot(fromSlots, fi, toSlots, ti, n, okFrom = () => true, okTo = () => true) {
  const a = fromSlots[fi];
  if (!a) return false;
  if (fromSlots === toSlots && fi === ti) return false;
  if (!okTo(a.id)) return false;
  n = Math.max(1, Math.min(n || a.n, a.n));
  const b = toSlots[ti];
  if (!b) {
    if (n === a.n) { toSlots[ti] = a; fromSlots[fi] = null; }
    else { toSlots[ti] = { ...a, n }; a.n -= n; if (a.dur != null) toSlots[ti].dur = a.dur; }
    return true;
  }
  if (b.id === a.id && maxStack(a.id) > 1) {
    const t = Math.min(n, maxStack(a.id) - b.n);
    if (t <= 0) return false;
    b.n += t; a.n -= t; if (a.n <= 0) fromSlots[fi] = null;
    return true;
  }
  // swap whole stacks
  if (n === a.n && okFrom(b.id)) { toSlots[ti] = a; fromSlots[fi] = b; return true; }
  return false;
}
export { INV_SLOTS, EQUIP_SLOTS };
