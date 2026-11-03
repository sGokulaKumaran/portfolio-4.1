/* ═══════════════════════════════════════════════════════════════
   VOYAGER · audio.js
   Generative space music + sound effects, synthesised live with the
   Web Audio API. No audio files, no libraries.

   Public surface (contract: ARCHITECTURE.md)
     GK.audio = { ready, play(name, opts), setMusic(bool), setSfx(bool),
                  toggleMusic(), toggleSfx(), isMusicOn(), isSfxOn(),
                  spectrum() → Uint8Array|null, wave() → Uint8Array|null }
     GK.state.audio = { level, bass, mid, high }    eased, every frame
     bus 'audio:state' { music, sfx }               on every change + once after boot
     window.SoundFX.play(name, opts)                legacy alias

   No AudioContext exists and nothing sounds before the visitor's own
   gesture: ENGAGE with sound, or a later explicit music / sfx toggle.

   Signal flow
     music layers ─► gate ─► musicBus ─► HP ─► LP (hull muffle) ─► duck ─► tremolo ─┐
     sfx groups D/W/S ─► sfxBus ────────────────────────────────────────────────────┼─► limiter ─► trim ─► master ─► out
     ui group U ─────► uiBus ───────────────────────────────────────────────────────┘                        └─► analyser
     hall (long convolver) returns into musicBus, plate (short) into sfxBus,
     ping-pong delay into the sum and a little into the hall.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const GK = window.GK;
  if (!GK || typeof GK.register !== 'function') return;

  GK.register('audio', function init(GK) {
    const env = GK.env, state = GK.state, bus = GK.bus, store = GK.store;
    const clamp = GK.util.clamp, damp = GK.util.damp, smoothstep = GK.util.smoothstep;
    const AC = window.AudioContext || window.webkitAudioContext || null;
    /* light engine for weak devices: shorter reverb, fewer simultaneous voices, roomier
       output buffer. Re-read when cosmos switches the site to lite (see 'lite' below). */
    let LOW = !!(env.lowPower || env.mobile || env.lite);

    /* ───────────────────────── helpers ───────────────────────── */
    const rnd = (a, b) => a + Math.random() * (b - a);
    const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const chance = p => Math.random() < p;
    const mod = (a, n) => ((a % n) + n) % n;
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    const msNow = () => performance.now();

    /* ───────────────────────── harmony map ─────────────────────────
       One mode per sector; the key signature brightens around the circle
       of fifths from D phrygian (Origin) to D major (Transmission).
       pc root pitch-class · sc scale · prog scale degrees · I intensity
       lp pad cutoff · fm bell ratio · L [sub,pad,shimmer,wind,bell,ping,whale,chatter] */
    const PH = [0, 1, 3, 5, 7, 8, 10], AE = [0, 2, 3, 5, 7, 8, 10], DO = [0, 2, 3, 5, 7, 9, 10], LY = [0, 2, 4, 6, 7, 9, 11],
      MX = [0, 2, 4, 5, 7, 9, 10], IO = [0, 2, 4, 5, 7, 9, 11], WT = [0, 2, 4, 6, 8, 10];
    const SECT = [
      { pc: 2,  sc: PH, prog: [0, 1, 0, 6], I: 0.22, lp: 520,  fm: 1.41, L: [1, 0.8, 0.2, 1, 0.25, 1, 0.6, 0] },      // Origin
      { pc: 2,  sc: AE, prog: [0, 5, 2, 6], I: 0.38, lp: 800,  fm: 3.5,  L: [1, 0.9, 0.4, 0.8, 0.6, 1, 0, 1] },       // Signal
      { pc: 5,  sc: LY, prog: [0, 1, 0, 5], I: 0.45, lp: 1200, fm: 2,    L: [0.8, 1, 0.6, 0.5, 0.7, 0.3, 1, 0] },     // Crew
      { pc: 9,  sc: DO, prog: [0, 3, 0, 6], I: 0.50, lp: 1400, fm: 2,    L: [0.8, 1, 0.7, 0.5, 0.9, 0.4, 0.3, 0.2] }, // Trajectory
      { pc: 4,  sc: AE, prog: [0, 5, 2, 6], I: 0.80, lp: 2000, fm: 3.5,  L: [1, 1, 0.8, 0.8, 1, 0.8, 0.3, 0.6] },     // Missions
      { pc: 0,  sc: LY, prog: [0, 1, 4, 0], I: 0.60, lp: 1700, fm: 3.5,  L: [0.8, 0.8, 0.9, 0.4, 0.8, 1, 0, 1] },     // Telemetry
      { pc: 9,  sc: MX, prog: [0, 6, 3, 0], I: 0.65, lp: 1800, fm: 2,    L: [0.9, 1, 0.7, 0.5, 0.9, 0.4, 0.8, 0.3] }, // Deployments
      { pc: 11, sc: DO, prog: [0, 3, 6, 0], I: 0.70, lp: 1900, fm: 3.5,  L: [1, 0.9, 0.8, 0.6, 0.9, 0.9, 0, 1] },     // Systems
      { pc: 2,  sc: LY, prog: [0, 1, 0, 2], I: 0.55, lp: 2200, fm: 2.76, L: [0.6, 0.9, 1, 0.4, 1, 0.5, 0.8, 0] },     // Constellations
      { pc: 2,  sc: IO, prog: [0, 3, 5, 4], I: 0.75, lp: 3000, fm: 2,    L: [0.9, 1, 1, 0.3, 1, 0.2, 0.7, 0] },       // Transmission
      { pc: 2,  sc: WT, prog: [0],          I: 1,    lp: 2600, fm: 1.41, L: [1, 0.8, 1, 1.5, 0.3, 0, 0, 0.5] },       // Wormhole
    ];
    const WORM = SECT.length - 1;
    /* MIDI note of a scale degree. `fold` keeps high registers within ±6 semitones across keys (used by SFX). */
    function keyMidi(h, deg, oct, fold) {
      const s = h.sc, n = s.length, pc = fold && h.pc > 6 ? h.pc - 12 : h.pc;
      return pc + 12 * (oct + 1 + Math.floor(deg / n)) + s[mod(deg, n)];
    }

    /* ───────────────────────── session state ───────────────────────── */
    const MASTER = 0.85, STEP = 0.5;
    let MAXV = LOW ? 14 : 28;     // simultaneous sfx voices
    let MAXM = LOW ? 6 : 12;      // simultaneous music event voices
    bus.on('lite', () => { LOW = true; MAXV = 14; MAXM = 6; });
    let ctx = null, sr = 48000, fMax = 20000, G = null, M = null, NZ = null;
    let dead = !AC;
    let prefMusic = !dead && store.get('music', true) !== false;
    let prefSfx = !dead && store.get('sfx', true) !== false;
    let musicOn = prefMusic, sfxOn = prefSfx;
    let entered = false, unlocked = false, primed = false, armed = false;
    let hidden = !!document.hidden;
    let enterAt = -1e9;
    let idleTimer = 0, teardownTimer = 0;
    let live = 0, mlive = 0;
    let H = SECT[0];              // harmony the music is in (changes on chord boundaries)
    let HK = SECT[0];             // key the sound effects are in (changes immediately)
    const V = { g: 1, d: 1, c: 0 }; // per-call humanisation (gain ×, duration ×, cents); neutral outside play()

    const hz = f => (f > 10 ? (f < fMax ? f : fMax) : 10);
    const audible = () => !!ctx && !!G && ctx.state === 'running';
    const wantRunning = () => unlocked && !hidden && (musicOn || sfxOn);
    const K = (deg, oct) => mtof(keyMidi(HK, deg, oct, true));

    /* ───────────────────────── impulse responses ─────────────────────────
       Computed as plain Float32Arrays in idle slices during the loader, so
       no AudioContext has to exist before the gesture. */
    const HALL_SEC = LOW ? 3.2 : 6.5;
    const raw = { sr: 0, plate: null, hall: null, job: 0 };

    function irChannel(rate, sec, decay, lp0, lp1, preMs, early) {
      const n = Math.max(64, (rate * sec) | 0), pd = Math.min(n - 32, (rate * preMs / 1000) | 0);
      const d = new Float32Array(n), span = n - pd, ratio = lp1 / lp0, onset = rate * 0.012, onsetEnd = onset * 9;
      let y = 0, a = 0;
      for (let i = pd; i < n; i++) {
        const k = i - pd, t = k / span;
        if ((k & 63) === 0) a = Math.exp(-6.2832 * lp0 * Math.pow(ratio, t) / rate); // one-pole LP whose cutoff falls → dark tail
        y = (1 - a) * (Math.random() * 2 - 1) + a * y;
        d[i] = y * Math.pow(1 - t, decay) * (k < onsetEnd ? 1 - Math.exp(-k / onset) : 1);
      }
      for (let k = 0; k < early; k++) {
        const idx = pd + (((0.005 + Math.random() * 0.08) * rate) | 0);
        if (idx < n) d[idx] += (Math.random() < 0.5 ? -1 : 1) * 0.5 * Math.pow(0.8, k);
      }
      return d;
    }
    function prepareIR(rate) {
      const job = ++raw.job, hall = [];
      raw.sr = rate; raw.plate = null; raw.hall = null;
      const steps = [
        function () { raw.plate = [irChannel(rate, 1.9, 3.2, 11000, 3500, 8, 6), irChannel(rate, 1.9, 3.2, 11000, 3500, 8, 6)]; },
        function () { hall[0] = irChannel(rate, HALL_SEC, 2.6, 5200, 500, 40, 0); },
        function () { hall[1] = irChannel(rate, HALL_SEC, 2.6, 5200, 500, 40, 0); raw.hall = hall; },
      ];
      let i = 0;
      (function next() {
        if (job !== raw.job || i >= steps.length) return;
        steps[i++]();
        installIR();
        if (i < steps.length) setTimeout(next, 40);
      })();
    }
    function toBuffer(chs) {
      const b = ctx.createBuffer(chs.length, chs[0].length, sr);
      for (let c = 0; c < chs.length; c++) b.getChannelData(c).set(chs[c]);
      return b;
    }
    function installIR() {
      if (!G || raw.sr !== sr) return;
      try {
        if (raw.plate && !G.plateSet) { G.plate.buffer = toBuffer(raw.plate); G.plateSet = true; raw.plate = null; }
        if (raw.hall && !G.hallSet) { G.hall.buffer = toBuffer(raw.hall); G.hallSet = true; raw.hall = null; }
      } catch (e) { /* a convolver without a buffer is simply silent */ }
    }
    function makeNoise() {
      const nW = (sr * 2) | 0, nP = (sr * 4) | 0, fade = (sr * 0.05) | 0;
      const white = ctx.createBuffer(1, nW, sr), pink = ctx.createBuffer(1, nP, sr);
      const dw = white.getChannelData(0), dp = pink.getChannelData(0), tmp = new Float32Array(nP + fade);
      for (let i = 0; i < nW; i++) dw[i] = Math.random() * 2 - 1;
      let b0 = 0, b1 = 0, b2 = 0, peak = 0;
      for (let i = 0; i < tmp.length; i++) {                     // Paul Kellet's economy pink filter
        const x = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + x * 0.0990460; b1 = 0.96300 * b1 + x * 0.2965164; b2 = 0.57000 * b2 + x * 1.0526913;
        tmp[i] = b0 + b1 + b2 + x * 0.1848;
      }
      for (let i = 0; i < fade; i++) { const k = i / fade; tmp[i] = tmp[nP + i] * (1 - k) + tmp[i] * k; } // seamless loop point
      for (let i = 0; i < nP; i++) { const v = tmp[i] < 0 ? -tmp[i] : tmp[i]; if (v > peak) peak = v; }
      const k = peak > 0 ? 0.9 / peak : 1;
      for (let i = 0; i < nP; i++) dp[i] = tmp[i] * k;
      return { white: white, pink: pink };
    }

    /* ───────────────────────── node + automation primitives ───────────────────────── */
    function gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
    function biquad(type, f, q) {
      const b = ctx.createBiquadFilter();
      b.type = type; b.frequency.value = hz(f); b.Q.value = q === undefined ? 0.7 : q;
      return b;
    }
    function panner(v) {
      v = v > 1 ? 1 : v < -1 ? -1 : v === v ? v : 0;
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = v; return p; }
      const p = ctx.createPanner();                              // old Safari: static equal-power pan
      p.panningModel = 'equalpower'; p.setPosition(v, 0, 1 - Math.abs(v));
      return p;
    }
    /* A "glider" owns a long-lived AudioParam. It only ever receives setTargetAtTime
       events at non-decreasing times, so every move starts from wherever the previous
       one had got to: no clicks, no reliance on param.value or cancelAndHoldAtTime. */
    function glider(param, v) { param.value = v; return { p: param, t: 0, v: v }; }
    function glide(g, v, tc, t) {
      if (!ctx || !g || !isFinite(v)) return;
      const now = ctx.currentTime;
      let at = t !== undefined && t > now ? t : now;
      if (at < g.t) at = g.t;
      g.t = at; g.v = v;
      g.p.setTargetAtTime(v, at, tc > 0.001 ? tc : 0.001);
    }
    /* linear attack `a` ms from silence, then exponential decay reaching −60 dB after `d` ms. Returns the stop time. */
    function envl(p, t, peak, a, d) {
      const ta = t + (a > 1 ? a : 1) / 1000, dd = d > 3 ? d : 3;
      p.setValueAtTime(0, t);
      p.linearRampToValueAtTime(peak > 0 ? peak : 0, ta);
      p.setTargetAtTime(0, ta, dd / 6900);
      return ta + dd / 1000 + 0.05;
    }
    /* every one-shot voice ends here: counted while alive, fully disconnected when its source ends */
    function track(src, nodes, music, done) {
      if (music) mlive++; else live++;
      src.onended = function () {
        src.onended = null;
        if (music) mlive--; else live--;
        for (let i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) { /* already detached */ } }
        if (done) done();
      };
    }
    function route(node, o, t, nodes) {
      const pan = o.pan || 0, sweep = o.pan1 !== undefined;
      if (sweep || pan > 0.02 || pan < -0.02) {
        const p = panner(pan);
        if (sweep && p.pan) { p.pan.setValueAtTime(clamp(pan, -1, 1), t); p.pan.linearRampToValueAtTime(clamp(o.pan1, -1, 1), t + (o.pt || 0.4)); }
        node.connect(p); p.connect(o.dest); nodes.push(p);
      } else node.connect(o.dest);
    }

    /* One-shot oscillator voice.
       o { type, f, f1 → exp glide over ft s, c cents, c1 cents droop over ct s, fm ratio + fmi index,
           fty/ff/ff1/fft/q filter, g peak, a ms, d ms, dest, pan, pan1/pt, music, done } */
    function tone(t, o) {
      const osc = ctx.createOscillator(), amp = ctx.createGain(), nodes = [osc, amp];
      const f = hz(o.f), c = (o.c || 0) + V.c;
      if (o.type) osc.type = o.type;
      osc.frequency.setValueAtTime(f, t);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(hz(o.f1), t + (o.ft || 0.1));
      if (c || o.c1) {
        osc.detune.setValueAtTime(c, t);
        if (o.c1) osc.detune.linearRampToValueAtTime(c + o.c1, t + (o.ct || 0.5));
      }
      amp.gain.value = 0;
      const end = envl(amp.gain, t, o.g * V.g, o.a, o.d * V.d);
      let fmOsc = null, head = osc;
      if (o.fm) {
        fmOsc = ctx.createOscillator();
        const idx = ctx.createGain();
        fmOsc.frequency.setValueAtTime(hz(f * o.fm), t); idx.gain.value = f * (o.fmi || 0.3);
        fmOsc.connect(idx); idx.connect(osc.frequency); nodes.push(fmOsc, idx);
      }
      if (o.ff) {
        const fl = ctx.createBiquadFilter();
        fl.type = o.fty || 'lowpass'; fl.Q.value = o.q || 0.7;
        fl.frequency.setValueAtTime(hz(o.ff), t);
        if (o.ff1) fl.frequency.exponentialRampToValueAtTime(hz(o.ff1), t + (o.fft || 0.1));
        head.connect(fl); head = fl; nodes.push(fl);
      }
      head.connect(amp);
      route(amp, o, t, nodes);
      osc.start(t); osc.stop(end);
      if (fmOsc) { fmOsc.start(t); fmOsc.stop(end); }
      track(osc, nodes, o.music, o.done);
    }

    /* One-shot noise voice (looped shared buffer, random offset).
       o { pink, fty, ff, ff1/fft, ff2/fft2, q, q1, g, a, d, dest, pan, pan1/pt, music, done } */
    function noise(t, o) {
      const buf = o.pink ? NZ.pink : NZ.white, src = ctx.createBufferSource(), amp = ctx.createGain(), nodes = [src, amp];
      let head = src, g = o.g * V.g;
      src.buffer = buf; src.loop = true;
      if (o.fty) {
        const fl = ctx.createBiquadFilter(), q = o.q || 0.7;
        fl.type = o.fty;
        fl.Q.setValueAtTime(q, t);
        fl.frequency.setValueAtTime(hz(o.ff), t);
        if (o.ff1) {
          const t1 = t + (o.fft || 0.1);
          fl.frequency.exponentialRampToValueAtTime(hz(o.ff1), t1);
          if (o.q1) fl.Q.linearRampToValueAtTime(o.q1, t1);
          if (o.ff2) fl.frequency.exponentialRampToValueAtTime(hz(o.ff2), t1 + (o.fft2 || 0.1));
        }
        if (o.fty === 'bandpass' && q > 2) g *= Math.min(4, 0.6 * Math.sqrt(q)); // narrow bands throw most of the noise away
        head.connect(fl); head = fl; nodes.push(fl);
      }
      amp.gain.value = 0;
      const end = envl(amp.gain, t, g, o.a, o.d * V.d);
      head.connect(amp);
      route(amp, o, t, nodes);
      src.start(t, Math.random() * (buf.duration - 0.25)); src.stop(end);
      track(src, nodes, o.music, o.done);
    }

    /* FM bell: carrier + modulator whose index collapses quickly, plus one inharmonic partial.
       o { g peak, vel 0..1, tau decay s, fm ratio, dest, pan, music, done } */
    function bell(t, f, o) {
      f = hz(f) * Math.pow(2, V.c / 1200);
      const vel = o.vel || 1, tau = Math.max(0.03, (o.tau || 0.3) * V.d), ratio = o.fm || HK.fm;
      const car = ctx.createOscillator(), fmOsc = ctx.createOscillator(), idx = ctx.createGain(),
        par = ctx.createOscillator(), pg = ctx.createGain(), amp = ctx.createGain();
      const nodes = [car, fmOsc, idx, par, pg, amp];
      const end = t + 0.004 + Math.min(tau * 6.9, 10) + 0.05;
      car.frequency.setValueAtTime(f, t);
      fmOsc.frequency.setValueAtTime(hz(f * ratio), t);
      par.frequency.setValueAtTime(hz(f * 2.76), t);
      idx.gain.setValueAtTime(2.2 * f * vel, t); idx.gain.setTargetAtTime(0.05 * f, t, Math.min(0.22, tau));
      pg.gain.setValueAtTime(0.15, t); pg.gain.setTargetAtTime(0, t, Math.min(0.25, tau * 0.7));
      amp.gain.value = 0;
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(o.g * V.g > 0 ? o.g * V.g : 0, t + 0.004);
      amp.gain.setTargetAtTime(0, t + 0.004, tau);
      fmOsc.connect(idx); idx.connect(car.frequency);
      car.connect(amp); par.connect(pg); pg.connect(amp);
      route(amp, o, t, nodes);
      car.start(t); fmOsc.start(t); par.start(t);
      car.stop(end); fmOsc.stop(end); par.stop(end);
      track(car, nodes, o.music, o.done);
    }

    /* ───────────────────────── context + master graph ───────────────────────── */
    function buildGraph() {
      const g = {}, lpMax = Math.min(20000, sr * 0.45);
      const sum = gain(1), lim = ctx.createDynamicsCompressor(), trim = gain(0.68), master = gain(MASTER), an = ctx.createAnalyser();
      lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.25;
      an.fftSize = LOW ? 256 : 1024; an.smoothingTimeConstant = 0.82; an.maxDecibels = -20; an.minDecibels = -90;
      sum.connect(lim); lim.connect(trim); trim.connect(master); master.connect(ctx.destination); master.connect(an);
      g.analyser = an; g.master = glider(master.gain, MASTER); g.lpMax = lpMax;

      /* music chain */
      const musicIn = gain(0), musicBus = gain(0.9), hp = biquad('highpass', 20, 0.7), lp = biquad('lowpass', lpMax, 0.7), duck = gain(1), trem = gain(1);
      musicIn.connect(musicBus); musicBus.connect(hp); hp.connect(lp); lp.connect(duck); duck.connect(trem); trem.connect(sum);
      g.musicIn = musicIn; g.tremNode = trem;
      g.hpF = glider(hp.frequency, 20); g.lpF = glider(lp.frequency, lpMax); g.lpQ = glider(lp.Q, 0.7); g.duck = glider(duck.gain, 1);

      /* sfx + ui buses */
      const sfxBus = gain(0.8), uiBus = gain(0.8);
      sfxBus.connect(sum); uiBus.connect(sum);

      /* hall (inside the muffle) and plate; both kept clear of sub-bass mud */
      const hallIn = gain(1), hallHP = biquad('highpass', 140, 0.7), hall = ctx.createConvolver(), hallRet = gain(0.5);
      hallIn.connect(hallHP); hallHP.connect(hall); hall.connect(hallRet); hallRet.connect(musicBus);
      const plateIn = gain(1), plateHP = biquad('highpass', 220, 0.7), plate = ctx.createConvolver(), plateRet = gain(0.45);
      plateIn.connect(plateHP); plateHP.connect(plate); plate.connect(plateRet); plateRet.connect(sfxBus);
      g.hall = hall; g.plate = plate; g.hallSet = false; g.plateSet = false;

      /* ping-pong delay */
      const dlyIn = gain(1), dL = ctx.createDelay(1), dR = ctx.createDelay(1), fbLP = biquad('lowpass', 2400, 0.5),
        fb1 = gain(0.38), fb2 = gain(0.38), merge = ctx.createChannelMerger(2), dlyRet = gain(0.3), dlyHall = gain(0.25);
      dL.delayTime.value = 0.42; dR.delayTime.value = 0.63;
      dlyIn.connect(dL); dL.connect(merge, 0, 0); dL.connect(fbLP); fbLP.connect(fb1); fb1.connect(dR);
      dR.connect(merge, 0, 1); dR.connect(fb2); fb2.connect(dL);
      merge.connect(dlyRet); dlyRet.connect(sum); merge.connect(dlyHall); dlyHall.connect(hallIn);

      /* the music's own doors into hall + delay, so "music off" lets tails ring out but feeds nothing new */
      const mHall = gain(0), mDly = gain(0);
      mHall.connect(hallIn); mDly.connect(dlyIn);
      g.mHall = mHall; g.mDly = mDly;
      g.gates = [glider(musicIn.gain, 0), glider(mHall.gain, 0), glider(mDly.gain, 0)];

      /* persistent send groups: a voice connects to exactly one node */
      function group(dest, toPlate, toHall, toDly) {
        const n = gain(1);
        n.connect(dest);
        if (toPlate) { const s = gain(toPlate); n.connect(s); s.connect(plateIn); }
        if (toHall) { const s = gain(toHall); n.connect(s); s.connect(hallIn); }
        if (toDly) { const s = gain(toDly); n.connect(s); s.connect(dlyIn); }
        return n;
      }
      g.U = group(uiBus, 0.3, 0, 0);       // interface ticks
      g.D = group(sfxBus, 0.2, 0, 0);      // dry, close
      g.W = group(sfxBus, 0.5, 0.2, 0);    // wet
      g.S = group(sfxBus, 0.4, 0.6, 0.4);  // spacious
      return g;
    }

    function createContext() {
      if (ctx) return true;
      if (dead) return false;
      let c = null;
      /* the smallest buffer crackles as soon as a weak device is busy; touch has no hover sounds, so it can take the roomiest */
      const latencyHint = !LOW ? 'interactive' : env.fine ? 'balanced' : 'playback';
      try { c = new AC({ latencyHint: latencyHint }); } catch (e) { try { c = new AC(); } catch (e2) { c = null; } }
      if (!c) { dead = true; return false; }
      try {
        ctx = c; sr = c.sampleRate || 44100; fMax = Math.min(20000, sr * 0.45);
        G = buildGraph();
        NZ = makeNoise();
        freq = new Uint8Array(G.analyser.frequencyBinCount);
        wav = new Uint8Array(G.analyser.fftSize);
        const binHz = sr / G.analyser.fftSize, last = freq.length - 1;
        const b0 = 1, b1 = clamp(Math.round(250 / binHz), b0 + 1, last - 2), b2 = clamp(Math.round(2000 / binHz), b1 + 1, last - 1),
          b3 = clamp(Math.round(8000 / binHz), b2 + 1, last);
        bands = [b0, b1, b2, b3];
      } catch (e) {
        ctx = null; G = null; NZ = null; dead = true;
        try { c.close(); } catch (e2) { /* nothing to close */ }
        return false;
      }
      c.onstatechange = onState;
      if (raw.sr !== sr) prepareIR(sr); else installIR();
      return true;
    }
    function resumeCtx() {
      if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
      try { const p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* retried on the next gesture */ }
    }
    function suspendCtx() {
      if (!ctx || ctx.state !== 'running') return;
      try { const p = ctx.suspend(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* stays running, harmless */ }
    }
    /* the browser suspended / interrupted us while we should be audible → resume on the next gesture */
    function onGesture() { if (!ctx || ctx.state === 'running' || !wantRunning()) disarm(); else resumeCtx(); }
    function arm() {
      if (armed) return;
      armed = true;
      ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) { window.addEventListener(ev, onGesture, { capture: true, passive: true }); });
    }
    function disarm() {
      if (!armed) return;
      armed = false;
      ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) { window.removeEventListener(ev, onGesture, { capture: true }); });
    }
    function onState() {
      if (!ctx) return;
      if (ctx.state === 'running') disarm();
      else if (wantRunning()) arm();
    }
    /* must run inside a user gesture */
    function unlock() {
      if (!createContext()) return false;
      unlocked = true;
      resumeCtx();
      if (!primed) {
        primed = true;
        try {                                                    // iOS: a buffer started inside the gesture opens the output
          const s = ctx.createBufferSource();
          s.buffer = ctx.createBuffer(1, 1, sr);
          s.connect(ctx.destination);
          s.onended = function () { s.onended = null; try { s.disconnect(); } catch (e) { /* detached */ } };
          s.start(0);
        } catch (e) { /* not needed elsewhere */ }
      }
      if (ctx.state !== 'running') arm();
      applyMuffle();
      return true;
    }

    /* ───────────────────────── on / off / fades ───────────────────────── */
    function setGate(v, tc, t) { for (let i = 0; i < G.gates.length; i++) glide(G.gates[i], v, tc, t); }
    function syncMusic(tau, at) {
      clearTimeout(teardownTimer);
      if (musicOn) {
        if (hidden) return;
        if (!M) buildMusic();
        startClock();
        setGate(1, tau || 0.8, at);
      } else {
        setGate(0, 0.3);
        if (M) teardownTimer = setTimeout(destroyMusic, 3000);
      }
    }
    function refresh(tau, musicTau, musicAt) {
      if (!ctx || !unlocked) return;
      clearTimeout(idleTimer);
      if (wantRunning()) {
        resumeCtx();
        glide(G.master, MASTER, tau || 0.6);
        if (ctx.state !== 'running') arm();
      } else {
        glide(G.master, 0, 0.25);
        idleTimer = setTimeout(function () { if (!wantRunning()) { stopClock(); suspendCtx(); } }, 1400);
      }
      syncMusic(musicTau || tau, musicAt);
    }
    function emitState() { bus.emit('audio:state', { music: musicOn, sfx: sfxOn }); }

    function setMusic(on) {
      if (dead) return;
      on = !!on;
      musicOn = on; prefMusic = on; store.set('music', on);
      if (entered) {
        if (on && !unlock()) { musicOn = false; sfxOn = false; }
        refresh(0.8);
      }
      emitState();
    }
    function setSfx(on) {
      if (dead) return;
      on = !!on;
      sfxOn = on; prefSfx = on; store.set('sfx', on);
      if (entered) {
        if (on && !unlock()) { musicOn = false; sfxOn = false; }
        refresh(0.6);
      }
      emitState();
    }

    bus.on('enter', function (d) {
      if (entered) return;
      entered = true; enterAt = msNow();
      const sound = !!d && d.sound === true && !d.auto;
      if (dead || !sound) { musicOn = false; sfxOn = false; emitState(); return; }   // silent session until an explicit toggle
      musicOn = prefMusic; sfxOn = prefSfx;
      if (musicOn || sfxOn) {
        if (unlock()) {
          const at = sfxOn ? engage() : ctx.currentTime + 0.15;
          refresh(0.05, 2.5, at);
        } else { musicOn = false; sfxOn = false; }
      }
      emitState();
    });

    bus.on('visibility', function (d) {
      hidden = !!(d && d.hidden);
      if (hidden) { const a = state.audio; if (a) a.level = a.bass = a.mid = a.high = 0; }
      refresh(0.6);
    });

    /* ───────────────────────── analysis → GK.state.audio ───────────────────────── */
    let freq = null, wav = null, bands = null, freqAt = -1, wavAt = -1;
    function readFreq() { if (freqAt !== state.frame) { G.analyser.getByteFrequencyData(freq); freqAt = state.frame; } return freq; }
    function readWave() { if (wavAt !== state.frame) { G.analyser.getByteTimeDomainData(wav); wavAt = state.frame; } return wav; }
    function bandAvg(f, a, b) { let s = 0; for (let i = a; i < b; i++) s += f[i]; return s / ((b - a) * 255); }
    function ease(cur, to, dt) {
      to = to > 1 ? 1 : to > 0 ? to : 0;
      cur = cur > 0 ? cur : 0;
      return damp(cur, to, to > cur ? 18 : 6, dt);
    }
    GK.ticker.add(function (st, dt) {
      const a = st.audio;
      if (!a) return;
      let lv = 0, bs = 0, md = 0, hi = 0;
      if (audible()) {
        const f = readFreq(), w = readWave();
        let s = 0;
        for (let i = 0; i < w.length; i++) { const x = (w[i] - 128) / 128; s += x * x; }
        lv = Math.pow(Math.sqrt(s / w.length) * 5, 0.7);
        bs = bandAvg(f, bands[0], bands[1]) * 1.15;
        md = bandAvg(f, bands[1], bands[2]) * 1.5;
        hi = bandAvg(f, bands[2], bands[3]) * 2.2;
        react(st);
      } else if (!(a.level > 0.002 || a.bass > 0.002 || a.mid > 0.002 || a.high > 0.002)) {
        a.level = a.bass = a.mid = a.high = 0;
        return;
      }
      a.level = ease(a.level, lv, dt); a.bass = ease(a.bass, bs, dt); a.mid = ease(a.mid, md, dt); a.high = ease(a.high, hi, dt);
    }, -10);

    /* ───────────────────────── music engine ─────────────────────────
       Persistent layers (sub, pad, shimmer, wind, engine) plus sparse events
       (bells, sonar pings, whale calls, data chatter) driven by a look-ahead
       scheduler on the audio clock. Built when music turns on and torn down a
       few seconds after it turns off, so a muted site costs nothing. */
    const BEAT = [1, 0.08, 0.25, 0.08, 0.5, 0.08, 0.25, 0.08];
    let clock = 0, nextT = 0, stepN = 0;
    let spd = 0, wormP = 0;
    let wantH = 0, hDue = false, hTimer = 0, warping = false;

    function keep(m, n) { m.nodes.push(n); return n; }
    function run(m, s, when, offset) {
      m.srcs.push(s); m.nodes.push(s);
      if (offset === undefined) s.start(when); else s.start(when, offset);
      return s;
    }
    function layer(m, dry, toHall, toDly) {
      const n = keep(m, gain(0)), d = keep(m, gain(dry));
      n.connect(d); d.connect(G.musicIn);
      if (toHall) { const s = keep(m, gain(toHall)); n.connect(s); s.connect(G.mHall); }
      if (toDly) { const s = keep(m, gain(toDly)); n.connect(s); s.connect(G.mDly); }
      return { node: n, g: glider(n.gain, 0) };
    }
    function lfo(m, t, rate, depth, param) {
      const o = ctx.createOscillator(), d = keep(m, gain(depth));
      o.frequency.value = rate;
      o.connect(d); d.connect(param);
      return run(m, o, t);
    }

    function buildMusic() {
      const t = ctx.currentTime;
      const m = {
        nodes: [], srcs: [], h: -1, active: 0, chord: 0, notes: [40, 55, 62, 67], prev: [40, 55, 62, 67], tones: [0, 2, 4, 6], major: false,
        chordStep: 0, chordReady: 0, progIdx: 0, q: 0, qLo: 0, qHi: 0, rest: 4, gap: 0, left: rint(3, 6), inPhrase: false,
        cPing: 12, cWhale: 40, cChatter: 50, engine: null, shep: null, trem: null, cabin: null, shepLive: false, shepT: 0, ph: 0,
      };
      H = SECT[wantH];

      m.sub = layer(m, 1, 0, 0);
      m.pad = layer(m, 1, 0.6, 0);
      m.wind = layer(m, 1, 0.4, 0);
      m.bell = layer(m, 1, 0.7, 0.35);
      m.ping = layer(m, 1, 0.5, 0.8);
      /* every layer plays on every device; LOW only trims voice counts and reverb length */
      m.shimmer = layer(m, 1, 0.9, 0.4);
      m.whale = layer(m, 0.3, 1, 0);
      m.chatter = layer(m, 1, 0.3, 0);

      /* sub: root + octave + fifth through a soft saturator, slow swell */
      const subSum = keep(m, gain(0.6)), shaper = keep(m, ctx.createWaveShaper()), subLP = keep(m, biquad('lowpass', 220, 0.7)), subAmp = keep(m, gain(1));
      const curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(2.5 * (i / 511.5 - 1));
      shaper.curve = curve;
      subSum.connect(shaper); shaper.connect(subLP); subLP.connect(subAmp); subAmp.connect(m.sub.node);
      lfo(m, t, 0.07, 0.2, subAmp.gain);
      const subF = mtof(keyMidi(H, 0, 1));
      m.subOsc = [[1, 'sine', 1, 0], [2, 'sine', 0.35, 4], [1.5, 'triangle', 0.12, 0]].map(function (def) {
        const o = ctx.createOscillator(), g = keep(m, gain(def[2]));
        o.type = def[1]; o.detune.value = def[3];
        const f = glider(o.frequency, subF * def[0]);
        o.connect(g); g.connect(subSum);
        run(m, o, t);
        return { mul: def[0], f: f };
      });

      /* pad: two cross-fading chord slots of detuned, slowly breathing voices */
      const NV = LOW ? 3 : 4, NO = LOW ? 1 : 2, PANS = LOW ? [-0.5, 0, 0.5] : [-0.6, -0.2, 0.2, 0.6];
      const real = new Float32Array(17), imag = new Float32Array(17);
      for (let n = 1; n <= 16; n++) imag[n] = 1 / Math.pow(n, 1.6);
      const padWave = ctx.createPeriodicWave(real, imag);
      const ampLfo = [0.07, 0.09, 0.11, 0.13].slice(0, NV).map(function (rate) {
        const o = ctx.createOscillator();
        o.frequency.value = rate;
        return run(m, o, t);
      });
      const lpLfo = ctx.createOscillator();
      lpLfo.frequency.value = 0.05;
      run(m, lpLfo, t);
      m.slots = [0, 1].map(function () {
        const lp = keep(m, biquad('lowpass', H.lp, 0.7)), sg = keep(m, gain(0)), sweep = keep(m, gain(290)), voices = [];
        lpLfo.connect(sweep); sweep.connect(lp.detune);
        lp.connect(sg); sg.connect(m.pad.node);
        for (let v = 0; v < NV; v++) {
          const vg = keep(m, gain(0.25)), dep = keep(m, gain(0.075)), pn = keep(m, panner(PANS[v])), fs = [];
          ampLfo[v].connect(dep); dep.connect(vg.gain);
          vg.connect(pn); pn.connect(lp);
          for (let k = 0; k < NO; k++) {
            const o = ctx.createOscillator();
            o.setPeriodicWave(padWave);
            o.detune.value = (NO === 1 ? 0 : k ? 6 : -6) + rnd(-2, 2);
            fs.push(glider(o.frequency, 220));
            o.connect(vg);
            run(m, o, t);
          }
          voices.push(fs);
        }
        return { voices: voices, g: glider(sg.gain, 0), lp: glider(lp.frequency, hz(H.lp)) };
      });

      /* shimmer: three high sines fading in and out of each other */
      if (m.shimmer) {
        const hp = keep(m, biquad('highpass', 900, 0.7)), vibDepth = keep(m, gain(3)), vib = ctx.createOscillator();
        vib.frequency.value = 5;
        vib.connect(vibDepth); run(m, vib, t);
        hp.connect(m.shimmer.node);
        m.shim = [0.11, 0.17, 0.23].map(function (rate) {
          const o = ctx.createOscillator(), g = keep(m, gain(0.5));
          const f = glider(o.frequency, 1200);
          lfo(m, t, rate, 0.5, g.gain);
          vibDepth.connect(o.detune);
          o.connect(g); g.connect(hp);
          run(m, o, t);
          return f;
        });
      } else m.shim = null;

      /* wind: band-passed pink noise that wanders, plus a thread of air */
      const pinkSrc = ctx.createBufferSource(), bp = keep(m, biquad('bandpass', 400, 1.2)), air = keep(m, biquad('highpass', 4000, 0.7)),
        airG = keep(m, gain(0.25)), windSum = keep(m, gain(1));
      pinkSrc.buffer = NZ.pink; pinkSrc.loop = true;
      pinkSrc.connect(bp); pinkSrc.connect(air); air.connect(airG); bp.connect(windSum); airG.connect(windSum);
      lfo(m, t, 0.04, 500, bp.detune);
      if (ctx.createStereoPanner) {
        const wp = keep(m, ctx.createStereoPanner());
        lfo(m, t, 0.025, 0.7, wp.pan);
        windSum.connect(wp); wp.connect(m.wind.node);
      } else windSum.connect(m.wind.node);
      run(m, pinkSrc, t, rnd(0, 3));
      m.windF = glider(bp.frequency, 400);

      M = m;
      applyHarmony(wantH, t, true);
      applyMuffle();
      if (wormP > 0) setWormhole(wormP);
    }

    function destroyMusic() {
      const m = M;
      if (!m || !ctx || musicOn) return;
      M = null;
      stopClock();
      const t = ctx.currentTime + 0.05;
      for (let i = 0; i < m.srcs.length; i++) { try { m.srcs[i].stop(t); } catch (e) { /* already stopped */ } }
      for (let i = 0; i < m.nodes.length; i++) { try { m.nodes[i].disconnect(); } catch (e) { /* already detached */ } }
    }

    function buildEngine(m) {
      const t = ctx.currentTime, o = ctx.createOscillator(), lp = keep(m, biquad('lowpass', 90, 0.7)), lay = layer(m, 1, 0, 0);
      o.type = 'sawtooth';
      const freq = glider(o.frequency, mtof(keyMidi(H, 0, 2))), det = glider(o.detune, 0);
      o.connect(lp); lp.connect(lay.node);
      run(m, o, t);
      m.engine = { g: lay.g, lp: glider(lp.frequency, 90), det: det, freq: freq };
    }

    /* layer levels + filters as a function of sector mix, flight speed and the wormhole */
    function pushLevels(tc, t, speedOnly, lpTc) {
      const m = M;
      if (!m) return;
      const L = H.L, v = spd, lp = hz(H.lp * (1 + 0.8 * v));
      glide(m.wind.g, Math.min(0.6, (0.09 + 0.26 * v) * L[3] * (1 + wormP)), tc, t);
      glide(m.windF, 400 + 1800 * v * v, tc, t);
      if (m.shimmer) glide(m.shimmer.g, 0.024 * L[2] * (1 + 1.5 * v), tc, t);
      glide(m.slots[0].lp, lp, lpTc, t); glide(m.slots[1].lp, lp, lpTc, t);
      if (!m.engine && v > 0.03) buildEngine(m);
      if (m.engine) { glide(m.engine.g, 0.07 * v, tc, t); glide(m.engine.lp, 90 + 400 * v, tc, t); glide(m.engine.det, 200 * v, tc, t); }
      if (speedOnly) return;
      glide(m.sub.g, 0.15 * L[0], tc, t);
      glide(m.pad.g, 0.15 * L[1], tc, t);
      glide(m.bell.g, 0.4 + 0.6 * L[4], tc, t);
      glide(m.ping.g, L[5] > 0 ? 0.5 + 0.5 * L[5] : 0, tc, t);
      if (m.whale) glide(m.whale.g, L[6] > 0 ? 0.5 + 0.5 * L[6] : 0, tc, t);
      if (m.chatter) glide(m.chatter.g, L[7] > 0 ? 0.5 + 0.5 * L[7] : 0, tc, t);
    }

    /* ── harmony ── */
    function crowded(x, arr) {
      for (let i = 0; i < arr.length; i++) {
        const y = arr[i], gap = Math.abs(x - y);
        if (gap === 0 || (gap < 3 && (x < 55 || y < 55))) return true;
      }
      return false;
    }
    /* root in MIDI 36–47, upper voices in 48–72 by nearest motion from the previous chord */
    function voiceChord(degs) {
      const m = M, out = [36 + mod(keyMidi(H, degs[0], 1) - 36, 12)];
      for (let v = 1; v < 4; v++) {
        const pc = mod(keyMidi(H, degs[v], 1), 12);
        let best = 48 + pc, bd = 1e9;
        for (let x = 48 + pc; x <= 72; x += 12) { const dist = Math.abs(x - m.prev[v]); if (dist < bd) { bd = dist; best = x; } }
        for (let guard = 0; guard < 3 && crowded(best, out); guard++) best += 12;
        out[v] = best;
      }
      m.prev = out;
      return out;
    }
    /* retune the idle pad slot, then cross-fade it in over the sounding one */
    function setChord(d, t, tin, tout, hold, subTc) {
      const m = M, n = H.sc.length;
      const third = H.I < 0.35 ? d + 1 : d + 2, top = m.h === 9 ? d + 8 : d + 6;   // sus2 in the void, add9 at the sunrise
      m.chord = d;
      m.tones = [mod(d, n), mod(third, n), mod(d + 4, n), mod(top, n)];
      m.major = n === 7 && mod(keyMidi(H, d + 2, 0) - keyMidi(H, d, 0), 12) === 4;
      const notes = voiceChord([d, d + 4, third, top]);
      const idle = m.slots[1 - m.active], cur = m.slots[m.active];
      for (let v = 0; v < idle.voices.length; v++) {
        const f = mtof(notes[v]), vs = idle.voices[v];
        for (let k = 0; k < vs.length; k++) glide(vs[k], f, 0.03, t);
      }
      glide(idle.g, 1, tin, t);
      glide(cur.g, 0, tout, t + hold);
      m.active = 1 - m.active; m.notes = notes; m.chordStep = 0;
      m.chordReady = t + hold + tout * 2.2;                      // the old slot is ≥ 19 dB down by then: safe to retune
      const sf = mtof(H.I < 0.7 ? keyMidi(H, 0, 1) : 24 + mod(keyMidi(H, d, 1) - 24, 12));
      for (let i = 0; i < m.subOsc.length; i++) glide(m.subOsc[i].f, sf * m.subOsc[i].mul, subTc, t);
      if (m.shim) for (let i = 0; i < m.shim.length; i++) glide(m.shim[i], mtof(84 + mod(notes[i + 1], 12)), 0.6, t);
    }
    function applyHarmony(i, t, fast) {
      const m = M;
      if (!m) return;
      const first = m.h < 0, quick = first || fast;
      H = SECT[i]; m.h = i; m.progIdx = 0;
      setChord(H.prog[0], t, first ? 0.05 : fast ? 0.25 : 1.6, fast ? 0.25 : 1.6, quick ? 0 : 0.5, quick ? 0.15 : 0.9);
      melRange();
      pushLevels(quick ? 0.15 : 1.5, t, false, quick ? 0.15 : 2);
      if (m.engine) glide(m.engine.freq, mtof(keyMidi(H, 0, 2)), 0.9, t);
      if (!quick && H.L[4] > 0 && mlive < MAXM) note(keyMidi(H, 4, 5, true), t + 0.06, 0.8);   // pivot bell: the new fifth
    }
    function requestHarmony(i, delayMs) {
      wantH = i; HK = SECT[i];
      clearTimeout(hTimer);
      if (delayMs) hTimer = setTimeout(function () { hDue = true; }, delayMs); else hDue = true;
    }

    /* ── bell melody: a weighted walk over the scale, phrased ── */
    function qMidi(q) { return keyMidi(H, q, 0); }
    function chordTone(q) {
      const m = M, n = H.sc.length;
      for (let k = 0; k <= 4; k++) {
        if (q + k <= m.qHi && m.tones.indexOf(mod(q + k, n)) > -1) return q + k;
        if (q - k >= m.qLo && m.tones.indexOf(mod(q - k, n)) > -1) return q - k;
      }
      return q;
    }
    function melRange() {
      const m = M;
      let lo = 0, hi;
      while (qMidi(lo) < 72 && lo < 90) lo++;
      hi = lo;
      while (qMidi(hi + 1) <= 91 && hi < 120) hi++;
      m.qLo = lo; m.qHi = hi;
      m.q = chordTone(clamp(m.q || (lo + hi) >> 1, lo, hi));
    }
    function melWeight(q) {
      const m = M, n = H.sc.length, dg = mod(q, n);
      if (m.tones.indexOf(dg) > -1) return 3;
      if (H.sc === PH && dg === 1) return 0;                       // the phrygian ♭2 belongs to the pad, not the melody
      if (m.major && dg === mod(m.chord + 3, n)) return 0;         // no 4th over a major chord
      return 1;
    }
    function melNext(closing) {
      const m = M, r = Math.random(), a = r < 0.7 ? 1 : r < 0.9 ? 3 : 0;   // step · leap · repeat
      let chosen = -1, total = 0;
      for (let s = a; s <= (a ? a + 1 : 0); s++) {
        for (let sg = -1; sg <= 1; sg += 2) {
          let q = m.q + s * sg;
          if (q > m.qHi) q = 2 * m.qHi - q;
          if (q < m.qLo) q = 2 * m.qLo - q;
          q = clamp(q, m.qLo, m.qHi);
          let w = melWeight(q);
          if (closing && w < 3) w = 0;                             // phrases land on a chord tone
          if (w > 0) { total += w; if (Math.random() * total < w) chosen = q; }
          if (!s) break;
        }
      }
      return chosen < 0 ? chordTone(m.q) : chosen;
    }
    function note(midi, t, vel) {
      bell(t, mtof(midi), { g: 0.07 * vel, vel: vel, tau: rnd(0.9, 1.4), fm: H.fm, dest: M.bell.node, pan: rnd(-0.6, 0.6), music: true });
    }
    function melody(n, t) {
      const m = M, Lb = H.L[4];
      if (m.rest > 0) { m.rest--; return; }
      if (m.gap > 0) { m.gap--; return; }
      if (!(Lb > 0) || mlive >= MAXM) return;
      let p = (0.06 + 0.22 * H.I) * Lb * (1 + spd) * BEAT[n & 7];
      if (m.inPhrase) p *= 2.5;
      if (!chance(p < 0.9 ? p : 0.9)) return;
      m.q = melNext(m.left === 1);
      note(qMidi(m.q), t + rnd(0, 0.04), rnd(0.5, 1));
      m.gap = 1; m.inPhrase = true;
      if (--m.left <= 0) { m.left = rint(3, 6); m.rest = rint(8, 24); m.inPhrase = false; }
    }

    /* ── sparse events ── */
    function sonar(t) {
      const m = M;
      if (chance(0.4)) {                                           // pulsar: a few clicks walking across the field
        const n = rint(3, 5), dir = chance(0.5) ? 1 : -1;
        for (let k = 0; k < n; k++) {
          noise(t + k * 0.18, { fty: 'bandpass', ff: 2400, q: 12, g: 0.12, a: 1, d: 30, dest: m.ping.node, pan: dir * (-0.6 + (1.2 * k) / (n - 1)), music: true });
        }
      } else {
        const f = mtof(keyMidi(H, 0, 6, true));
        tone(t, { f: f, f1: f * 0.97, ft: 0.15, fty: 'bandpass', ff: f, q: 8, g: 0.05, a: 5, d: 1800, dest: m.ping.node, pan: rnd(-0.4, 0.4), music: true });
      }
    }
    function whale(t) {
      const m = M, m0 = 50 + mod(m.notes[rint(0, m.notes.length - 1)] - 50, 12), m1 = m0 + rnd(3, 7) * (chance(0.5) ? 1 : -1);
      let m2 = Math.round(m1);
      for (let k = 0; k <= 2; k++) {                               // settle on the nearest scale tone
        if (H.sc.indexOf(mod(m2 + k - H.pc, 12)) > -1) { m2 += k; break; }
        if (H.sc.indexOf(mod(m2 - k - H.pc, 12)) > -1) { m2 -= k; break; }
      }
      const f0 = mtof(m0), f1 = mtof(m1), f2 = mtof(m2), end = t + 9, side = chance(0.5) ? 1 : -1;
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain(), bp = ctx.createBiquadFilter(),
        amp = ctx.createGain(), vib = ctx.createOscillator(), vd = ctx.createGain();
      const nodes = [o1, o2, g2, bp, amp, vib, vd];
      o2.type = 'triangle'; g2.gain.value = 0.3;
      bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 1.5;
      vib.frequency.value = 4.5;
      vd.gain.value = 0;
      vd.gain.setValueAtTime(0, t); vd.gain.linearRampToValueAtTime(12, t + 2.5);
      [o1, o2].forEach(function (o) {
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f1, t + 2.2);
        o.frequency.exponentialRampToValueAtTime(f2, t + 4.5);
        vd.connect(o.detune);
      });
      amp.gain.value = 0;
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(0.09, t + 1.2); amp.gain.setTargetAtTime(0, t + 3.6, 0.8);
      vib.connect(vd); o1.connect(bp); o2.connect(g2); g2.connect(bp); bp.connect(amp);
      route(amp, { dest: m.whale.node, pan: -0.5 * side, pan1: 0.5 * side, pt: 6 }, t, nodes);
      o1.start(t); o2.start(t); vib.start(t);
      o1.stop(end); o2.stop(end); vib.stop(end);
      track(o1, nodes, true);
    }
    function chatter(t) {
      const m = M, end = t + rnd(0.6, 1.8), pitches = [];
      for (let k = 0; k < 8; k++) pitches.push(mtof(keyMidi(H, k, 6, true)));
      const o = ctx.createOscillator(), gate = ctx.createGain(), nz = ctx.createBufferSource(), nbp = ctx.createBiquadFilter(), ng = ctx.createGain(),
        hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), amp = ctx.createGain();
      const nodes = [o, gate, nz, nbp, ng, hp, lp, amp];
      o.type = 'square';
      nz.buffer = NZ.white; nz.loop = true;
      nbp.type = 'bandpass'; nbp.frequency.value = 2500; nbp.Q.value = 3; ng.gain.value = 0.3;
      hp.type = 'highpass'; hp.frequency.value = 900;
      lp.type = 'lowpass'; lp.frequency.value = 3200;
      amp.gain.value = 0.016; gate.gain.value = 0;
      gate.gain.setValueAtTime(0, t);
      for (let x = t; x < end; x += rnd(0.045, 0.07)) {
        o.frequency.setValueAtTime(pitches[rint(0, 7)], x);
        gate.gain.setTargetAtTime(chance(0.7) ? 1 : 0, x, 0.003);
      }
      gate.gain.setTargetAtTime(0, end, 0.01);
      o.connect(gate); nz.connect(nbp); nbp.connect(ng); ng.connect(gate); gate.connect(hp); hp.connect(lp); lp.connect(amp);
      route(amp, { dest: m.chatter.node, pan: rnd(-0.7, 0.7) }, t, nodes);
      o.start(t); nz.start(t, rnd(0, 1.5));
      o.stop(end + 0.12); nz.stop(end + 0.12);
      track(o, nodes, true);
    }

    /* ── wormhole: tremolo on the whole score + an endlessly rising Shepard tone ── */
    function buildWormhole(m) {
      const t = ctx.currentTime, lay = layer(m, 1, 0.3, 0), n = LOW ? 4 : 6;
      const depth = keep(m, gain(0)), o = ctx.createOscillator();
      const rate = glider(o.frequency, 6);
      o.connect(depth); depth.connect(G.tremNode.gain);
      run(m, o, t);
      m.trem = { f: rate, d: glider(depth.gain, 0) };
      glide(lay.g, 1, 0.05);
      m.shep = [];
      for (let k = 0; k < n; k++) {
        const so = ctx.createOscillator(), sg = keep(m, gain(0));
        so.frequency.value = 40 * Math.pow(2, k);
        so.connect(sg); sg.connect(lay.node);
        run(m, so, t);
        m.shep.push({ o: so, g: sg, prev: k });
      }
    }
    function shepard(now) {
      const m = M, S = m.shep, n = S.length, p = wormP;
      if (!(p > 0) && !m.shepLive) return;
      m.shepLive = p > 0;                                          // one last pass at p = 0 sends every voice to silence
      const t = Math.max(now + 0.01, m.shepT);
      m.shepT = t;
      m.ph = (m.ph + (0.05 + 0.25 * p) * 0.1) % n;
      for (let k = 0; k < n; k++) {
        const s = S[k], o = (k + m.ph) % n, x = (o - n / 2) * (6 / n), f = 40 * Math.pow(2, o);
        if (o < s.prev) s.o.frequency.setValueAtTime(f, t); else s.o.frequency.setTargetAtTime(f, t, 0.06);   // wraps happen at ≈ −40 dB
        s.g.gain.setTargetAtTime(Math.exp(-0.5 * x * x) * 0.035 * p, t, 0.08);
        s.prev = o;
      }
    }
    function setWormhole(p) {
      wormP = p;
      const m = M;
      if (!m || !ctx) return;
      if (p > 0 && !m.shep) buildWormhole(m);
      if (m.trem) { glide(m.trem.f, 6 + 8 * p, 0.3); glide(m.trem.d, 0.15 * p, 0.3); }
      pushLevels(0.4, undefined, true, 0.4);
    }

    /* ── look-ahead scheduler (audio clock; skips rather than bursts after a stall) ── */
    function onStep(n, t) {
      const m = M;
      if (hDue && !warping) {
        if (m.h === wantH) hDue = false;
        else if (t >= m.chordReady) { hDue = false; applyHarmony(wantH, t, false); }
      }
      if (++m.chordStep >= (H.I <= 0.5 ? 32 : 24)) {
        m.chordStep = 0;
        if (H.prog.length > 1 && t >= m.chordReady) {
          m.progIdx = (m.progIdx + 1) % H.prog.length;
          if (H.prog[m.progIdx] !== m.chord) setChord(H.prog[m.progIdx], t, 1.8, 2.2, 0.5, 0.9);
        }
      }
      melody(n, t);
      if (mlive < MAXM && chance(0.12 * H.I * H.L[2])) {            // sparkle
        tone(t + rnd(0, 0.4), { f: rnd(6000, 9000), g: 0.008, a: 2, d: 60, dest: m.bell.node, pan: rnd(-0.8, 0.8), music: true });
      }
      if (--m.cPing <= 0) { m.cPing = rint(18, 44); if (H.L[5] > 0 && mlive < MAXM) sonar(t + rnd(0, 0.3)); }
      if (m.whale && --m.cWhale <= 0) { m.cWhale = rint(50, 120); if (H.L[6] > 0 && mlive < MAXM) whale(t + rnd(0, 0.4)); }
      if (m.chatter && --m.cChatter <= 0) { m.cChatter = rint(60, 140); if (H.L[7] > 0 && mlive < MAXM) chatter(t + rnd(0, 0.4)); }
    }
    function pump() {
      if (!M || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (nextT < now - 0.05) { const k = Math.ceil((now - nextT) / STEP); stepN += k; nextT += k * STEP; }
      const horizon = now + (document.hidden ? 1.5 : LOW ? 0.6 : 0.35);
      while (nextT < horizon) {
        try { onStep(stepN, nextT); } catch (e) { /* drop this step; the next one starts clean */ }
        stepN++; nextT += STEP;
      }
      if (M && M.shep) shepard(now);
    }
    function startClock() {
      if (clock || !ctx) return;
      nextT = ctx.currentTime + 0.1;
      if (M) { M.cPing = rint(8, 24); M.cWhale = rint(20, 60); M.cChatter = rint(30, 80); M.rest = rint(2, 8); M.gap = 0; }
      clock = setInterval(pump, 100);
    }
    function stopClock() {
      if (clock) { clearInterval(clock); clock = 0; }
    }

    /* ───────────────────────── hull muffle + ducking ───────────────────────── */
    let muffles = 0, mediaOn = false;
    const duckRest = () => (mediaOn ? 0.12 : muffles > 0 ? 0.6 : 1);
    function applyMuffle() {
      if (!G) return;
      const on = muffles > 0;
      glide(G.lpF, on ? 480 : G.lpMax, on ? 0.18 : 0.35);
      glide(G.lpQ, on ? 1.4 : 0.7, 0.2);
      glide(G.duck, duckRest(), 0.25);
    }
    /* big hits push the music down for a moment, then let it swell back */
    function sidechain(t) { glide(G.duck, 0.5 * duckRest(), 0.02, t); glide(G.duck, duckRest(), 0.6, t + 0.35); }
    bus.on('modal:open', function () { muffles++; applyMuffle(); });
    bus.on('modal:close', function () { muffles = Math.max(0, muffles - 1); applyMuffle(); });
    bus.on('overlay:open', function () { muffles++; applyMuffle(); });
    bus.on('overlay:close', function () { muffles = Math.max(0, muffles - 1); applyMuffle(); });
    bus.on('media:play', function () { mediaOn = true; applyMuffle(); });
    bus.on('media:stop', function () { mediaOn = false; applyMuffle(); });

    /* ───────────────────────── reactivity: scroll speed, wormhole, sectors, warp ───────────────────────── */
    let lastReact = 0;
    function react(st) {
      const now = msNow();
      if (now - lastReact < 70) return;                           // at most 15 Hz
      lastReact = now;
      const v = env.reduced ? 0 : st.speed;
      if (Math.abs(v - spd) > 0.02 || (v === 0 && spd !== 0)) {
        const rising = v > spd;
        spd = v;
        pushLevels(rising ? 0.12 : 0.5, undefined, true, 0.3);
      }
      const w = st.wormhole || 0;
      if (Math.abs(w - wormP) > 0.02 || (w === 0 && wormP !== 0)) setWormhole(w);
      if (w > 0.25 && wantH !== WORM) requestHarmony(WORM, 0);
      else if (w <= 0.25 && wantH === WORM) requestHarmony(st.sector, 0);
    }
    bus.on('sector', function (d) {
      if (!d || !SECT[d.index] || wormP > 0.25) return;
      requestHarmony(d.index, 350);
    });
    bus.on('loop', function () { requestHarmony(0, 0); });

    let warpStrength = 0;
    bus.on('warp:start', function (d) {
      warpStrength = d ? num(d.strength, 1) : 1;
      if (msNow() - enterAt < 2500) return;                       // the engage hit already carries its own riser
      warping = true;
      if (env.reduced) { play('whoosh'); return; }
      play('warp', { dur: clamp(num(d && d.duration, 1200) / 1000 * 0.62, 0.4, 1.6), p: warpStrength });
    });
    bus.on('warp:end', function () {
      warping = false;
      if (msNow() - enterAt < 3500) return;
      if (warpStrength >= 0.6 && !env.reduced) play('arrive');
    });

    /* ───────────────────────── sound effects ─────────────────────────
       One family: glassy FM bells, soft sines, filtered noise, long tails.
       Every pitched voice is in the current sector key (K). */
    const CH = [0, 2, 4, 6, 7, 9];                                // chime degrees, ascending
    let hoverStep = 0, hoverAt = 0;

    function riser(t, dur, g) {
      noise(t, { fty: 'bandpass', ff: 200, ff1: 6000, fft: dur, q: 2, q1: 8, g: 0.16 * g, a: dur * 940, d: 60, dest: G.S });
      const f = K(0, 2);
      tone(t, { type: 'sawtooth', f: f, f1: f * 4, ft: dur, fty: 'lowpass', ff: f * 3, ff1: f * 12, fft: dur, g: 0.045 * g, a: dur * 940, d: 60, dest: G.S });
      if (M) { glide(G.hpF, 400, dur * 0.4, t); glide(G.hpF, 20, 0.08, t + dur); }
    }
    function boom(t, g) {
      tone(t, { f: 110, f1: 28, ft: 0.9, g: 0.4 * g, a: 2, d: 1600, dest: G.S });
      noise(t, { fty: 'lowpass', ff: 400, ff1: 80, fft: 0.8, g: 0.2 * g, a: 2, d: 1200, dest: G.S });
      sidechain(t);
    }
    /* the launch: called directly from the ENGAGE gesture; returns when the music should start to swell */
    function engage() {
      const t = ctx.currentTime + 0.03;
      tone(t, { f: 80, f1: 30, ft: 1.4, g: 0.42, a: 2, d: 1600, dest: G.S });
      noise(t, { fty: 'lowpass', ff: 1200, ff1: 100, fft: 1, g: 0.2, a: 2, d: 1000, dest: G.S });
      [[0, 4], [4, 4], [0, 5], [2, 5]].forEach(function (n, i) { bell(t + i * 0.07, K(n[0], n[1]), { g: 0.055, tau: 0.6, dest: G.S, pan: i % 2 ? 0.3 : -0.3 }); });
      riser(t + 0.05, 1.5, 0.8);
      boom(t + 1.6, 0.6);
      return t + 1.6;
    }

    const R = {
      hover: function (t, o, pan) {
        const n = msNow();
        hoverStep = n - hoverAt < 400 ? (hoverStep + 1) % 4 : rint(0, 3);
        hoverAt = n;
        tone(t, { f: K([0, 2, 4, 7][hoverStep], 6), fm: 2, fmi: 0.3, g: 0.028, a: 2, d: 70, dest: G.U, pan: pan });
      },
      tick: function (t, o, pan) {
        noise(t, { fty: 'bandpass', ff: 4200, q: 6, g: 0.022, a: 1, d: 8, dest: G.U, pan: pan });
        tone(t, { f: 2400, c: 700 * clamp(num(o.p, 0), 0, 1), g: 0.014, a: 1, d: 12, dest: G.U, pan: pan });
      },
      click: function (t, o, pan) {
        tone(t, { f: 880, f1: 440, ft: 0.05, g: 0.075, a: 1, d: 90, dest: G.D, pan: pan });
        tone(t, { f: 140, f1: 70, ft: 0.04, g: 0.06, a: 1, d: 45, dest: G.D, pan: pan });
        noise(t, { fty: 'highpass', ff: 5000, g: 0.02, a: 1, d: 4, dest: G.D, pan: pan });
      },
      toggle: function (t) {
        tone(t, { type: 'triangle', f: K(0, 5), fty: 'lowpass', ff: 2400, g: 0.06, a: 3, d: 140, dest: G.W });
        tone(t + 0.07, { type: 'triangle', f: K(4, 5), fty: 'lowpass', ff: 2400, g: 0.06, a: 3, d: 140, dest: G.W });
      },
      lock: function (t, o, pan) {
        tone(t, { type: 'triangle', f: K(4, 6), g: 0.036, a: 1, d: 35, dest: G.U, pan: pan });
        tone(t + 0.028, { type: 'triangle', f: K(4, 6), g: 0.036, a: 1, d: 35, dest: G.U, pan: pan });
        noise(t, { fty: 'bandpass', ff: 1800, ff1: 3200, fft: 0.06, q: 2, g: 0.014, a: 1, d: 60, dest: G.U, pan: pan });
      },
      open: function (t) {
        const f = K(0, 3);
        tone(t, { type: 'sawtooth', f: f, f1: f * 2, ft: 0.26, fty: 'lowpass', ff: 300, ff1: 4200, fft: 0.26, q: 5, g: 0.04, a: 20, d: 420, dest: G.S });
        [0, 2, 4].forEach(function (d, i) { bell(t + i * 0.055, K(d, 5), { g: 0.042, tau: 0.09, dest: G.S }); });
        noise(t, { fty: 'highpass', ff: 6000, g: 0.014, a: 150, d: 200, dest: G.S });
      },
      close: function (t) {
        const f = K(0, 4);
        tone(t, { type: 'sawtooth', f: f, f1: f / 2, ft: 0.18, fty: 'lowpass', ff: 3200, ff1: 250, fft: 0.18, g: 0.036, a: 5, d: 260, dest: G.W });
        bell(t, K(0, 5), { g: 0.032, tau: 0.045, dest: G.W });
      },
      whoosh: function (t, o) {
        const dir = o.dir < 0 ? -1 : 1, f = K(0, 3);
        noise(t, { fty: 'bandpass', ff: 500, ff1: 2600, fft: 0.19, ff2: 700, fft2: 0.19, q: 1.4, g: 0.075, a: 120, d: 300, dest: G.S, pan: -0.5 * dir, pan1: 0.5 * dir, pt: 0.4 });
        tone(t, { f: f, f1: f * (dir > 0 ? 1.5 : 0.667), ft: 0.35, g: 0.024, a: 60, d: 300, dest: G.S });
      },
      warp: function (t, o) { riser(t, clamp(num(o.dur, 0.9), 0.3, 2), clamp(num(o.p, 1), 0.3, 1)); },
      arrive: function (t) {
        boom(t, 1);
        bell(t + 0.02, K(0, 5), { g: 0.05, tau: 0.5, dest: G.S, pan: -0.3 });
        bell(t + 0.11, K(4, 5), { g: 0.05, tau: 0.5, dest: G.S, pan: 0.3 });
      },
      success: function (t) {
        [[0, 5, 0], [2, 5, 0.08], [4, 5, 0.16], [0, 6, 0.26]].forEach(function (n, i) { bell(t + n[2], K(n[0], n[1]), { g: 0.055, tau: 0.13, dest: G.S, pan: i % 2 ? 0.3 : -0.3 }); });
      },
      error: function (t) {
        const f = K(0, 3);
        for (let i = 0; i < 2; i++) {
          tone(t + i * 0.17, { f: f, fty: 'lowpass', ff: 900, g: 0.07, a: 4, d: 110, dest: G.D });
          tone(t + i * 0.17, { type: 'triangle', f: f * 1.0595, fty: 'lowpass', ff: 900, g: 0.05, a: 4, d: 110, dest: G.D });
        }
      },
      type: function (t, o, pan) {
        noise(t, { fty: 'bandpass', ff: rnd(2400, 3600), q: 4, g: 0.016, a: 1, d: 3, dest: G.U, pan: pan });
        tone(t, { f: rnd(260, 340), g: 0.018, a: 1, d: 18, dest: G.U, pan: pan });
      },
      boot: function (t, o) {
        const i = Math.abs(Math.round(num(o.i, 0)));
        tone(t, { f: K(i % 8, 6), fm: 2, fmi: 0.5, g: 0.03, a: 1, d: 25, dest: G.U });
        if (i % 4 === 3) tone(t, { f: 90, g: 0.06, a: 1, d: 60, dest: G.U });
      },
      ping: function (t, o, pan) {
        const f = K(0, 6);
        tone(t, { f: f, f1: f * 0.98, ft: 0.12, g: 0.055, a: 3, d: 1400, dest: G.S, pan: pan });
      },
      scan: function (t) {
        tone(t, { f: 400, f1: 3200, ft: 0.45, g: 0.028, a: 10, d: 450, dest: G.W });
        for (let i = 0; i < 3; i++) noise(t + 0.45 + i * 0.05, { fty: 'bandpass', ff: 4200, q: 6, g: 0.02, a: 1, d: 8, dest: G.U });
      },
      transmit: function (t) {
        for (let i = 0; i < 8; i++) tone(t + i * 0.045, { type: 'triangle', f: K(rint(0, 6), 6), fty: 'bandpass', ff: 2000, q: 5, g: 0.03, a: 2, d: 45, dest: G.S });
        const f = K(0, 4);
        tone(t + 0.4, { f: f, f1: f * 8, ft: 0.6, g: 0.04, a: 20, d: 600, dest: G.S, pan: 0, pan1: 0.8, pt: 0.6 });
        [[0, 5, 0], [2, 5, 0.08], [4, 5, 0.16], [0, 6, 0.26]].forEach(function (n) { bell(t + 1.05 + n[2], K(n[0], n[1]), { g: 0.05, tau: 0.13, dest: G.S }); });
      },
      chime: function (t, o, pan) {
        const i = clamp(Math.round(num(o.i, 0)), 0, CH.length - 1);
        bell(t, K(CH[i], 5), { g: 0.055, tau: 0.3, dest: G.S, pan: pan || (i - 2.5) * 0.2 });
      },
      shoot: function (t, o, pan) {
        tone(t, { type: 'square', f: 1400, f1: 320, ft: 0.11, fty: 'lowpass', ff: 3500, c: rnd(-60, 60), g: 0.03, a: 1, d: 120, dest: G.D, pan: pan });
        noise(t, { fty: 'highpass', ff: 6000, g: 0.012, a: 1, d: 10, dest: G.D, pan: pan });
      },
      hit: function (t, o, pan) {
        noise(t, { fty: 'bandpass', ff: 1800, q: 2, g: 0.06, a: 1, d: 70, dest: G.D, pan: pan });
        tone(t, { type: 'triangle', f: 520, f1: 260, ft: 0.06, g: 0.04, a: 1, d: 60, dest: G.D, pan: pan });
      },
      explode: function (t, o, pan) {
        noise(t, { fty: 'lowpass', ff: 2600, ff1: 180, fft: 0.6, g: 0.15, a: 2, d: 700, dest: G.S, pan: pan });
        tone(t, { f: 120, f1: 38, ft: 0.4, g: 0.2, a: 2, d: 400, dest: G.S, pan: pan });
        for (let i = 0; i < 3; i++) noise(t + rnd(0.06, 0.3), { fty: 'bandpass', ff: rnd(3000, 5000), q: 3, g: 0.04, a: 1, d: 15, dest: G.S, pan: pan });
      },
      pickup: function (t) {
        bell(t, K(0, 6), { g: 0.05, tau: 0.045, dest: G.S });
        bell(t + 0.06, K(4, 6), { g: 0.05, tau: 0.045, dest: G.S });
      },
      gameover: function (t) {
        [[4, 5], [2, 5], [0, 5], [0, 4]].forEach(function (n, i) {
          const last = i === 3;
          tone(t + i * 0.18, { type: 'triangle', f: K(n[0], n[1]), fty: 'lowpass', ff: 1800, g: 0.06, a: 5, d: last ? 2000 : 500, c1: last ? -200 : 0, ct: 1.5, dest: G.S });
        });
        tone(t + 0.54, { f: 90, f1: 35, ft: 0.8, g: 0.2, a: 2, d: 1200, dest: G.S });
      },
      discover: function (t, o, pan) {
        [[0, 5, 0], [2, 5, 0.065], [4, 5, 0.13], [6, 5, 0.195], [0, 6, 0.27]].forEach(function (n, i) {
          bell(t + n[2], K(n[0], n[1]), { g: 0.058, tau: 0.42, dest: G.S, pan: (i - 2) * 0.22 });
        });
        tone(t, { f: K(0, 3), f1: K(0, 4), ft: 0.55, g: 0.045, a: 15, d: 700, dest: G.S, pan: pan });
      },
      gravity: function (t, o, pan) {
        tone(t, { f: 68, f1: 31, ft: 1.1, g: 0.28, a: 12, d: 1300, dest: G.S, pan: pan });
        tone(t, { type: 'triangle', f: K(0, 3), f1: K(4, 3), ft: 0.9, fty: 'lowpass', ff: 600, ff1: 180, fft: 0.9, g: 0.06, a: 30, d: 950, dest: G.S, pan: pan });
        noise(t, { pink: true, fty: 'bandpass', ff: 160, ff1: 920, fft: 0.55, ff2: 140, fft2: 0.55, q: 3.5, g: 0.11, a: 40, d: 900, dest: G.S, pan: pan });
      },
      emp: function (t, o, pan) {
        tone(t, { f: 150, f1: 32, ft: 0.65, g: 0.32, a: 2, d: 850, dest: G.S, pan: pan });
        noise(t, { fty: 'bandpass', ff: 3800, ff1: 280, fft: 0.48, q: 2.2, g: 0.14, a: 2, d: 520, dest: G.S, pan: pan });
        bell(t + 0.03, K(4, 5), { g: 0.05, tau: 0.25, dest: G.S });
      },
      slingshot: function (t, o, pan) {
        const f = K(0, 4);
        tone(t, { type: 'triangle', f: f, f1: f * 1.9, ft: 0.24, fty: 'lowpass', ff: 2200, g: 0.055, a: 4, d: 260, dest: G.W, pan: pan });
        noise(t, { pink: true, fty: 'bandpass', ff: 800, ff1: 2400, fft: 0.22, q: 3, g: 0.04, a: 5, d: 200, dest: G.W, pan: pan });
      },
      relay: function (t, o, pan) {
        const idx = clamp(Math.round(num(o.i, 0)), 0, 4);
        bell(t, K(CH[idx], 6), { g: 0.058, tau: 0.22, dest: G.S, pan: pan });
        bell(t + 0.05, K(CH[idx + 1], 6), { g: 0.048, tau: 0.28, dest: G.S, pan: pan });
      },
    };

    const MIN = { hover: 60, tick: 35, click: 40, toggle: 120, lock: 120, open: 200, close: 200, whoosh: 250, warp: 800, arrive: 800, success: 400, error: 300, type: 30, boot: 45, ping: 300, scan: 300, transmit: 1000, chime: 70, shoot: 70, hit: 50, explode: 120, pickup: 80, gameover: 1500, discover: 350, gravity: 450, emp: 400, slingshot: 90, relay: 70 };
    const PRIO = { hover: 0, tick: 0, type: 0, boot: 0, warp: 2, arrive: 2, explode: 2, gameover: 2, discover: 2, gravity: 2, emp: 2 };
    const lastAt = Object.create(null);
    function play(name, opts) {
      if (!sfxOn || !audible() || !Object.prototype.hasOwnProperty.call(R, name)) return;
      const n = msNow();
      if (n - (lastAt[name] || 0) < MIN[name]) return;
      const pr = PRIO[name] === undefined ? 1 : PRIO[name];
      if ((live >= MAXV && pr < 2) || (live >= MAXV - 4 && pr === 0)) return;
      lastAt[name] = n;
      const o = opts || {};
      const pan = typeof o.x === 'number' && isFinite(o.x) ? clamp((o.x / Math.max(1, window.innerWidth) * 2 - 1) * 0.6, -0.6, 0.6) : 0;
      V.g = rnd(0.9, 1.1); V.d = rnd(0.92, 1.08); V.c = rnd(-1, 1) * (pr === 0 ? 6 : 12);
      try { R[name](ctx.currentTime + 0.005, o, pan); } catch (e) { /* a dropped sound is better than a broken page */ }
      V.g = 1; V.d = 1; V.c = 0;
    }


    /* ───────────────────────── public API ───────────────────────── */
    GK.audio = {
      get ready() { return audible(); },
      play: play,
      setMusic: setMusic,
      setSfx: setSfx,
      toggleMusic: function () { setMusic(!musicOn); },
      toggleSfx: function () { setSfx(!sfxOn); },
      isMusicOn: function () { return musicOn; },
      isSfxOn: function () { return sfxOn; },
      spectrum: function () { return audible() ? readFreq() : null; },
      wave: function () { return audible() ? readWave() : null; },
    };
    const LEGACY = { pop: 'toggle', swoosh: 'whoosh', click_soft: 'type' };
    window.SoundFX = { play: function (name, opts) { play(Object.prototype.hasOwnProperty.call(LEGACY, name) ? LEGACY[name] : name, opts); } };

    if (!dead) setTimeout(function () { if (!raw.job) prepareIR(48000); }, 600);
    GK.ready(emitState);
  });
})();
