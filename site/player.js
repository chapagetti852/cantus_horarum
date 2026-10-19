// Sing a score: read its GABC into notes and play them with the Web Audio API (no
// library). One score sounds at a time; the note being sung is coloured in the score
// when the drawn notes can be told apart one by one.
//
// Pitch: GABC letters are staff positions (a below the staff … m above it); the clef
// says which is C (c-clef) or F (f-clef), a flat (ix) lowers that position until the
// next bar. The whole piece is then moved so that its middle sits where the chosen voice
// sings (setting "Vox"): chant has no absolute pitch.
// Rhythm: equal notes, as the Solesmes books sing them; a mora (.) doubles a note, an
// episema (_) lengthens it, a liquescent (~) is light; bars breathe.

const SCALE = [0, 2, 4, 5, 7, 9, 11];
const PITCH = 'abcdefghijklm';
export const VOICES = { gravis: 50, media: 55, acuta: 62 };

/** GABC body -> [{midi, dur} | {rest}], durations in beats. */
export function notesOf(body) {
  const out = [];
  let ref = { pos: 9, diat: 28 }; // c4 until a clef says otherwise
  let flats = new Set();
  const groups = body.replace(/<[^>]*>/g, '').matchAll(/\(([^)]*)\)/g);
  for (const [, g0] of groups) {
    const g = g0.replace(/\[[^\]]*\]/g, '');
    const clef = /^\s*([cf])b?([1-5])\s*$/.exec(g);
    if (clef) {
      const pos = 1 + 2 * Number(clef[2]);
      ref = clef[1] === 'c' ? { pos, diat: 28 } : { pos, diat: 24 }; // C4, F3
      flats = new Set();
      continue;
    }
    const bar = /^\s*(::|:|;|,|`)\s*$/.exec(g);
    if (bar) {
      const last = out[out.length - 1];
      if (last && !last.rest) last.dur *= bar[1] === '`' || bar[1] === ',' ? 1.3 : 1.6;
      out.push({ rest: { ',': 0.4, '`': 0.3, ';': 0.8, ':': 1.2, '::': 1.8 }[bar[1]] });
      flats = new Set();
      continue;
    }
    // notes: a letter, then its signs
    for (const m of g.matchAll(/([a-mA-M])([^a-mA-M]*)/g)) {
      const pos = PITCH.indexOf(m[1].toLowerCase());
      const signs = m[2];
      if (/^[xy#]/.test(signs)) { // an accidental, not a note
        if (signs[0] === 'x') flats.add(pos); else flats.delete(pos);
        continue;
      }
      const diat = ref.diat + (pos - ref.pos);
      let midi = 12 * (Math.floor(diat / 7) + 1) + SCALE[((diat % 7) + 7) % 7];
      if (flats.has(pos)) midi -= 1;
      let dur = 1;
      const dots = (signs.match(/\./g) || []).length;
      if (dots) dur *= 1 + dots;
      if (/_/.test(signs)) dur *= 1.4;
      if (/~/.test(signs)) dur *= 0.6;
      // a bivirga or tristropha (fvv, fsss) repeats the note
      const reps = (signs.match(/^(v{2,3}|s{2,3})/) || [''])[0].length || 1;
      for (let k = 0; k < reps; k++) out.push({ midi, dur });
    }
  }
  // a final long note
  const last = [...out].reverse().find((n) => !n.rest);
  if (last) last.dur = Math.max(last.dur, 2);
  return out;
}

let audio = null;
let current = null; // { stop() }

function ctx() {
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume();
  return audio;
}

/** A soft, voice-like tone: a few harmonics through a gentle low-pass. */
function voice(ac, out, freq, t0, t1) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.22, t0 + 0.04);
  g.gain.setValueAtTime(0.22, Math.max(t0 + 0.04, t1 - 0.06));
  g.gain.linearRampToValueAtTime(0, t1);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  lp.Q.value = 0.7;
  g.connect(lp).connect(out);
  for (const [h, a] of [[1, 1], [2, 0.45], [3, 0.2], [4, 0.08]]) {
    const o = ac.createOscillator();
    const og = ac.createGain();
    o.frequency.value = freq * h;
    og.gain.value = a;
    o.connect(og).connect(g);
    o.start(t0);
    o.stop(t1 + 0.02);
  }
}

/**
 * Play a score's notes. `onNote(i)` is called as the i-th note sounds (-1 at the end).
 * Returns a handle with stop().
 */
export function play(body, { voice: v = 'media', tempo = 0.36, onNote = () => {}, onEnd = () => {} } = {}) {
  stop();
  const notes = notesOf(body);
  const sung = notes.filter((n) => !n.rest).map((n) => n.midi).sort((a, b) => a - b);
  if (!sung.length) return null;
  // move the piece so its middle sits in the chosen voice
  const shift = (VOICES[v] ?? VOICES.media) - sung[Math.floor(sung.length / 2)];
  const ac = ctx();
  const out = ac.createGain();
  out.gain.value = 0.9;
  out.connect(ac.destination);
  let t = ac.currentTime + 0.08;
  const timers = [];
  let i = 0;
  for (const n of notes) {
    if (n.rest) { t += n.rest * tempo; continue; }
    const t1 = t + n.dur * tempo;
    voice(ac, out, 440 * 2 ** ((n.midi + shift - 69) / 12), t, t1);
    const k = i++;
    timers.push(setTimeout(() => onNote(k), (t - ac.currentTime) * 1000));
    t = t1;
  }
  const end = setTimeout(() => { stop(); }, (t - ac.currentTime) * 1000 + 100);
  current = {
    stop() {
      timers.forEach(clearTimeout);
      clearTimeout(end);
      try { out.disconnect(); } catch { /* already */ }
      onNote(-1);
      onEnd();
    },
  };
  return current;
}

export function stop() {
  const c = current;
  current = null;
  c?.stop();
}
