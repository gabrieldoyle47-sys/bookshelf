/**
 * Sound, kept calm and off unless asked for.
 *
 * One switch, the speaker in the sidebar, turns all of it on or off (off by
 * default):
 *
 *   Little sounds - a page turning when a book opens or closes, a soft chime
 *   when one is finished or picked from the jar, a quiet tick when something
 *   is set down on the shelf.
 *
 *   Background - a crackling fire, rain and thunder, or a café's murmur,
 *   which goes with the scene chosen for the bookshelf's room by the switch
 *   above it (room.js). The slider beside the speaker sets its volume.
 *
 * Everything is made on the spot with Web Audio - filtered noise and a few
 * sine tones - so there are no files to download, and nothing plays until
 * someone has clicked (browsers require that anyway). Choices are kept per
 * device.
 */

import { h } from './dom.js';

const KEY = 'bookshelf.sound';
const prefs = { effects: false, ambient: null, volume: 0.5 };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* private mode */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };

let ac = null;
const audio = () => {
  if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
  if (ac.state === 'suspended') ac.resume();
  return ac;
};

/** A buffer of noise: white, or brown (smoothed, deep) for rumble and murmur. */
function noise(seconds, colour = 'white') {
  const c = audio();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (colour === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    // Pink: softer than white, less boomy than brown - nearer real rain and voices.
    else if (colour === 'pink') { last = 0.97 * last + 0.03 * w; d[i] = (w * 0.5 + last * 4) * 0.5; }
    else d[i] = w;
  }
  return buf;
}

/* ------------------------------------------------------------ little sounds */

const EFFECTS = {
  // Paper: a short sweep of filtered noise.
  flip(c, out) {
    const src = c.createBufferSource();
    src.buffer = noise(0.3);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(2600, c.currentTime);
    bp.frequency.exponentialRampToValueAtTime(700, c.currentTime + 0.25);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.09, c.currentTime + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.28);
    src.connect(bp).connect(g).connect(out);
    src.start();
  },
  // Two soft bell tones a fifth apart.
  chime(c, out) {
    [[784, 0], [1175, 0.09]].forEach(([f, at]) => {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      const t = c.currentTime + at;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 1.5);
    });
  },
  // A small wooden tick.
  tick(c, out) {
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(900, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(500, c.currentTime + 0.05);
    const g = c.createGain();
    g.gain.setValueAtTime(0.04, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.07);
    o.connect(g).connect(out);
    o.start();
    o.stop(c.currentTime + 0.08);
  },
};

/** Play a little sound, if they are on. */
export function play(name) {
  if (!prefs.effects || !EFFECTS[name]) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches && name === 'tick') return;
  try { const c = audio(); EFFECTS[name](c, c.destination); } catch { /* no audio here */ }
}

/* --------------------------------------------------------------- background */

let bed = null; // { stop, gain }

const AMBIENT = {
  // A library: the hush of a big room, a clock ticking slowly, now and then a
  // page turning somewhere.
  // The library is the quiet room: no sound at all.
  library() {
    return () => {};
  },
  // Rain: a soft patter on a window - gentle, high, no roar - with now and
  // then a heavier drop, and thunder far off.
  rain(c, out) {
    const src = c.createBufferSource();
    src.buffer = noise(4, 'pink');
    src.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000;
    const g = c.createGain(); g.gain.value = 0.05;
    src.connect(hp).connect(lp).connect(g).connect(out);
    src.start();
    const drop = () => {
      const s = c.createBufferSource(); s.buffer = noise(0.03);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500 + Math.random() * 3000; f.Q.value = 8;
      const dg = c.createGain(); const t = c.currentTime;
      dg.gain.setValueAtTime(0.015 + Math.random() * 0.02, t); dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      s.connect(f).connect(dg).connect(out); s.start(t);
    };
    const timer = setInterval(() => { if (Math.random() < 0.5) drop(); }, 140);
    let rumble;
    const thunder = () => {
      const s = c.createBufferSource(); s.buffer = noise(5, 'brown');
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 120;
      const g2 = c.createGain(); const t = c.currentTime;
      g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.18, t + 1);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 4.8);
      s.connect(f).connect(g2).connect(out); s.start();
      rumble = setTimeout(thunder, 40000 + Math.random() * 40000);
    };
    rumble = setTimeout(thunder, 15000);
    return () => { clearInterval(timer); clearTimeout(rumble); src.stop(); };
  },
  // Fire: the crackle is the fire. Pops and snaps of different sizes, in
  // clusters, and nothing else.
  fire(c, out) {
    // Only the crackle: no low roar under it.
    const pop = (at, big) => {
      const s = c.createBufferSource(); s.buffer = noise(big ? 0.05 : 0.015);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = big ? 1.2 : 2.5;
      f.frequency.value = big ? 900 + Math.random() * 1200 : 2500 + Math.random() * 4000;
      const pg = c.createGain();
      pg.gain.setValueAtTime(big ? 0.35 + Math.random() * 0.2 : 0.08 + Math.random() * 0.12, at);
      pg.gain.exponentialRampToValueAtTime(0.0001, at + (big ? 0.06 : 0.02));
      s.connect(f).connect(pg).connect(out); s.start(at);
    };
    let timer;
    const crackle = () => {
      const t = c.currentTime;
      // A cluster of small ticks, sometimes with one bigger snap.
      const n = 2 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) pop(t + i * (0.01 + Math.random() * 0.05), false);
      if (Math.random() < 0.18) pop(t + Math.random() * 0.1, true);
      timer = setTimeout(crackle, 60 + Math.random() * 380);
    };
    crackle();
    return () => { clearTimeout(timer); };
  },
  // A café: a soft, distant murmur of conversation - warm noise that swells
  // and settles slowly, never shaped into "voices" - with, now and then, the
  // espresso machine's steam or the bell on the counter. Quiet overall.
  cafe(c, out) {
    const bus = c.createGain(); bus.gain.value = 0.7;
    bus.connect(out);
    const layers = [];
    for (let v = 0; v < 3; v++) {
      const src = c.createBufferSource(); src.buffer = noise(6, 'pink'); src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + v * 200;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
      const lg = c.createGain(); lg.gain.value = 0.012;
      src.connect(hp).connect(lp).connect(lg).connect(bus);
      src.start(c.currentTime + v * 0.7);
      layers.push({ src, lg });
    }
    // The room's hum rises and falls gently, over seconds, not syllables.
    const swell = setInterval(() => {
      const t = c.currentTime;
      for (const l of layers) l.lg.gain.setTargetAtTime(0.008 + Math.random() * 0.01, t, 1.5);
    }, 2500);
    const steam = () => {
      const s2 = c.createBufferSource(); s2.buffer = noise(3.5);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 4500; f.Q.value = 0.8;
      const sg = c.createGain(); const t = c.currentTime;
      sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.012, t + 0.5);
      sg.gain.setValueAtTime(0.012, t + 2.4); sg.gain.exponentialRampToValueAtTime(0.0001, t + 3.3);
      s2.connect(f).connect(sg).connect(bus); s2.start(t);
    };
    // A service bell on the counter: one bright strike that rings out.
    const bell = () => {
      const t = c.currentTime;
      for (const [freq, level, length] of [[2093, 0.02, 1.6], [5230, 0.006, 0.7], [3380, 0.005, 1.0]]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
        const og = c.createGain();
        og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(level, t + 0.004);
        og.gain.exponentialRampToValueAtTime(0.0001, t + length);
        o.connect(og).connect(bus); o.start(t); o.stop(t + length + 0.05);
      }
    };
    let timer;
    const next = () => {
      (Math.random() < 0.55 ? steam : bell)();
      timer = setTimeout(next, 15000 + Math.random() * 25000);
    };
    timer = setTimeout(next, 6000);
    return () => { clearInterval(swell); clearTimeout(timer); for (const l of layers) l.src.stop(); bus.disconnect(); };
  },
};

