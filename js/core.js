/* ═══════════════════════════════════════════════════════════════
   VOYAGER · core.js
   Shared runtime for every module: namespace, environment, event
   bus, single rAF ticker, scroll + sector tracking, pointer, warp
   envelope, prefs, utilities and the module registry.

   Classic script on purpose (no ES modules, no fetch) so the site
   also runs when index.html is opened straight from disk.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const GK = (window.GK = window.GK || {});
  const doc = document;
  const root = doc.documentElement;

  /* ───────────────────────── utilities ───────────────────────── */
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  /* frame-rate independent smoothing: bigger lambda = snappier */
  const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
  const map = (v, a, b, c, d) => c + ((d - c) * (v - a)) / (b - a);
  const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const qs = (sel, ctx) => (ctx || doc).querySelector(sel);
  const qsa = (sel, ctx) => Array.prototype.slice.call((ctx || doc).querySelectorAll(sel));
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* el('div', { class: 'x', 'data-a': 1, text: 'hi' }, [children]) */
  function el(tag, attrs, children) {
    const node = doc.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach(c => { if (c != null) node.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return node;
  }

  function debounce(fn, ms = 150) {
    let t = 0;
    return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms); };
  }
  function throttle(fn, ms = 100) {
    let last = 0;
    return function () { const now = performance.now(); if (now - last >= ms) { last = now; fn.apply(this, arguments); } };
  }

  /* cb(isVisible, entry) whenever el enters/leaves the (padded) viewport. Returns a disposer. */
  function onVisible(target, cb, opts) {
    if (!target) return () => {};
    if (!('IntersectionObserver' in window)) { cb(true); return () => {}; }
    const io = new IntersectionObserver(entries => entries.forEach(e => cb(e.isIntersecting, e)), Object.assign({ rootMargin: '120px 0px' }, opts || {}));
    io.observe(target);
    return () => io.disconnect();
  }

  /* Size a canvas' backing store to its CSS box. Returns CSS + pixel dims. */
  function fitCanvas(canvas, maxDpr = 2, scale = 1) {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr) * scale;
    const pw = Math.max(1, Math.round(r.width * dpr));
    const ph = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    return { w: r.width, h: r.height, dpr, pw, ph };
  }

  const isTyping = e => {
    const t = e && e.target;
    if (!t || !t.tagName) return false;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
  };

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('gk5.' + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem('gk5.' + key, JSON.stringify(value)); } catch (e) { /* private mode / file:// quirks */ } },
  };

  GK.util = { clamp, lerp, damp, map, smoothstep, rand, pick, qs, qsa, pad, esc, el, debounce, throttle, onVisible, fitCanvas, isTyping, hexToRgb, easeOutCubic, easeInOutCubic, easeOutExpo };
  GK.store = store;

  /* ───────────────────────── environment ───────────────────────── */
  const mq = q => (window.matchMedia ? window.matchMedia(q) : { matches: false });
  /* The backdrop is GPU-bound, so CPU cores / RAM say little about it: read the
     renderer name too. 'soft' = software rasteriser, 'weak' = integrated / mobile
     GPU, 'strong' = discrete; anything unrecognised is 'unknown' and left to the
     cosmos frame-time governor. */
  function gpuClass(name) {
    const r = String(name || '').toLowerCase();
    if (!r) return 'unknown';
    if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(r)) return 'soft';
    if (/nvidia|geforce|quadro|radeon rx|radeon pro|intel\(r\) arc|apple m\d/.test(r)) return 'strong';
    if (/intel|mali|adreno|powervr|vivante|videocore|radeon\(tm\) graphics|radeon graphics|radeon vega|vega \d/.test(r)) return 'weak';
    return 'unknown';
  }
  function detectWebGL() {
    try {
      const c = doc.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) return { ok: false, gpu: 'unknown' };
      let name = '';
      try {
        name = String(gl.getParameter(gl.RENDERER) || '');
        if (!name || /^webkit webgl$/i.test(name)) {
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          if (dbg) name = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
        }
      } catch (e) { name = ''; }
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return { ok: true, gpu: gpuClass(name) };
    } catch (e) { return { ok: false, gpu: 'unknown' }; }
  }
  const gl0 = detectWebGL();
  const env = (GK.env = {
    fine: mq('(hover: hover) and (pointer: fine)').matches,
    touch: 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0,
    reduced: mq('(prefers-reduced-motion: reduce)').matches,
    mobile: window.innerWidth < 760,
    webgl: gl0.ok,
    gpu: gl0.gpu,
    lowPower: (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4,
    lite: false,        // light rendering path (phones, weak GPUs); cosmos may switch it at runtime
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    w: window.innerWidth,
    h: window.innerHeight,
  });
  env.lite = !env.fine || env.lowPower || env.gpu === 'weak' || env.gpu === 'soft';
  root.classList.add('js', env.fine ? 'is-fine' : 'is-coarse');
  if (env.touch) root.classList.add('is-touch');
  if (env.reduced) root.classList.add('is-reduced');
  if (!env.webgl) root.classList.add('no-webgl');
  if (env.mobile) root.classList.add('is-mobile');
  if (env.lite) root.classList.add('is-lite');

  /* ───────────────────────── sectors ─────────────────────────
     The journey. `id` is the section element id (kept from v4 so
     old #links still work), `key` is the machine name, `name` the
     in-fiction sector name, `label` the plain navigation label.
     a/b are the two nebula colours for that sector; `dim` is how
     much the backdrop is darkened for legibility (0 = none). */
  const SECTORS = (GK.SECTORS = [
    { id: 'p0',        key: 'origin',         name: 'Origin',         label: 'Hero',        a: '#6C63FF', b: '#FFB454', dim: 0.15 },
    { id: 'p1',        key: 'signal',         name: 'Signal',         label: 'Role',        a: '#FFB454', b: '#FF6B4A', dim: 0.62 },
    { id: 'p2',        key: 'crew',           name: 'Crew',           label: 'About',       a: '#00E5FF', b: '#6C63FF', dim: 0.60 },
    { id: 'p2-edu',    key: 'trajectory',     name: 'Trajectory',     label: 'Education',   a: '#3A8DFF', b: '#00E5FF', dim: 0.60 },
    { id: 'p3',        key: 'missions',       name: 'Missions',       label: 'Work',        a: '#6C63FF', b: '#C04DFF', dim: 0.68 },
    { id: 'p3-5',      key: 'telemetry',      name: 'Telemetry',      label: 'Stats',       a: '#3DDC84', b: '#00E5FF', dim: 0.55 },
    { id: 'p3-intern', key: 'deployments',    name: 'Deployments',    label: 'Internships', a: '#FFB454', b: '#FF7A45', dim: 0.60 },
    { id: 'p4',        key: 'systems',        name: 'Systems',        label: 'Stack',       a: '#6C63FF', b: '#00E5FF', dim: 0.60 },
    { id: 'p5',        key: 'constellations', name: 'Constellations', label: 'Certs',       a: '#00E5FF', b: '#9FB4FF', dim: 0.60 },
    { id: 'p6',        key: 'transmission',   name: 'Transmission',   label: 'Contact',     a: '#FFB454', b: '#FF5E7A', dim: 0.50 },
  ]);
  SECTORS.forEach((s, i) => { s.index = i; s.rgbA = hexToRgb(s.a); s.rgbB = hexToRgb(s.b); });

  /* ───────────────────────── shared state ─────────────────────────
     Read-only for modules (core owns the writes unless noted). */
  const state = (GK.state = {
    time: 0,            // seconds since boot (pauses while tab hidden)
    dt: 0.016,          // last frame delta, clamped to 0.05
    frame: 0,
    scrollY: 0,
    scrollMax: 1,
    progress: 0,        // 0..1 through the whole document
    velocity: 0,        // smoothed scroll velocity, px/s, signed
    speed: 0,           // 0..1 normalised |velocity|
    warp: 0,            // 0..1 programmatic hyperspace envelope (GK.warp)
    flow: 0,            // max(speed, warp): "how fast are we flying"
    sector: 0,          // active sector index 0..9
    sectorT: 0,         // 0..1 progress through the active sector
    sectorF: 0,         // continuous sector position, e.g. 2.35
    wormhole: 0,        // 0..1 progress through the closing wormhole section
    palette: { a: SECTORS[0].rgbA.slice(), b: SECTORS[0].rgbB.slice(), dim: SECTORS[0].dim }, // CPU cross-faded sector colours
    pointer: { x: env.w / 2, y: env.h / 2, nx: 0, ny: 0, sx: 0, sy: 0, down: false, active: false }, // px, normalised -1..1 (y down), smoothed
    audio: { level: 0, bass: 0, mid: 0, high: 0 }, // written by audio.js each frame
    quality: env.mobile || env.gpu === 'soft' ? 0 : env.lite ? 1 : 2,  // 0 low · 1 medium · 2 high (cosmos may lower or raise it)
    entered: false,     // true once the visitor pressed ENGAGE on the loader
    modalOpen: false,   // written by hud.js
    paused: false,      // true while an overlay (e.g. mini-game) wants background work idle
  });

  /* ───────────────────────── event bus ───────────────────────── */
  const listeners = Object.create(null);
  const bus = (GK.bus = {
    on(evt, fn) { (listeners[evt] || (listeners[evt] = [])).push(fn); return () => bus.off(evt, fn); },
    once(evt, fn) { const off = bus.on(evt, d => { off(); fn(d); }); return off; },
    off(evt, fn) { const l = listeners[evt]; if (!l) return; const i = l.indexOf(fn); if (i > -1) l.splice(i, 1); },
    emit(evt, data) {
      const l = listeners[evt];
      if (!l) return;
      l.slice().forEach(fn => { try { fn(data); } catch (e) { console.error('[GK] listener for "' + evt + '" failed', e); } });
    },
  });

  /* ───────────────────────── scroll + sectors ───────────────────────── */
  let panels = [];        // [{ el, index, top, height }]
  let wormholeBox = null; // { top, height }
  let skipVelocity = false;
  let prevY = window.scrollY;

  function measure() {
    const y = window.scrollY;
    panels = qsa('.panel[data-sector]').map(node => {
      const r = node.getBoundingClientRect();
      return { el: node, index: parseInt(node.dataset.sector, 10) || 0, top: r.top + y, height: r.height };
    }).sort((a, b) => a.top - b.top);
    const wh = doc.getElementById('wormhole');
    if (wh) { const r = wh.getBoundingClientRect(); wormholeBox = { top: r.top + y, height: Math.max(1, r.height) }; } else wormholeBox = null;
    state.scrollMax = Math.max(1, root.scrollHeight - window.innerHeight);
    bus.emit('measure');
  }
  const scheduleMeasure = (() => { let q = false; return () => { if (q) return; q = true; requestAnimationFrame(() => { q = false; measure(); }); }; })();

  function applySector(index, prev) {
    const s = SECTORS[index];
    if (!s) return;
    root.dataset.at = s.key; // <html data-at="origin">
    root.style.setProperty('--sector-a', s.a);
    root.style.setProperty('--sector-b', s.b);
    root.style.setProperty('--sector-a-rgb', s.rgbA.map(v => Math.round(v * 255)).join(', '));
    root.style.setProperty('--sector-b-rgb', s.rgbB.map(v => Math.round(v * 255)).join(', '));
    /* same hue lifted toward white so it stays readable as small text */
    root.style.setProperty('--sector-ink', 'rgb(' + s.rgbA.map(v => Math.round((v + (1 - v) * 0.42) * 255)).join(', ') + ')');
    bus.emit('sector', { index, prev, sector: s, id: s.id });
  }

  function updateScroll(dt) {
    const y = window.scrollY;
    const raw = skipVelocity ? 0 : (y - prevY) / Math.max(dt, 0.001);
    skipVelocity = false;
    prevY = y;
    state.scrollY = y;
    state.velocity = damp(state.velocity, raw, 10, dt);
    state.speed = clamp(Math.abs(state.velocity) / 3200);
    state.progress = clamp(y / state.scrollMax);

    if (panels.length) {
      const probe = y + window.innerHeight * 0.5;
      let cur = panels[0], next = null;
      for (let i = 0; i < panels.length; i++) {
        if (panels[i].top <= probe) { cur = panels[i]; next = panels[i + 1] || null; } else break;
      }
      const span = next ? next.top - cur.top : cur.height;
      const t = clamp((probe - cur.top) / Math.max(1, span));
      state.sectorT = t;
      state.sectorF = cur.index + (next ? t : 0);
      if (cur.index !== state.sector || state.frame === 0) {
        const prev = state.frame === 0 ? -1 : state.sector;
        state.sector = cur.index;
        applySector(cur.index, prev);
      }
    }
    state.wormhole = wormholeBox ? clamp((y + window.innerHeight - wormholeBox.top) / wormholeBox.height) : 0;

    /* CPU cross-fade of the sector palette so shaders/canvases get smooth colour */
    const target = SECTORS[state.sector], p = state.palette;
    for (let i = 0; i < 3; i++) {
      p.a[i] = damp(p.a[i], target.rgbA[i], 2.2, dt);
      p.b[i] = damp(p.b[i], target.rgbB[i], 2.2, dt);
    }
    p.dim = damp(p.dim, target.dim, 2.2, dt);
  }

  GK.scroll = {
    measure,
    /* instant jump that does not register as scroll velocity */
    teleport(y) { skipVelocity = true; window.scrollTo(0, y); prevY = window.scrollY; state.scrollY = prevY; },
    /* document Y of a sector (by index or element id); -1 if unknown */
    topOf(target) {
      const p = panels.find(pn => (typeof target === 'number' ? pn.index === target : pn.el.id === target));
      if (p) return p.top;
      const node = typeof target === 'string' ? doc.getElementById(target) : null;
      return node ? node.getBoundingClientRect().top + window.scrollY : -1;
    },
    indexOf(id) { const s = SECTORS.find(sec => sec.id === id || sec.key === id); return s ? s.index : -1; },
    panels: () => panels,
  };

  /* ───────────────────────── pointer ───────────────────────── */
  const ptr = state.pointer;
  window.addEventListener('pointermove', e => {
    ptr.x = e.clientX; ptr.y = e.clientY;
    ptr.nx = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.ny = (e.clientY / window.innerHeight) * 2 - 1;
    ptr.active = true;
  }, { passive: true });
  window.addEventListener('pointerdown', () => { ptr.down = true; }, { passive: true });
  window.addEventListener('pointerup', () => { ptr.down = false; }, { passive: true });
  window.addEventListener('pointercancel', () => { ptr.down = false; }, { passive: true });

  /* ───────────────────────── warp envelope ─────────────────────────
     GK.warp(strength 0..1, durationMs) → drives state.warp, toggles
     html.is-warping and emits warp:start / warp:end. Visuals (cosmos),
     audio and HUD all key off this single source. */
  let warpJob = null;
  GK.warp = function (strength = 1, duration = 1200) {
    warpJob = { t0: state.time, strength: clamp(strength), dur: Math.max(0.2, duration / 1000) };
    root.classList.add('is-warping');
    bus.emit('warp:start', { strength: warpJob.strength, duration });
  };
  function updateWarp() {
    if (!warpJob) { state.warp = 0; }
    else {
      const p = (state.time - warpJob.t0) / warpJob.dur;
      if (p >= 1) {
        warpJob = null; state.warp = 0;
        root.classList.remove('is-warping');
        bus.emit('warp:end');
      } else {
        const a = 0.3;
        state.warp = warpJob.strength * (p < a ? easeOutCubic(p / a) : 1 - easeInOutCubic((p - a) / (1 - a)));
      }
    }
    state.flow = env.reduced ? 0 : Math.max(state.speed, state.warp);
  }

  /* ───────────────────────── ticker ─────────────────────────
     One requestAnimationFrame for the whole site. Tasks run in
     ascending `order` (audio analysis −10, cosmos 0, UI 10+). */
  const tasks = [];
  let rafId = 0, last = 0, running = false;
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    state.dt = dt;
    state.time += dt;
    updateScroll(dt);
    updateWarp();
    ptr.sx = damp(ptr.sx, ptr.nx, 6, dt);
    ptr.sy = damp(ptr.sy, ptr.ny, 6, dt);
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      try { t.fn(state, dt); } catch (e) {
        console.error('[GK] ticker task failed and was removed', e);
        tasks.splice(i--, 1);
      }
    }
    state.frame++;
  }
  function start() { if (running) return; running = true; last = performance.now(); rafId = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(rafId); }
  GK.ticker = {
    add(fn, order = 10) {
      const t = { fn, order };
      tasks.push(t);
      tasks.sort((a, b) => a.order - b.order);
      return () => { const i = tasks.indexOf(t); if (i > -1) tasks.splice(i, 1); };
    },
    start, stop,
  };
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) stop(); else { skipVelocity = true; start(); }
    bus.emit('visibility', { hidden: doc.hidden });
  });

  /* ───────────────────────── cross-module proxies ─────────────────────────
     Safe no-op defaults so any module can call these without checking
     who (if anyone) implements them. Owners overwrite them at init. */
  GK.sfx = function (name, opts) { return GK.audio && GK.audio.play ? GK.audio.play(name, opts) : undefined; }; // audio.js
  GK.navTo = function (target) {                                    // flow.js replaces with the cinematic version
    const y = GK.scroll.topOf(typeof target === 'number' ? target : GK.scroll.indexOf(target) > -1 ? GK.scroll.indexOf(target) : target);
    if (y >= 0) window.scrollTo({ top: y, behavior: env.reduced ? 'auto' : 'smooth' });
  };
  GK.modal = { open() {}, close() {}, isOpen: false };            // flow.js
  GK.toast = function (msg) { console.info('[GK]', msg); };         // hud.js
  GK.palette = { open() {}, close() {}, toggle() {}, isOpen: false }; // flow.js (command palette)
  GK.scan = function () {};                                         // fx.js
  GK.openGame = function () {};                                     // extras.js
  GK.openSecret = function () {};
  GK.openLog = function () {};
  GK.unlockObjective = function () {};                                   // extras.js

  /* ───────────────────────── module registry + boot ───────────────────────── */
  const modules = [];
  let booted = false;
  GK.register = function (name, init) {
    modules.push({ name, init });
    if (booted) runModule(modules[modules.length - 1]);
  };
  function runModule(m) {
    try { m.init(GK); m.ok = true; }
    catch (e) { m.ok = false; console.error('[GK] module "' + m.name + '" failed to initialise', e); }
  }
  GK.ready = function (fn) { if (booted) fn(GK); else bus.once('boot', () => fn(GK)); };

  GK.boot = function () {
    if (booted) return;
    measure();
    modules.forEach(runModule);
    booted = true;
    root.classList.add('is-booted');
    measure();
    start();
    bus.emit('boot');

    window.addEventListener('resize', debounce(() => {
      env.w = window.innerWidth; env.h = window.innerHeight;
      env.mobile = env.w < 760;
      root.classList.toggle('is-mobile', env.mobile);
      measure();
      bus.emit('resize', { w: env.w, h: env.h });
    }, 140));
    window.addEventListener('load', scheduleMeasure);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(scheduleMeasure).catch(() => {});
    const main = doc.getElementById('story');
    if (main && 'ResizeObserver' in window) new ResizeObserver(scheduleMeasure).observe(main);
  };

  bus.on('enter', () => { state.entered = true; root.classList.add('is-entered'); root.classList.remove('is-loading'); });
  root.classList.add('is-loading');
})();
