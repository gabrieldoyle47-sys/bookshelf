/**
 * Sound, kept calm and off unless asked for.
 *
 * Two separate things, each with its own switch in the sidebar:
 *
 *   Little sounds - a page turning when a book opens or closes, a soft chime
 *   when one is finished or picked from the jar, a quiet tick when something
 *   is set down on the shelf. Off by default.
 *
 *   Background - a crackling fire, rain, or a café's murmur, for reading by.
 *   Picked from three monochrome icons, with a volume slider.
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
    if (colour === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
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
  // Rain: a hiss of noise, high and low cut, with drops landing at random.
  rain(c, out) {
    const src = c.createBufferSource();
    src.buffer = noise(4);
    src.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const g = c.createGain(); g.gain.value = 0.16;
    src.connect(hp).connect(lp).connect(g).connect(out);
    src.start();
    const drop = () => {
      const s = c.createBufferSource(); s.buffer = noise(0.05);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 2500; f.Q.value = 6;
      const dg = c.createGain(); dg.gain.setValueAtTime(0.05 * Math.random(), c.currentTime); dg.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.05);
      s.connect(f).connect(dg).connect(out); s.start();
    };
    const timer = setInterval(() => { for (let i = 0; i < 3; i++) if (Math.random() < 0.6) setTimeout(drop, Math.random() * 120); }, 120);
    return () => { clearInterval(timer); src.stop(); };
  },
  // Fire: a low roar, and crackles at uneven intervals.
  fire(c, out) {
    const src = c.createBufferSource();
    src.buffer = noise(4, 'brown');
    src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0.35;
    src.connect(lp).connect(g).connect(out);
    src.start();
    let timer;
    const crackle = () => {
      const pops = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < pops; i++) {
        const s = c.createBufferSource(); s.buffer = noise(0.03);
        const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500 + Math.random() * 3000;
        const cg = c.createGain(); const t = c.currentTime + i * 0.03;
        cg.gain.setValueAtTime(0.08 + Math.random() * 0.1, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
        s.connect(f).connect(cg).connect(out); s.start(t);
      }
      timer = setTimeout(crackle, 80 + Math.random() * 600);
    };
    crackle();
    return () => { clearTimeout(timer); src.stop(); };
  },
  // A café: a murmur of voices that rises and falls, and the odd cup.
  cafe(c, out) {
    const src = c.createBufferSource();
    src.buffer = noise(6, 'brown');
    src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.7;
    const g = c.createGain(); g.gain.value = 0.5;
    // The rise and fall of conversation.
    const lfo = c.createOscillator(); lfo.frequency.value = 0.23;
    const depth = c.createGain(); depth.gain.value = 0.18;
    lfo.connect(depth).connect(g.gain);
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.71;
    const depth2 = c.createGain(); depth2.gain.value = 140;
    lfo2.connect(depth2).connect(bp.frequency);
    src.connect(bp).connect(g).connect(out);
    src.start(); lfo.start(); lfo2.start();
    let timer;
    const clink = () => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 2200 + Math.random() * 1400;
      const cg = c.createGain(); cg.gain.setValueAtTime(0.012, c.currentTime); cg.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
      o.connect(cg).connect(out); o.start(); o.stop(c.currentTime + 0.55);
      timer = setTimeout(clink, 3000 + Math.random() * 9000);
    };
    timer = setTimeout(clink, 2000);
    return () => { clearTimeout(timer); src.stop(); lfo.stop(); lfo2.stop(); };
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
  bed = { stop, gain };
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

const KINDS = [['fire', '🔥', 'Crackling fire'], ['rain', '🌧', 'Rain'], ['cafe', '☕', 'Coffee shop']];

/**
 * The sidebar controls: a speaker for the little sounds, three icons for the
 * background, and its volume.
 */
export function soundControls() {
  const box = h('div', { class: 'sound-controls' });
  const paint = () => {
    box.replaceChildren(h('div', { class: 'sound-pill' },
      h('button', {
        class: 'sound-opt speaker', type: 'button', 'aria-pressed': String(prefs.effects),
        title: prefs.effects ? 'Little sounds on' : 'Little sounds off', 'aria-label': 'Little sounds',
        onclick: () => { prefs.effects = !prefs.effects; save(); paint(); play('tick'); },
      }, h('span', { class: `ico ${prefs.effects ? 'ico-sound' : 'ico-mute'}`, 'aria-hidden': 'true' })),
      h('span', { class: 'sound-sep', 'aria-hidden': 'true' }),
      ...KINDS.map(([id, glyph, label]) => h('button', {
        class: 'sound-opt mono', type: 'button', 'aria-pressed': String(prefs.ambient === id), title: label, 'aria-label': label,
        onclick: () => {
          prefs.ambient = prefs.ambient === id ? null : id;
          save();
          if (prefs.ambient) startAmbient(prefs.ambient); else stopAmbient();
          paint();
        },
      }, glyph))),
      prefs.ambient ? h('input', {
        class: 'sound-volume', type: 'range', min: '0.05', max: '1', step: '0.05', value: String(prefs.volume), 'aria-label': 'Background volume',
        oninput: (e) => {
          prefs.volume = Number(e.target.value);
          save();
          if (bed) bed.gain.gain.setTargetAtTime(prefs.volume, audio().currentTime, 0.1);
        },
      }) : '');
  };
  paint();
  // A background chosen on an earlier visit resumes on the first click
  // anywhere - browsers do not let a page start sound by itself.
  if (prefs.ambient) {
    const resume = () => { if (prefs.ambient && !bed) startAmbient(prefs.ambient); };
    document.addEventListener('pointerdown', resume, { once: true, capture: true });
  }
  return box;
}
