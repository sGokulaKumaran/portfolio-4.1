/* ═══════════════════════════════════════════════════════════════
   VOYAGER 01 · voyage-d.js
   Sector 7 · Systems         — an orrery of skills + discipline cards
   Sector 8 · Constellations  — a playable certificate constellation
   Sector 9 · Transmission    — contact details + transmission console

   Upgrades in 6.0:
   - Desktop mouse + touch planet click pinning in Systems Orrery
   - Lagrange dust belt & harmonic resonance vectors on active orbit
   - Live Harmonic Star Counter (0/6 Rung) on Constellations canvas
   - Exact bounding-box pointer coordinates on all interactive canvases
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const GK = window.GK;
  if (!GK || typeof GK.register !== 'function') return;

  GK.register('voyage-d', function init(GK) {
    const U = GK.util, env = GK.env, state = GK.state, bus = GK.bus;
    const data = GK.data || {};
    const { clamp, esc, qsa } = U;
    const doc = document;
    const byId = id => doc.getElementById(id);
    const TAU = Math.PI * 2;
    const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

    const rootStyle = getComputedStyle(doc.documentElement);
    const to255 = hex => { const c = U.hexToRgb(hex); return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)]; };
    const tokenRgb = (name, fallback) => { const v = rootStyle.getPropertyValue(name).trim(); return to255(HEX.test(v) ? v : fallback); };
    const tokenFont = (name, fallback) => rootStyle.getPropertyValue(name).trim() || fallback;
    const INK = tokenRgb('--ink', '#F3F1EA');
    const BG = tokenRgb('--bg', '#05060A');
    const CYAN = tokenRgb('--cyan', '#00E5FF');
    const GREEN = tokenRgb('--green', '#3DDC84');
    const WHITE = [255, 255, 255];
    const MONO = tokenFont('--font-mono', 'ui-monospace, monospace');
    const DISPLAY = tokenFont('--font-display', 'system-ui, sans-serif');
    const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a <= 0 ? 0 : a >= 1 ? 1 : a.toFixed(3)) + ')';
    const pal = (which, out) => { const p = state.palette[which]; out[0] = (p[0] * 255) | 0; out[1] = (p[1] * 255) | 0; out[2] = (p[2] * 255) | 0; return out; };
    const ease = (cur, target, lambda, dt) => (env.reduced ? target : U.damp(cur, target, lambda, dt));

    const ICON = {
      game: '<rect x="2.5" y="7" width="19" height="10.5" rx="5.25"/><path d="M7.75 10.5v3.5M6 12.25h3.5"/><circle cx="15.4" cy="13.5" r="0.9"/><circle cx="18" cy="11" r="0.9"/>',
      web: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9h18"/><path d="m10 12.5-2 2 2 2M14 12.5l2 2-2 2"/>',
      ai: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 3.5V7M14 3.5V7M10 17v3.5M14 17v3.5M3.5 10H7M3.5 14H7M17 10h3.5M17 14h3.5"/><circle cx="12" cy="12" r="1.6"/>',
      procgen: '<path d="M3 8c3-3 6 3 9 0s6-3 9 0"/><path d="M3 12.5c3-3 6 3 9 0s6-3 9 0"/><path d="M3 17c3-3 6 3 9 0s6-3 9 0"/>',
      orbit: '<circle cx="12" cy="12" r="2.5"/><ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-24 12 12)"/>',
      arrow: '<path d="M7 17 17 7M9 7h8v8"/>',
      GitHub: '<circle cx="6.5" cy="5.5" r="2"/><circle cx="6.5" cy="18.5" r="2"/><circle cx="17.5" cy="8.5" r="2"/><path d="M6.5 7.5v9M17.5 10.5a6 6 0 0 1-6 6h-5"/>',
      LinkedIn: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 10.5V16M8 7.6v.1M12 16v-5.5M12 13a2.25 2.25 0 0 1 4.5 0v3"/>',
      Instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.75"/><path d="M17 7v.1"/>',
    };
    const svg = (name, cls) => '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICON[name] || ICON.orbit) + '</svg>';

    function makeStage(canvas, onLayout) {
      let ctx = null;
      try { ctx = canvas.getContext('2d'); } catch (e) { ctx = null; }
      if (!ctx) return null;
      const s = { canvas, ctx, w: 0, h: 0, dpr: 1, visible: false, dirty: true };
      s.fit = function () {
        const d = U.fitCanvas(canvas, GK.perf.dpr());
        if (d.w < 2 || d.h < 2) return;
        s.w = d.w; s.h = d.h; s.dpr = d.dpr; s.dirty = true;
        if (onLayout) onLayout(s);
      };
      s.localPos = function (e) {
        const r = canvas.getBoundingClientRect();
        const sx = r.width > 0 ? s.w / r.width : 1;
        const sy = r.height > 0 ? s.h / r.height : 1;
        return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
      };
      s.run = function (draw) {
        U.onVisible(canvas, v => { s.visible = v; if (v) s.fit(); });
        bus.on('resize', s.fit);
        bus.on('perf', s.fit);
        if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(s.fit).catch(() => {});
        let acc = 0;
        GK.ticker.add((st, dt) => {
          if (!s.visible || !s.w) return;
          if (env.reduced && !s.dirty) return;
          /* Balanced / Eco: ~30 fps while idle, full rate while the visitor drags/presses */
          const idleGap = GK.perf.idleGap();
          if (idleGap && !s.dirty && !st.pointer.down) {
            acc += dt;
            if (acc < idleGap) return;
            dt = Math.min(acc, 0.1);
          }
          acc = 0;
          s.dirty = false;
          ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
          ctx.clearRect(0, 0, s.w, s.h);
          draw(st, dt);
        }, 14);
        s.fit();
      };
      return s;
    }

    /* ═══════════════════════════════════════════════════════════
       SECTOR 7 · SYSTEMS — orrery
       ═══════════════════════════════════════════════════════════ */
    function initStack() {
      const list = Array.isArray(data.disciplines) ? data.disciplines : [];
      if (!list.length) return;
      const n = list.length;
      const cardsHost = byId('stackCards'), canvas = byId('stackCanvas'), proxyHost = byId('stackProxy');
      const readout = byId('stackReadout'), hint = byId('stackHint');
      const readoutText = readout ? readout.querySelector('.stack-readout-text') : null;
      const colorOf = d => (HEX.test(d.color || '') ? d.color : '#6C63FF');
      const skillsOf = d => (Array.isArray(d.skills) ? d.skills : []);

      let cards = [];
      if (cardsHost) {
        cardsHost.innerHTML = list.map((d, k) =>
          '<article class="sys-card glass" data-tilt="4" data-spot data-orbit="' + k + '" style="--c:' + colorOf(d) + '">' +
            '<div class="sys-top"><span class="sys-num">' + esc(d.num || U.pad(k + 1)) + '</span><span class="sys-icon">' + svg(ICON[d.id] ? d.id : 'orbit') + '</span></div>' +
            '<h3 class="sys-title">' + esc(d.title) + '</h3>' +
            '<p class="sys-desc">' + esc(d.desc) + '</p>' +
            '<ul class="chips sys-skills" aria-label="' + esc(d.title) + ' skills">' + skillsOf(d).map(s => '<li class="chip">' + esc(s) + '</li>').join('') + '</ul>' +
          '</article>').join('');
        cards = qsa('.sys-card', cardsHost);
        GK.scan(cardsHost);
      }

      const foundations = Array.isArray(data.foundations) ? data.foundations : [];
      let proxies = [];
      if (proxyHost) {
        proxyHost.innerHTML = list.map((d, k) =>
          '<li><button type="button" data-orbit="' + k + '" aria-pressed="false" data-sfx-hover="none">' + esc(d.title + ': ' + skillsOf(d).join(', ')) + '</button></li>').join('') +
          (foundations.length ? '<li>' + esc('Core foundations: ' + foundations.join(', ')) + '</li>' : '');
        proxies = qsa('button', proxyHost);
      }

      let hoverPlanet = null;
      let hoverCard = -1;
      let focusProxy = -1;
      let pin = null;
      let cycle = 0;
      let lastReadout = '';
      let stage = null;
      const activeOrbit = () => (hoverPlanet ? hoverPlanet.k : hoverCard > -1 ? hoverCard : focusProxy > -1 ? focusProxy : pin ? pin.k : -1);
      const activePlanet = () => (hoverPlanet || (pin && pin.j > -1 ? pin : null));

      function paintReadout() {
        if (!readout || !readoutText) return;
        const act = activeOrbit(), k = act > -1 ? act : cycle, d = list[k], p = activePlanet();
        if (!d) return;
        const skill = p && p.k === k ? skillsOf(d)[p.j] || '' : '';
        const locked = pin && pin.k === k ? ' [LOCKED]' : '';
        const key = k + '|' + skill + '|' + locked;
        if (key === lastReadout) return;
        lastReadout = key;
        readout.style.setProperty('--c', colorOf(d));
        readoutText.textContent = (d.num || U.pad(k + 1)) + ' · ' + d.title + (skill ? ' · ' + skill : '') + locked;
      }
      function sync() {
        const act = activeOrbit();
        cards.forEach((c, k) => c.classList.toggle('is-lit', k === act));
        proxies.forEach((b, k) => b.setAttribute('aria-pressed', pin && pin.j < 0 && pin.k === k ? 'true' : 'false'));
        paintReadout();
        if (stage) stage.dirty = true;
      }

      cards.forEach((card, k) => {
        card.addEventListener('pointerenter', e => { if (e.pointerType === 'touch') return; hoverCard = k; sync(); });
        card.addEventListener('pointerleave', () => { if (hoverCard === k) { hoverCard = -1; sync(); } });
        card.addEventListener('click', () => {
          pin = pin && pin.k === k ? null : { k, j: -1, until: state.time + 12 };
          GK.sfx('chime', { i: k });
          sync();
        });
      });
      proxies.forEach((b, k) => {
        b.addEventListener('focus', () => { focusProxy = k; sync(); });
        b.addEventListener('blur', () => { if (focusProxy === k) { focusProxy = -1; sync(); } });
        b.addEventListener('click', () => { pin = pin && pin.j < 0 && pin.k === k ? null : { k, j: -1, until: Infinity }; sync(); });
      });
      if (hint) hint.textContent = env.fine ? 'Drag to spin · hover or click a planet' : 'Drag to spin · tap a planet';
      paintReadout();

      if (!canvas) return;
      const G = { cx: 0, cy: 0, R: 60, ratio: 0.4, small: false, pr: 4, core: 19, font: 11, moonR: 40 };
      let widths = Object.create(null);
      stage = makeStage(canvas, function layout(s) {
        const small = s.w < 620;
        G.small = small;
        G.cx = s.w / 2; G.cy = s.h / 2;
        G.R = Math.max(60, Math.min(s.w / 2 - (small ? 14 : 84), (s.h / 2 - 48) / 0.34));
        G.ratio = clamp((s.h / 2 - 48) / G.R, 0.34, 0.84);
        G.pr = small ? 3 : 4; G.core = small ? 13 : 19; G.font = small ? 10 : 11;
        G.moonR = Math.max(G.core + 15, G.R * 0.17);
        widths = Object.create(null);
      });
      if (!stage) return;

      const TILTS = [-0.1, 0.07, -0.05, 0.11], SQUASH = [1, 0.94, 1.05, 0.98];
      const orbits = list.map((d, k) => ({
        k, color: to255(colorOf(d)),
        f: n > 1 ? k / (n - 1) : 0.6,
        period: n > 1 ? 40 + (50 * k) / (n - 1) : 60,
        tilt: TILTS[k % 4], squash: SQUASH[k % 4], phase: k * 1.37,
        R: 0, ry: 0, rot: 0, bright: 0, dim: 1, lab: 0,
        planets: skillsOf(d).map(name => ({ name: String(name), x: -999, y: -999, r: 0, a: 0, depth: 0, grow: 0 })),
      }));
      /* Lagrange asteroid dust belt */
      const belt = Array.from({ length: 48 }, (_, i) => ({
        a0: (i / 48) * TAU + ((i * 1.618) % 0.2),
        rf: 0.62 + ((i * 0.38196) % 0.08) - 0.04,
        sz: (i % 3 === 0) ? 1.5 : 1.0,
      }));
      const moons = foundations.map(name => ({ name: String(name), x: 0, y: 0, depth: 0 }));
      const initials = (data.person && data.person.initials) || 'GK';
      const SCRUB = 30;
      let sim = 12, ts = 1, vel = 0, spd = 1, cycleT = 0, moonDim = 1;
      const drag = { id: -1, on: false, x: 0, x0: 0, y0: 0, t: 0, v: 0 };
      const pc = [0, 0, 0];

      function drawPlanet(ctx, o, p, tl) {
        const alpha = (0.6 + 0.4 * (p.depth * 0.5 + 0.5)) * o.dim;
        if (o.bright > 0.15) {
          /* harmonic spoke to core */
          ctx.lineWidth = 1;
          ctx.strokeStyle = rgba(o.color, 0.14 * o.bright * o.dim);
          ctx.beginPath();
          ctx.moveTo(G.cx, G.cy);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        if (tl > 0.01 || tl < -0.01) {
          ctx.lineWidth = 1.5;
          for (let i = 0; i < 3; i++) {
            const a0 = p.a - (tl * (3 - i)) / 3, a1 = p.a - (tl * (2 - i)) / 3;
            ctx.strokeStyle = rgba(o.color, alpha * (0.12 + 0.15 * i));
            ctx.beginPath(); ctx.ellipse(G.cx, G.cy, o.R, o.ry, o.rot, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
          }
        }
        ctx.fillStyle = rgba(o.color, alpha);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(INK, 0.5 * alpha);
        ctx.beginPath(); ctx.arc(p.x - p.r * 0.28, p.y - p.r * 0.28, p.r * 0.36, 0, TAU); ctx.fill();
        if (p.grow > 0.02) {
          ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(o.color, 0.8 * p.grow);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4 + 2.5 * p.grow, 0, TAU); ctx.stroke();
        }
      }
      function drawMoon(ctx, m) {
        ctx.fillStyle = rgba(INK, (0.6 + 0.3 * (m.depth * 0.5 + 0.5)) * moonDim);
        ctx.beginPath(); ctx.arc(m.x, m.y, G.small ? 1.8 : 2.2, 0, TAU); ctx.fill();
      }
      function drawCore(ctx, st) {
        const cx = G.cx, cy = G.cy, r = G.core, pulse = env.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(st.time * 1.3);
        pal('a', pc);
        const halo = r * 4.4, g = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, halo);
        g.addColorStop(0, rgba(pc, 0.42 + 0.08 * pulse)); g.addColorStop(0.4, rgba(pc, 0.12)); g.addColorStop(1, rgba(pc, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, halo, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(INK, 1); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = rgba(INK, 0.3 + 0.2 * pulse);
        ctx.beginPath(); ctx.arc(cx, cy, r + 4 + pulse * 1.5, 0, TAU); ctx.stroke();
        ctx.fillStyle = rgba(BG, 1);
        ctx.font = '700 ' + (G.small ? 11 : 14) + 'px ' + DISPLAY;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(initials, cx, cy + 0.5);
      }
      function drawLabel(ctx, text, x, y, r, color, alpha, strong) {
        const tw = widths[text] || (widths[text] = ctx.measureText(text).width);
        const bw = tw + 12, bh = G.font + 9, w = stage.w, h = stage.h;
        let bx = x >= G.cx ? x + r + 8 : x - r - 8 - bw;
        if (bx + bw > w - 3) bx = x - r - 8 - bw; else if (bx < 3) bx = x + r + 8;
        bx = clamp(bx, 3, Math.max(3, w - bw - 3));
        const by = clamp(y - bh / 2, 3, Math.max(3, h - bh - 3));
        ctx.fillStyle = rgba(BG, 0.84 * alpha);
        ctx.fillRect(bx, by, bw, bh);
        ctx.lineWidth = 1; ctx.strokeStyle = rgba(color, (strong ? 0.95 : 0.5) * alpha);
        ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        ctx.fillStyle = rgba(INK, alpha);
        ctx.fillText(text, bx + 6, by + bh / 2 + 0.5);
      }

      stage.run(function draw(st, dt) {
        const ctx = stage.ctx, cx = G.cx, cy = G.cy, reduced = env.reduced;
        if (pin && pin.until < st.time) { pin = null; sync(); }
        const act = activeOrbit(), ap = activePlanet();

        ts = ease(ts, ap ? 0.1 : 1, 5, dt);
        if (reduced) spd = 0;
        else {
          if (drag.on) drag.v *= Math.exp(-8 * dt);
          else { sim += (ts + vel) * dt; vel *= Math.exp(-2.4 * dt); if (Math.abs(vel) < 0.02) vel = 0; }
          spd = U.damp(spd, drag.on ? drag.v : ts + vel, 8, dt);
          if (act < 0) {
            cycleT += dt;
            const c = Math.floor(cycleT / 3.6) % n;
            if (c !== cycle) { cycle = c; paintReadout(); }
          }
        }
        const P = st.pointer, lean = env.fine && !reduced ? 1 : 0;
        const ratio = G.ratio + P.sy * 0.04 * lean, roll = P.sx * 0.04 * lean;
        const tl = 0.22 * clamp(spd, -1.5, 1.5);
        const f0 = G.small ? 0.46 : 0.4;

        /* Lagrange asteroid belt */
        ctx.fillStyle = rgba(INK, 0.18);
        const bcs = Math.cos(roll), bsn = Math.sin(roll);
        for (let i = 0; i < belt.length; i++) {
          const b = belt[i], ba = b.a0 + sim * 0.055;
          const bR = G.R * b.rf, bry = bR * ratio;
          const lx = bR * Math.cos(ba), ly = bry * Math.sin(ba);
          const bx = cx + lx * bcs - ly * bsn, by = cy + lx * bsn + ly * bcs;
          ctx.fillRect(bx - b.sz * 0.5, by - b.sz * 0.5, b.sz, b.sz);
        }

        /* pass 1 — easing, geometry, orbit rings */
        for (let k = 0; k < orbits.length; k++) {
          const o = orbits[k], on = act === k, cyc = act < 0 && cycle === k;
          o.bright = ease(o.bright, on ? 1 : cyc ? 0.4 : 0, 7, dt);
          o.dim = ease(o.dim, act > -1 && !on ? 0.25 : 1, 7, dt);
          o.lab = ease(o.lab, on || cyc ? 1 : 0, 6, dt);
          o.R = G.R * (n > 1 ? f0 + (1 - f0) * o.f : 0.7);
          o.ry = o.R * ratio * o.squash;
          o.rot = roll + o.tilt * (G.small ? 0.5 : 1);
          const cs = Math.cos(o.rot), sn = Math.sin(o.rot), w0 = TAU / o.period, np = o.planets.length;
          for (let j = 0; j < np; j++) {
            const p = o.planets[j], a = o.phase + sim * w0 + (j * TAU) / np;
            const lx = o.R * Math.cos(a), ly = o.ry * Math.sin(a);
            p.a = a; p.depth = Math.sin(a);
            p.x = cx + lx * cs - ly * sn; p.y = cy + lx * sn + ly * cs;
            p.grow = ease(p.grow, ap && ap.k === k && ap.j === j ? 1 : 0, 10, dt);
            p.r = G.pr * (1 + 0.2 * p.depth) * (1 + 0.6 * p.grow) * (1 + 0.12 * o.bright);
          }
          const la = (0.22 + 0.5 * o.bright) * o.dim;
          ctx.lineWidth = 1 + 0.5 * o.bright;
          ctx.strokeStyle = rgba(o.color, la * 0.5);
          ctx.beginPath(); ctx.ellipse(cx, cy, o.R, o.ry, o.rot, Math.PI, TAU); ctx.stroke();
          ctx.strokeStyle = rgba(o.color, la);
          ctx.beginPath(); ctx.ellipse(cx, cy, o.R, o.ry, o.rot, 0, Math.PI); ctx.stroke();
        }

        /* moons */
        moonDim = ease(moonDim, act > -1 ? 0.4 : 1, 7, dt);
        if (moons.length) {
          const mR = G.moonR, mry = mR * ratio, mcs = Math.cos(roll), msn = Math.sin(roll);
          ctx.lineWidth = 1; ctx.setLineDash([2, 5]); ctx.strokeStyle = rgba(INK, 0.18 * moonDim);
          ctx.beginPath(); ctx.ellipse(cx, cy, mR, mry, roll, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          for (let i = 0; i < moons.length; i++) {
            const m = moons[i], a = 0.6 - sim * (TAU / 26) + (i * TAU) / moons.length;
            const lx = mR * Math.cos(a), ly = mry * Math.sin(a);
            m.depth = Math.sin(a); m.x = cx + lx * mcs - ly * msn; m.y = cy + lx * msn + ly * mcs;
          }
        }

        /* pass 2 — far side, core star, near side */
        for (let i = 0; i < moons.length; i++) if (moons[i].depth < 0) drawMoon(ctx, moons[i]);
        for (let k = orbits.length - 1; k >= 0; k--) { const o = orbits[k]; for (let j = 0; j < o.planets.length; j++) if (o.planets[j].depth < 0) drawPlanet(ctx, o, o.planets[j], tl); }
        drawCore(ctx, st);
        for (let i = 0; i < moons.length; i++) if (moons[i].depth >= 0) drawMoon(ctx, moons[i]);
        for (let k = 0; k < orbits.length; k++) { const o = orbits[k]; for (let j = 0; j < o.planets.length; j++) if (o.planets[j].depth >= 0) drawPlanet(ctx, o, o.planets[j], tl); }

        /* pass 3 — labels */
        ctx.font = '500 ' + G.font + 'px ' + MONO;
        ctx.textBaseline = 'middle';
        if (moonDim > 0.03) {
          ctx.lineJoin = 'round';
          for (let i = 0; i < moons.length; i++) {
            const m = moons[i], right = m.x >= cx;
            ctx.textAlign = right ? 'left' : 'right';
            ctx.lineWidth = 3; ctx.strokeStyle = rgba(BG, 0.85 * moonDim);
            ctx.strokeText(m.name, m.x + (right ? 7 : -7), m.y + 0.5);
            ctx.fillStyle = rgba(INK, 0.86 * moonDim);
            ctx.fillText(m.name, m.x + (right ? 7 : -7), m.y + 0.5);
          }
        }
        ctx.textAlign = 'left';
        let top = null, topOrbit = null;
        for (let k = 0; k < orbits.length; k++) {
          const o = orbits[k], a = o.lab * (0.4 + 0.6 * o.dim);
          if (a < 0.03) continue;
          for (let j = 0; j < o.planets.length; j++) {
            const p = o.planets[j];
            if (ap && ap.k === k && ap.j === j) { top = p; topOrbit = o; continue; }
            drawLabel(ctx, p.name, p.x, p.y, p.r, o.color, a * (ap && ap.k === k ? 0.6 : 1), false);
          }
        }
        if (top) drawLabel(ctx, top.name, top.x, top.y, top.r + 6, topOrbit.color, Math.max(top.grow, topOrbit.lab), true);
      });

      function pick(x, y, slop) {
        let best = null, bd = Infinity;
        for (let k = 0; k < orbits.length; k++) {
          const ps = orbits[k].planets;
          for (let j = 0; j < ps.length; j++) {
            const p = ps[j], dx = p.x - x, dy = p.y - y, d = dx * dx + dy * dy, reach = Math.max(p.r, 5) + slop;
            if (d < reach * reach && d < bd) { bd = d; best = { k, j }; }
          }
        }
        return best;
      }
      function setHover(hit, x) {
        if ((!hit && !hoverPlanet) || (hit && hoverPlanet && hit.k === hoverPlanet.k && hit.j === hoverPlanet.j)) return;
        hoverPlanet = hit;
        canvas.classList.toggle('is-hot', !!hit);
        if (hit) GK.sfx('tick', { x });
        sync();
      }
      function endDrag(e, fling) {
        if (drag.id !== e.pointerId) return;
        const wasDrag = drag.on;
        if (wasDrag) {
          vel = fling && !env.reduced ? clamp(drag.v, -40, 40) : 0;
          try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
          canvas.classList.remove('is-dragging');
        } else if (fling) {
          const pt = stage.localPos(e);
          const hit = pick(pt.x, pt.y, e.pointerType === 'mouse' ? 14 : 18);
          if (hit && pin && pin.k === hit.k && pin.j === hit.j) {
            pin = null;
          } else {
            pin = hit ? { k: hit.k, j: hit.j, until: state.time + 8 } : null;
          }
          if (hit) GK.sfx('chime', { i: hit.k, x: e.clientX });
          sync();
        }
        drag.id = -1; drag.on = false;
      }
      canvas.addEventListener('pointerdown', e => {
        if (e.button) return;
        if (e.pointerType === 'mouse') e.preventDefault();
        drag.id = e.pointerId; drag.on = false;
        drag.x = drag.x0 = e.clientX; drag.y0 = e.clientY;
        drag.t = performance.now(); drag.v = 0;
        vel = 0;
      });
      canvas.addEventListener('pointermove', e => {
        if (drag.id === e.pointerId) {
          if (!drag.on) {
            const tx = e.clientX - drag.x0, ty = e.clientY - drag.y0;
            if (Math.abs(tx) > (e.pointerType === 'mouse' ? 4 : 8) && Math.abs(tx) > Math.abs(ty)) {
              drag.on = true; drag.x = e.clientX; drag.t = performance.now();
              try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
              canvas.classList.add('is-dragging');
              setHover(null);
            } else if (Math.abs(ty) > 12) { drag.id = -1; }
          }
          if (drag.on) {
            const now = performance.now(), secs = Math.max(0.008, (now - drag.t) / 1000);
            const dSim = (-(e.clientX - drag.x) / Math.max(1, stage.w)) * SCRUB;
            sim += dSim;
            drag.v = U.lerp(drag.v, dSim / secs, 0.35);
            drag.x = e.clientX; drag.t = now;
            stage.dirty = true;
          }
          return;
        }
        if (e.pointerType === 'touch') return;
        const pt = stage.localPos(e);
        setHover(pick(pt.x, pt.y, 12), e.clientX);
      });
      canvas.addEventListener('pointerup', e => endDrag(e, true));
      canvas.addEventListener('pointercancel', e => endDrag(e, false));
      canvas.addEventListener('pointerleave', () => { if (!drag.on) setHover(null); });
    }

    /* ═══════════════════════════════════════════════════════════
       SECTOR 8 · CONSTELLATIONS — playable certificate sky
       ═══════════════════════════════════════════════════════════ */
    function initCerts() {
      const certs = Array.isArray(data.certs) ? data.certs : [];
      if (!certs.length) return;
      const grid = byId('certsGrid'), canvas = byId('certsCanvas'), hint = byId('certsHint');

      const SKY = [['csharp', 0.16, 0.30], ['java', 0.50, 0.20], ['responsive', 0.86, 0.32], ['dsa', 0.76, 0.70], ['blender', 0.44, 0.78], ['fullstack', 0.14, 0.68]];
      const stars = [];
      SKY.forEach(row => {
        const item = certs.find(c => c.id === row[0]);
        if (item) stars.push({ item, i: stars.length, nx: row[1], ny: row[2], x: -999, y: -999, hot: 0, ping: -10, label: String(item.short || item.title || '') });
      });
      const n = stars.length;
      const starOf = id => { for (let i = 0; i < n; i++) if (stars[i].item.id === id) return i; return -1; };

      const STEP = 0.22;
      let stage = null;
      let seq = null;
      let done = false, chimed = 0;
      let hoverStar = -1, sel = -1, cardHover = -1, cardFocus = -1, lastRing = 0, lastType = 'mouse';
      const cardOf = Object.create(null);
      const litStar = () => (hoverStar > -1 ? hoverStar : sel > -1 ? sel : cardHover > -1 ? cardHover : cardFocus);
      const ignited = i => !stage || done || (seq !== null && state.time - seq >= i * STEP);

      const rungStars = new Set();
      function ring(i, x) {
        if (i < 0 || !state.entered || !ignited(i)) return;
        const now = performance.now();
        if (now - lastRing < 140) return;
        lastRing = now;
        stars[i].ping = state.time;
        GK.sfx('chime', x == null ? { i } : { i, x });
        rungStars.add(i);
        if (stage) stage.dirty = true;
        if (rungStars.size >= n) {
          if (GK.cosmos && GK.cosmos.shower) GK.cosmos.shower(4.0);
          if (GK.unlockObjective) GK.unlockObjective('symphony-stars');
        }
      }
      function sync() {
        const lit = litStar(), id = lit > -1 ? stars[lit].item.id : '';
        for (const key in cardOf) cardOf[key].classList.toggle('is-lit', key === id);
        if (canvas) {
          canvas.classList.toggle('is-hot', hoverStar > -1);
          if (hoverStar > -1) canvas.dataset.cursor = 'OPEN'; else delete canvas.dataset.cursor;
        }
        if (stage) stage.dirty = true;
      }
      const open = (item, from) => GK.modal.open(item, { from: from || cardOf[item.id] || null, collection: certs });
      const keyboardFocus = node => { try { return node.matches(':focus-visible'); } catch (e) { return false; } };

      if (grid) {
        grid.innerHTML = certs.map(c =>
          '<button type="button" class="cert glass" data-spot data-cursor="OPEN" data-cursor-lock data-sfx-hover="none" data-cert="' + esc(c.id) + '" aria-label="' + esc((c.title || c.short) + ' — ' + (c.issuer || c.meta || 'Certificate') + '. Open certificate') + '">' +
            '<span class="cert-thumb">' + (c.thumb ? '<img src="' + esc(c.thumb) + '" alt="" width="64" height="48" loading="lazy" decoding="async" />' : '') + '</span>' +
            '<span class="cert-body"><span class="cert-name">' + esc(c.short || c.title) + '</span><span class="cert-issuer">' + esc(c.issuer || c.meta || '') + '</span></span>' +
            svg('arrow', 'cert-arrow') +
          '</button>').join('');
        qsa('.cert', grid).forEach(b => {
          const id = b.dataset.cert, item = certs.find(c => c.id === id), si = starOf(id);
          if (!item) return;
          cardOf[id] = b;
          const img = b.querySelector('img');
          if (img) img.addEventListener('error', () => { if (img.parentNode) img.parentNode.removeChild(img); }, { once: true });
          b.addEventListener('click', () => open(item, b));
          b.addEventListener('pointerenter', e => { if (e.pointerType === 'touch') return; cardHover = si; ring(si, e.clientX); sync(); });
          b.addEventListener('pointerleave', () => { if (cardHover === si) { cardHover = -1; sync(); } });
          b.addEventListener('focus', () => { cardFocus = si; if (keyboardFocus(b) && !GK.modal.isOpen) ring(si); sync(); });
          b.addEventListener('blur', () => { if (cardFocus === si) { cardFocus = -1; sync(); } });
        });
        GK.scan(grid);
      }
      if (hint) hint.textContent = env.fine ? 'Hover a star to ring it · click to open' : 'Tap a star to ring it · tap again to open';

      if (!canvas || !n) return;
      const sky = canvas.closest('.certs-sky') || canvas;
      const G = { font: 11, core: 2.6, spike: 12, reach: 26 };
      const M = 8;
      const bg = doc.createElement('canvas');
      const twinklers = [];
      let widths = Object.create(null), bgKey = '';
      const sector = GK.SECTORS && GK.SECTORS[8];
      const LAV = sector && sector.rgbB ? [Math.round(sector.rgbB[0] * 255), Math.round(sector.rgbB[1] * 255), Math.round(sector.rgbB[2] * 255)] : INK;
      const ca = [0, 0, 0], cb = [0, 0, 0];

      function mulberry(seed) {
        let a = seed >>> 0;
        return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      }
      function paintBackdrop(s, small) {
        const key = s.w + 'x' + s.h + '@' + s.dpr;
        if (key === bgKey) return;
        bgKey = key;
        bg.width = Math.max(1, Math.round((s.w + M * 2) * s.dpr));
        bg.height = Math.max(1, Math.round((s.h + M * 2) * s.dpr));
        const b = bg.getContext('2d');
        if (!b) return;
        b.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
        const rnd = mulberry(0x5EED), count = small ? 100 : 140;
        twinklers.length = 0;
        for (let i = 0; i < count; i++) {
          const x = rnd() * (s.w + M * 2), y = rnd() * (s.h + M * 2), r = 0.4 + rnd() * rnd() * 1.1, a = 0.14 + rnd() * 0.4, sp = 0.6 + rnd() * 1.6, ph = rnd() * TAU;
          if (i % 7 === 0 && !env.reduced) { twinklers.push({ x: x - M, y: y - M, r: r + 0.2, a: Math.min(0.8, a + 0.2), sp, ph }); continue; }
          b.fillStyle = rgba(i % 5 === 0 ? LAV : INK, a);
          b.beginPath(); b.arc(x, y, r, 0, TAU); b.fill();
        }
      }
      stage = makeStage(canvas, function layout(s) {
        const small = s.w < 620;
        G.font = small ? 10 : 11; G.core = small ? 2.3 : 2.7; G.spike = small ? 9 : 12; G.reach = env.fine ? 26 : 34;
        for (let i = 0; i < n; i++) { stars[i].x = stars[i].nx * s.w; stars[i].y = stars[i].ny * s.h; }
        widths = Object.create(null);
        paintBackdrop(s, small);
      });
      if (!stage) return;

      function start() {
        if (seq !== null || done) return;
        if (env.reduced) { done = true; chimed = n; }
        seq = state.time + 0.2;
        stage.dirty = true;
      }
      const viaReveal = doc.documentElement.classList.contains('has-reveal') && sky.hasAttribute('data-reveal');
      bus.on('reveal', node => { if (node === sky) start(); });
      if (sky.classList.contains('is-in')) start();

      function spike(ctx, x, y, lx, ly) {
        ctx.beginPath(); ctx.moveTo(x - lx, y); ctx.lineTo(x, y - ly); ctx.lineTo(x + lx, y); ctx.lineTo(x, y + ly); ctx.closePath(); ctx.fill();
      }

      stage.run(function draw(st, dt) {
        const ctx = stage.ctx, w = stage.w, h = stage.h, reduced = env.reduced;
        const P = st.pointer, drift = env.fine && !reduced ? 1 : 0, ox = -P.sx * 5 * drift, oy = -P.sy * 4 * drift;

        if (bg.width > 1) ctx.drawImage(bg, ox - M, oy - M, w + M * 2, h + M * 2);
        for (let i = 0; i < twinklers.length; i++) {
          const t = twinklers[i];
          ctx.fillStyle = rgba(INK, t.a * (0.5 + 0.5 * Math.sin(st.time * t.sp + t.ph)));
          ctx.beginPath(); ctx.arc(t.x + ox, t.y + oy, t.r, 0, TAU); ctx.fill();
        }

        if (seq === null && !viaReveal && st.entered) start();
        const t = done ? 1e3 : seq === null ? -1 : st.time - seq;
        if (t < 0) return;
        while (chimed < n && t >= chimed * STEP) {
          if (t - chimed * STEP < 0.3) { stars[chimed].ping = st.time; GK.sfx('chime', { i: chimed }); }
          chimed++;
        }
        if (!done && t > n * STEP + 0.7) done = true;

        const lit = litStar();
        pal('a', ca); pal('b', cb);

        if (n > 1) {
          ctx.lineCap = 'round';
          for (let i = 0; i < n; i++) {
            const p = clamp((t - i * STEP) / STEP);
            if (p <= 0) break;
            const a = stars[i], b = stars[(i + 1) % n];
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, gap = Math.min(12, len * 0.3);
            const end = Math.max(gap, Math.min(len - gap, len * p)), heat = Math.max(a.hot, b.hot);
            ctx.lineWidth = 1 + 0.4 * heat; ctx.strokeStyle = rgba(cb, 0.3 + 0.45 * heat);
            ctx.beginPath(); ctx.moveTo(a.x + ux * gap, a.y + uy * gap); ctx.lineTo(a.x + ux * end, a.y + uy * end); ctx.stroke();
            if (p < 1) { ctx.fillStyle = rgba(WHITE, 0.9); ctx.beginPath(); ctx.arc(a.x + ux * end, a.y + uy * end, 1.6, 0, TAU); ctx.fill(); }
          }
          if (done && !reduced) {
            const u = ((st.time * 0.09) % 1) * n, i0 = Math.floor(u) % n, f = u - Math.floor(u);
            const a = stars[i0], b = stars[(i0 + 1) % n], x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
            ctx.fillStyle = rgba(ca, 0.2); ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
            ctx.fillStyle = rgba(WHITE, 0.85); ctx.beginPath(); ctx.arc(x, y, 1.4, 0, TAU); ctx.fill();
          }
        }

        for (let i = 0; i < n; i++) {
          const s = stars[i], g = clamp((t - i * STEP) / 0.5);
          s.hot = ease(s.hot, lit === i ? 1 : 0, 9, dt);
          if (g <= 0) continue;
          const isRung = rungStars.has(i);
          const tw = reduced ? 0.9 : 0.8 + 0.2 * Math.sin(st.time * (1.4 + i * 0.23) + i * 2.1);
          const pop = g < 1 ? 1 + 0.7 * Math.sin(g * Math.PI) : 1, grow = U.easeOutCubic(g);
          const L = (G.spike + 8 * s.hot) * tw * pop * grow, core = (G.core + 1.1 * s.hot) * pop * grow;
          ctx.fillStyle = rgba(isRung ? GREEN : ca, 0.08 + 0.1 * s.hot); ctx.beginPath(); ctx.arc(s.x, s.y, core * 5, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba(isRung ? GREEN : ca, 0.16 + 0.14 * s.hot); ctx.beginPath(); ctx.arc(s.x, s.y, core * 2.4, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba(WHITE, 0.92);
          spike(ctx, s.x, s.y, L, 1.15); spike(ctx, s.x, s.y, 1.15, L);
          ctx.beginPath(); ctx.arc(s.x, s.y, core, 0, TAU); ctx.fill();
          const pt = st.time - s.ping;
          if (!reduced && pt >= 0 && pt < 0.75) {
            const k = pt / 0.75;
            ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(ca, 0.8 * (1 - k));
            ctx.beginPath(); ctx.arc(s.x, s.y, core + 4 + 26 * U.easeOutCubic(k), 0, TAU); ctx.stroke();
          }
          if (s.hot > 0.02 || isRung) {
            ctx.lineWidth = 1; ctx.strokeStyle = rgba(isRung ? GREEN : INK, isRung ? 0.45 : 0.5 * s.hot);
            ctx.beginPath(); ctx.arc(s.x, s.y, 17 - 3 * s.hot, 0, TAU); ctx.stroke();
          }
        }

        ctx.font = '500 ' + G.font + 'px ' + MONO;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        for (let i = 0; i < n; i++) {
          const s = stars[i], g = clamp((t - i * STEP - 0.15) / 0.4);
          if (g <= 0 || !s.label) continue;
          const tw = widths[s.label] || (widths[s.label] = ctx.measureText(s.label).width);
          const lx = clamp(s.x - tw / 2, 6, Math.max(6, w - tw - 6));
          const ly = clamp(s.y + (s.ny < 0.5 ? -1 : 1) * (G.spike + 13 + 3 * s.hot), 10, h - 10);
          const a = (0.66 + 0.34 * s.hot) * g;
          ctx.lineWidth = 3; ctx.strokeStyle = rgba(BG, 0.85 * a);
          ctx.strokeText(s.label, lx, ly);
          ctx.fillStyle = rgba(INK, a);
          ctx.fillText(s.label, lx, ly);
        }

        /* Harmonic Resonance progress counter */
        if (done) {
          const statusTxt = rungStars.size >= n ? 'HARMONIC CONSTELLATION COMPLETE ✦' : 'HARMONIC RESONANCE · ' + rungStars.size + ' / ' + n + ' RUNG';
          ctx.font = '500 10px ' + MONO;
          ctx.fillStyle = rgba(rungStars.size >= n ? GREEN : INK, 0.72);
          ctx.fillText(statusTxt, 14, 18);
        }
      });

      function pick(x, y) {
        let best = -1, bd = G.reach * G.reach;
        for (let i = 0; i < n; i++) {
          if (!ignited(i)) continue;
          const dx = stars[i].x - x, dy = stars[i].y - y, d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = i; }
        }
        return best;
      }
      canvas.addEventListener('pointerdown', e => { lastType = e.pointerType || 'mouse'; });
      canvas.addEventListener('pointermove', e => {
        if (e.pointerType === 'touch') return;
        const pt = stage.localPos(e);
        const i = pick(pt.x, pt.y);
        if (i === hoverStar) return;
        hoverStar = i;
        ring(i, e.clientX);
        sync();
      });
      canvas.addEventListener('pointerleave', () => { if (hoverStar > -1) { hoverStar = -1; sync(); } });
      canvas.addEventListener('click', e => {
        const pt = stage.localPos(e);
        const i = pick(pt.x, pt.y);
        if (i < 0) { if (sel > -1) { sel = -1; sync(); } return; }
        if (lastType !== 'mouse' && sel !== i) { sel = i; ring(i, e.clientX); sync(); return; }
        open(stars[i].item);
      });
    }

    /* ═══════════════════════════════════════════════════════════
       SECTOR 9 · TRANSMISSION — contact
       ═══════════════════════════════════════════════════════════ */
    function initContact() {
      const person = data.person || {}, contact = data.contact || {};
      const email = person.email || '';
      const mailto = (subject, body) => (typeof data.mailto === 'function'
        ? data.mailto(subject, body)
        : 'mailto:' + email + '?subject=' + encodeURIComponent(subject || '') + '&body=' + encodeURIComponent(body || ''));
      const setText = (id, text) => { const node = byId(id); if (node && text) node.textContent = text; };

      function legacyCopy(text) {
        try {
          const ta = U.el('textarea', { readonly: true, tabindex: '-1', 'aria-hidden': 'true', style: { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', padding: '0', border: '0', opacity: '0', fontSize: '16px' } });
          ta.value = text;
          const prev = doc.activeElement;
          doc.body.appendChild(ta);
          ta.focus({ preventScroll: true });
          ta.select();
          ta.setSelectionRange(0, text.length);
          const ok = doc.execCommand('copy');
          doc.body.removeChild(ta);
          if (prev && prev.focus) prev.focus({ preventScroll: true });
          return !!ok;
        } catch (e) { return false; }
      }
      function copyText(text) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
        } catch (e) {}
        return Promise.resolve(legacyCopy(text));
      }
      const emailBtn = byId('emailLink');
      let copiedTimer = 0;
      function copyEmail() {
        if (!email) return;
        copyText(email).then(ok => {
          if (!ok) { GK.toast('Could not copy — ' + email, { tone: 'warn', duration: 6000 }); GK.sfx('error'); return; }
          GK.toast('Email copied', { tone: 'ok' });
          GK.sfx('success');
          if (emailBtn) {
            emailBtn.classList.add('is-copied');
            clearTimeout(copiedTimer);
            copiedTimer = setTimeout(() => emailBtn.classList.remove('is-copied'), 1800);
          }
        });
      }

      setText('emailText', email);
      if (emailBtn) {
        if (email) emailBtn.setAttribute('aria-label', 'Copy email address ' + email);
        emailBtn.addEventListener('click', e => { e.preventDefault(); copyEmail(); });
      }
      const mailApp = byId('mailAppLink');
      if (mailApp && email) mailApp.href = mailto();
      setText('contactPhone', person.phone);
      setText('contactLocation', person.location);
      setText('contactStatus', person.status);
      const socialRow = byId('socialRow');
      if (socialRow && Array.isArray(data.social)) {
        socialRow.innerHTML = data.social.map(s =>
          '<li><a class="chip contact-social" href="' + esc(s.url) + '" target="_blank" rel="noopener" data-cursor="OPEN" data-cursor-lock aria-label="' + esc(s.name + ' ' + (s.handle || '') + ' (opens in a new tab)') + '">' +
            svg(ICON[s.name] ? s.name : 'arrow') + '<span>' + esc(s.name) + '</span>' + (s.handle ? '<span class="contact-social-handle">' + esc(s.handle) + '</span>' : '') +
          '</a></li>').join('');
        GK.scan(socialRow);
      }

      const form = byId('contactForm');
      if (!form) return;
      const nameEl = byId('cf-name'), mailEl = byId('cf-email'), msgEl = byId('cf-message'), btn = byId('submitBtn');
      const labelEl = byId('submitLabel'), stateEl = byId('txState'), note = byId('txNote'), noteCopy = byId('txCopy'), servicesHost = byId('txServices');

      if (servicesHost && Array.isArray(contact.services)) {
        servicesHost.innerHTML = contact.services.map(s =>
          '<label class="tx-chip"><input type="radio" name="service" value="' + esc(s) + '" /><span>' + esc(s) + '</span></label>').join('');
        let chosen = null;
        servicesHost.addEventListener('click', e => {
          const radio = e.target && e.target.matches && e.target.matches('input[type="radio"]') ? e.target : null;
          if (!radio) return;
          if (chosen === radio) { radio.checked = false; chosen = null; } else chosen = radio;
          GK.sfx('toggle');
        });
      }

      const wave = (function () {
        const api = { pulse() {}, surge() {}, ok() {} };
        const cv = byId('txWave') || form.querySelector('.tx-wave');
        const stage = cv ? makeStage(cv) : null;
        if (!stage) return api;
        let energy = 0, surge = 0, okT = 0;
        const N = [];
        for (let i = 0; i < 64; i++) N.push(Math.random() * 2 - 1);
        const noise = x => { const i = Math.floor(x), f = x - i, a = N[i & 63], b = N[(i + 1) & 63]; return a + (b - a) * f * f * (3 - 2 * f); };
        const echo = [0, 0, 0], col = [0, 0, 0];

        function trace(ctx, w, h, t, amp, audio, lineWidth, style) {
          const mid = h / 2, steps = Math.max(24, Math.round(w / 3)), last = audio ? audio.length - 1 : 0;
          ctx.lineWidth = lineWidth; ctx.strokeStyle = style; ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let i = 0; i <= steps; i++) {
            const u = i / steps, taper = Math.sin(u * Math.PI);
            let v = (0.55 * Math.sin(u * 13 + t * 2.3) + 0.3 * Math.sin(u * 31 - t * 3.7) + 0.2 * noise(u * 24 + t * 5)) * amp;
            v += energy * 0.5 * amp * Math.sin(u * 88 - t * 36);
            if (audio) v += ((audio[(u * last) | 0] - 128) / 128) * mid * 0.8;
            const y = clamp(mid + v * taper, 2, h - 2);
            if (i) ctx.lineTo(u * w, y); else ctx.moveTo(0, y);
          }
          ctx.stroke();
        }
        stage.run(function draw(st, dt) {
          const ctx = stage.ctx, w = stage.w, h = stage.h, mid = h / 2, reduced = env.reduced;
          energy *= Math.exp(-dt / 0.13); surge *= Math.exp(-dt / 0.6); okT *= Math.exp(-dt / 0.9);
          let audio = null;
          if (!reduced && GK.audio && typeof GK.audio.wave === 'function') { try { audio = GK.audio.wave(); } catch (e) { audio = null; } }
          if (!audio || !audio.length) audio = null;
          const t = reduced ? 0 : st.time;
          const amp = mid * clamp(0.12 + energy * 0.42 + surge * 0.8, 0, 0.94);
          ctx.lineWidth = 1; ctx.strokeStyle = rgba(INK, 0.08);
          ctx.beginPath(); ctx.moveTo(0, Math.round(mid) + 0.5); ctx.lineTo(w, Math.round(mid) + 0.5); ctx.stroke();
          ctx.fillStyle = rgba(INK, 0.12);
          for (let x = 12; x < w; x += 24) ctx.fillRect(x, h - 5, 1, 3);
          pal('a', echo);
          trace(ctx, w, h, t - 0.4, amp * 0.72, null, 1, rgba(echo, 0.32));
          for (let i = 0; i < 3; i++) col[i] = Math.round(CYAN[i] + (GREEN[i] - CYAN[i]) * clamp(okT));
          trace(ctx, w, h, t, amp, audio, 1.5, rgba(col, 0.92));
        });
        if (!env.reduced) {
          api.pulse = a => { energy = Math.min(1, energy + (a || 0.34)); };
          api.surge = () => { surge = 1; };
          api.ok = () => { okT = 1; };
        }
        return api;
      })();

      const idleLabel = (labelEl && labelEl.textContent.trim()) || 'Send message';
      const setLabel = text => { if (labelEl) labelEl.textContent = text; };
      const setState = (text, tone) => {
        if (!stateEl) return;
        if (stateEl.textContent !== text) stateEl.textContent = text;
        if (tone) stateEl.dataset.tone = tone; else delete stateEl.dataset.tone;
      };
      if (noteCopy) noteCopy.addEventListener('click', copyEmail);

      const fields = [
        { el: nameEl, test: v => v.length > 0, msg: 'Please add your name.' },
        { el: mailEl, test: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), msg: 'Enter a valid email address.' },
        { el: msgEl, test: v => v.length > 0, msg: 'Please write a short message.' },
      ];
      const complete = fields.every(f => f.el);
      function setError(f, on) {
        const err = byId(f.el.id + '-err');
        if (on) f.el.setAttribute('aria-invalid', 'true'); else f.el.removeAttribute('aria-invalid');
        if (err) { err.textContent = on ? f.msg : ''; err.hidden = !on; }
      }
      function shake(node) {
        const box = node.closest('.tx-field');
        if (!box || env.reduced) return;
        box.classList.remove('is-shake');
        void box.offsetWidth;
        box.classList.add('is-shake');
        box.addEventListener('animationend', () => box.classList.remove('is-shake'), { once: true });
      }

      let busy = false, warned = false;
      form.addEventListener('input', e => {
        wave.pulse();
        const f = fields.find(x => x.el === e.target);
        if (f && f.el.getAttribute('aria-invalid') === 'true' && f.test(f.el.value.trim())) setError(f, false);
        if (warned && !busy && !form.querySelector('[aria-invalid="true"]')) { warned = false; setState('Channel open'); }
      });

      form.addEventListener('submit', e => {
        e.preventDefault();
        if (busy || !complete) return;
        let first = null;
        fields.forEach(f => {
          const bad = !f.test(f.el.value.trim());
          setError(f, bad);
          if (bad) { shake(f.el); if (!first) first = f.el; }
        });
        if (first) {
          warned = true;
          setState('Check the highlighted fields', 'warn');
          GK.sfx('error');
          first.focus();
          return;
        }

        const checked = form.querySelector('input[name="service"]:checked');
        const name = nameEl.value.trim(), from = mailEl.value.trim(), message = msgEl.value.trim();
        const service = (checked && checked.value) || 'General';
        const href = mailto('Project Inquiry from ' + name + ' — ' + service, 'From: ' + name + ' <' + from + '>\nService: ' + service + '\n\n' + message);

        busy = true; warned = false;
        if (btn) { btn.classList.add('is-busy'); btn.setAttribute('aria-disabled', 'true'); }
        setLabel('Encoding…');
        setState('Encoding', 'busy');
        wave.surge();
        GK.sfx('transmit');

        setTimeout(() => {
          setLabel('Opening email…');
          setState('Opening email', 'busy');
          setTimeout(() => { window.location.href = href; }, 60);
          setTimeout(() => {
            if (btn) { btn.classList.remove('is-busy'); btn.classList.add('is-done'); }
            setLabel('Email ready');
            setState('Email ready');
            wave.ok();
            GK.sfx('success');
            if (note) note.hidden = false;
            setTimeout(() => {
              if (btn) { btn.classList.remove('is-done'); btn.removeAttribute('aria-disabled'); }
              setLabel(idleLabel);
              setState('Channel open');
              busy = false;
            }, 2500);
          }, 900);
        }, 300);
      });
    }

    [initStack, initCerts, initContact].forEach(section => {
      try { section(); } catch (e) { console.error('[GK] voyage-d: ' + section.name + ' failed', e); }
    });
  });
})();
