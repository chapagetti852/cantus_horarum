// Sing a score: read its GABC into notes and play them with the Web Audio API. One score
// sounds at a time; the note being sung is coloured in the score when the drawn notes can
// be told apart one by one.
//
// Voice: recorded choir "aah" notes (FluidR3 GM soundfont, "Choir Aahs", by Frank Wen,
// CC BY 3.0, as packaged by gleitz/midi-js-soundfonts) in audio/choir/, one every three
// semitones, each note sung from the nearest one; a little church reverberation. Until
// the recordings have loaded (or if they cannot) a soft synthesized tone stands in.
//
// Pitch: GABC letters are staff positions (a below the staff … m above it); the clef
// says which is C (c-clef) or F (f-clef), a flat (ix) lowers that position until the
// next bar. The piece is then moved so that its middle sits where the chosen voice sings
// (setting "Vox"): chant has no absolute pitch. A psalm is moved by its antiphon's
// middle (`key`), so the two sound at the same pitch, as the tone is written to match
// the antiphon.
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
let room = null; // the reverberation every voice goes through

function ctx() {
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === 'suspended') audio.resume();
  return audio;
}

// the recorded notes: name -> midi
const SAMPLES = { E2: 40, G2: 43, Bb2: 46, Db3: 49, E3: 52, G3: 55, Bb3: 58, Db4: 61, E4: 64, G4: 67, Bb4: 70, Db5: 73 };
let buffers = null; // midi -> AudioBuffer, once loaded
let loading = null;
function loadSamples(ac) {
  loading ||= Promise.all(Object.entries(SAMPLES).map(async ([name, midi]) => {
    const r = await fetch(`audio/choir/${name}.mp3`);
    if (!r.ok) throw new Error(name);
    return [midi, await ac.decodeAudioData(await r.arrayBuffer())];
  })).then((list) => { buffers = new Map(list); }).catch(() => { buffers = null; });
  return loading;
}

/** A church: a few seconds of decaying noise as the impulse response, mixed under the dry voice. */
function roomOf(ac) {
  if (room?.context === ac) return room.input;
  const input = ac.createGain();
  const dry = ac.createGain(); dry.gain.value = 0.8;
  const wet = ac.createGain(); wet.gain.value = 0.32;
  const conv = ac.createConvolver();
  const len = Math.floor(ac.sampleRate * 2.6);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
  }
  conv.buffer = ir;
  input.connect(dry).connect(ac.destination);
  input.connect(conv).connect(wet).connect(ac.destination);
  room = { context: ac, input };
  return input;
}

/** One sung note from the nearest recording, slurred into the next (a short overlap). */
function sampled(ac, out, midi, t0, t1) {
  let best = null;
  for (const m of buffers.keys()) if (best === null || Math.abs(m - midi) < Math.abs(best - midi)) best = m;
  const src = ac.createBufferSource();
  src.buffer = buffers.get(best);
  src.playbackRate.value = 2 ** ((midi - best) / 12);
  const g = ac.createGain();
  const end = t1 + 0.08;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.9, t0 + 0.05);
  g.gain.setValueAtTime(0.9, Math.max(t0 + 0.05, end - 0.12));
  g.gain.linearRampToValueAtTime(0, end);
  src.connect(g).connect(out);
  src.start(t0, 0.02);
  src.stop(end + 0.02);
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
export async function play(body, { voice: v = 'media', key = null, tempo = 0.36, onNote = () => {}, onEnd = () => {} } = {}) {
  stop();
  const notes = notesOf(body);
  const middle = (b) => { const s = notesOf(b).filter((n) => !n.rest).map((n) => n.midi).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const mid = (key && middle(key)) ?? middle(body);
  if (mid === null) return null;
  // move the piece (or its antiphon) so that the middle sits in the chosen voice
  const shift = (VOICES[v] ?? VOICES.media) - mid;
  const ac = ctx();
  const token = {};
  current = { token, stop() { onEnd(); } };
  if (!buffers) await Promise.race([loadSamples(ac), new Promise((r) => setTimeout(r, 2500))]);
  if (current?.token !== token) return null; // stopped, or another score started, while loading
  const out = ac.createGain();
  out.gain.value = buffers ? 0.55 : 0.9;
  out.connect(roomOf(ac));
  let t = ac.currentTime + 0.08;
  const timers = [];
  let i = 0;
  for (const n of notes) {
    if (n.rest) { t += n.rest * tempo; continue; }
    const t1 = t + n.dur * tempo;
    if (buffers) sampled(ac, out, n.midi + shift, t, t1);
    else voice(ac, out, 440 * 2 ** ((n.midi + shift - 69) / 12), t, t1);
    const k = i++;
    timers.push(setTimeout(() => onNote(k), (t - ac.currentTime) * 1000));
    t = t1;
  }
  const end = setTimeout(() => { stop(); }, (t - ac.currentTime) * 1000 + 100);
  current = {
    token,
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
