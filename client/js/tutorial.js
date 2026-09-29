// First-time tutorial: a short checklist driven by real game events. Progress is persisted via the account (tutorialDone).
import { keyLabel } from './settings.js';

export class Tutorial {
  constructor(game, onDone) {
    this.g = game; this.onDone = onDone; this.el = document.getElementById('tutorial');
    this.f = { moved: 0, crafted: new Set(), built: 0, fire: false, ate: false, map: false, wood: false, stone: false, lastX: null, lastZ: null };
    const K = (a) => keyLabel(game.settings.key(a));
    this.steps = [
      { id: 'move', text: 'Look around and walk', hint: `Move with <kbd>${K('forward')}${K('left')}${K('back')}${K('right')}</kbd>, look with the mouse. Hold <kbd>${K('sprint')}</kbd> to sprint. Your stamina is the yellow-green bar.`, done: () => this.f.moved > 12 },
      { id: 'wood', text: 'Chop a tree with your Rock', hint: `Select the Rock (slot <kbd>1</kbd>), walk up to a tree and hold <kbd>Left Mouse</kbd>. Gather about 60 wood.`, done: () => game.countItem('wood') >= 60 || this.f.crafted.size > 0 },
      { id: 'stone', text: 'Break a boulder for stone', hint: 'Grey boulders drop stone. Hit one with your Rock. Bushes give berries (food) and hemp gives fiber.', done: () => game.countItem('stone') >= 40 || this.f.crafted.has('stone_hatchet') },
      { id: 'craft', text: 'Craft a Stone Hatchet', hint: `Press <kbd>${K('inventory')}</kbd> to open your inventory and crafting. Pick the Stone Hatchet and press Craft. Crafting takes a few seconds.`, done: () => this.f.crafted.has('stone_hatchet') },
      { id: 'hammer', text: 'Craft a Builder Hammer', hint: 'The hammer opens the building menu. You will need more wood and stone — the hatchet chops much faster than your rock.', done: () => this.f.crafted.has('hammer') },
      { id: 'build', text: 'Build a foundation and walls', hint: `Put the hammer in your hotbar and select it. <kbd>Mouse wheel</kbd> picks the piece, <kbd>Left Mouse</kbd> places it. Start with a Foundation, then walls and a Doorway. <kbd>Right Mouse</kbd> upgrades a piece.`, done: () => this.f.built >= 4 },
      { id: 'fire', text: 'Craft, place and light a Campfire', hint: `Craft a Campfire, select it and click to place. Look at it and press <kbd>${K('use')}</kbd> to open it, add wood as fuel, then press <kbd>${K('light')}</kbd> to light it. Fires keep you warm and cook meat.`, done: () => this.f.fire },
      { id: 'eat', text: 'Eat or drink', hint: `Select berries and press <kbd>Left Mouse</kbd> to eat, or look at water and hold <kbd>${K('use')}</kbd> to drink. Keep food and water up!`, done: () => this.f.ate },
      { id: 'map', text: 'Open the map and find a landmark', hint: `Press <kbd>${K('map')}</kbd>. Landmarks hold crates with loot, guns and blueprints. Discover one for bonus XP. Rest of the road: workbench → furnace → weapons.`, done: () => this.f.map },
    ];
    this.i = 0; this.finished = false;
    this.render();
    this.el.classList.remove('hidden');
    this.t = 0;
  }
  event(kind, data) {
    const f = this.f;
    if (kind === 'crafted') f.crafted.add(data);
    else if (kind === 'built') f.built++;
    else if (kind === 'fire') f.fire = true;
    else if (kind === 'ate') f.ate = true;
    else if (kind === 'map') f.map = true;
  }
  update(dt) {
    if (this.finished) return;
    const me = this.g.me;
    if (this.f.lastX !== null) this.f.moved += Math.hypot(me.x - this.f.lastX, me.z - this.f.lastZ) < 30 ? Math.hypot(me.x - this.f.lastX, me.z - this.f.lastZ) : 0;
    this.f.lastX = me.x; this.f.lastZ = me.z;
    this.t += dt; if (this.t < 0.4) return; this.t = 0;
    let changed = false;
    while (this.i < this.steps.length && this.steps[this.i].done()) { this.i++; changed = true; this.g.audio.ui('success'); }
    if (changed) { this.render(); if (this.i >= this.steps.length) this.complete(); }
  }
  render() {
    const cur = this.steps[this.i];
    this.el.innerHTML = `<h3>Getting started <button data-skip>Skip tutorial</button></h3><ol>${this.steps.map((s, k) => `<li class="${k < this.i ? 'done' : k === this.i ? 'cur' : ''}">${s.text}</li>`).join('')}</ol>${cur ? `<div class="hint">${cur.hint}</div>` : '<div class="hint">🔥 You’re ready. Explore landmarks for blueprints, craft a workbench and furnace, and survive. Have fun!</div>'}`;
    this.el.querySelector('[data-skip]').onclick = () => this.skip();
  }
  complete() { this.finished = true; this.g.toast('Tutorial complete! Now go claim the wild.', 'good'); this.onDone && this.onDone(); setTimeout(() => this.el.classList.add('hidden'), 9000); }
  skip() { this.finished = true; this.el.classList.add('hidden'); this.onDone && this.onDone(); }
  hide() { this.el.classList.add('hidden'); }
}