function startAmbient(kind) {
  stopAmbient();
  if (!AMBIENT[kind]) return;
  const c = audio();
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  // Fade in over two seconds rather than starting abruptly.
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, prefs.volume), c.currentTime + 2);
  gain.connect(c.destination);
  const stop = AMBIENT[kind](c, gain);
  bed = { stop, gain, kind };
}

function stopAmbient() {
  if (!bed) return;
  const { stop, gain } = bed;
  bed = null;
  const c = audio();
  gain.gain.cancelScheduledValues(c.currentTime);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.8);
  setTimeout(() => { try { stop(); } catch { /* already stopped */ } gain.disconnect(); }, 900);
}

/* ---------------------------------------------------------------- controls */

/** The scene the bookshelf's room shows: 'library' (the default), 'fire', 'rain' or 'cafe'. */
export const getScene = () => (['fire', 'rain', 'cafe', 'library'].includes(prefs.ambient) ? prefs.ambient : 'library');

/** Play the scene's background, if sound is on; otherwise make sure it is quiet. */
function syncAmbient() {
  const scene = getScene();
  if (prefs.effects) { if (bed?.kind !== scene) startAmbient(scene); } else stopAmbient();
}

/**
 * Play the room being looked at - an owner's room on their shelf - without
 * announcing a change of room.
 */
export function playRoom(id) {
  if (prefs.ambient === id) return;
  prefs.ambient = id;
  save();
  syncAmbient();
}

/**
 * Choose the room's scene (from the switch on the bookshelf page). Its sound
 * plays if sound is on.
 */
export function setScene(id) {
  prefs.ambient = id || 'library';
  save();
  syncAmbient();
  dispatchEvent(new CustomEvent('bookshelf:scene', { detail: getScene() }));
}

/**
 * The sidebar controls: the speaker turns all sound on or off, and the
 * slider sets how loud the room's background is.
 */
export function soundControls() {
  const box = h('div', { class: 'sound-controls' });
  const paint = () => {
    box.replaceChildren(h('div', { class: 'sound-pill' },
      h('button', {
        class: 'sound-opt speaker', type: 'button', 'aria-pressed': String(prefs.effects),
        title: prefs.effects ? 'Sound on — click to mute' : 'Sound off — click to turn on', 'aria-label': 'Sound',
        onclick: () => { prefs.effects = !prefs.effects; save(); syncAmbient(); paint(); play('tick'); },
      }, h('span', { class: `ico ${prefs.effects ? 'ico-sound' : 'ico-mute'}`, 'aria-hidden': 'true' })),
      h('input', {
        class: 'sound-volume', type: 'range', min: '0.05', max: '1', step: '0.05', value: String(prefs.volume),
        'aria-label': 'Volume', disabled: !prefs.effects,
        oninput: (e) => {
          prefs.volume = Number(e.target.value);
          save();
          if (bed) bed.gain.gain.setTargetAtTime(prefs.volume, audio().currentTime, 0.1);
        },
      })));
  };
  paint();
  // A scene's sound left on last visit resumes on the first click anywhere -
  // browsers do not let a page start sound by itself.
  if (prefs.effects) {
    document.addEventListener('pointerdown', () => syncAmbient(), { once: true, capture: true });
  }
  return box;
}
