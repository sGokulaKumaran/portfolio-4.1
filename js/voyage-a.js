/* ═══════════════════════════════════════════════════════════════
   VOYAGER 6.0 · voyage-a.js
   Sector 0 ORIGIN (hero) and sector 1 SIGNAL (role).

   Upgrades in 6.0:
   - Exact bounding-box pointer coordinates on Holo-Planet (immune to
     CSS scale reveal and pointer capture offset drift)
   - Selecting any Role beacon/pill smoothly steers the 3D Holo-Planet
     to center that beacon in the front hemisphere
   - Animated telemetry packets traveling along great-circle arcs +
     equatorial orbital satellite ring
   - Singularity Shockwave trigger button/gesture in Hero
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const GK = window.GK;
  if (!GK || typeof GK.register !== 'function') return;

  const TAU = Math.PI * 2;
  const byId = id => document.getElementById(id);
  const setText = (id, text) => { const n = byId(id); if (n && text) n.textContent = text; };

  /* ───────────────────────── sector 0 · hero ───────────────────────── */
  function initHero(GK) {
    const { clamp, damp, smoothstep, qsa, onVisible } = GK.util;
    const env = GK.env, state = GK.state, bus = GK.bus;
    const person = (GK.data && GK.data.person) || {};
    const panel = byId('p0');
    if (!panel) return;
    const name = byId('heroName');

    setText('heroAvail', person.availability);
    setText('heroCoords', person.coords);
    setText('heroLoc', person.location);
    if (/Mac|iPhone|iPad|iPod/i.test(navigator.platform || '')) {
      qsa('[data-mod]', panel).forEach(k => { k.textContent = '⌘'; });
    }

    const W_MIN = 200, W_MAX = 800;
    const REST = [300, 620];
    const letters = [];
    let introStarted = false;

    if (name) {
      if (person.name) name.setAttribute('aria-label', person.name);
      const words = [person.first, person.last];
      let gi = 0;
      qsa('.hero-row', name).forEach((row, r) => {
        const chars = Array.from(String(words[r] || row.textContent || '').trim());
        const base = REST[r] || REST[0];
        row.textContent = '';
        chars.forEach((ch, i) => {
          const el = document.createElement('span');
          el.className = 'hero-ch';
          el.textContent = ch;
          el.style.setProperty('--i', gi);
          el.style.setProperty('--off', (i - (chars.length - 1) / 2).toFixed(1));
          row.appendChild(el);
          letters.push({
            el, i: gi++, row: r, base,
            u: chars.length > 1 ? i / (chars.length - 1) + r * 0.18 : 0,
            w: env.reduced ? base : W_MIN, last: -1, cx: 0, cy: 0, born: Infinity,
          });
        });
      });
      if (letters.length) name.classList.add('is-split');
    }

    const writeWeight = l => {
      l.last = Math.round(l.w);
      l.el.style.fontVariationSettings = "'wght' " + l.last;
    };

    function measureLetters() {
      if (!letters.length) return;
      let bx = 0, by = 0, n = letters[0].el.offsetParent;
      while (n) { bx += n.offsetLeft; by += n.offsetTop; n = n.offsetParent; }
      for (let i = 0; i < letters.length; i++) {
        const l = letters[i], el = l.el;
        l.cx = bx + el.offsetLeft + el.offsetWidth / 2;
        l.cy = by + el.offsetTop + el.offsetHeight / 2;
      }
    }

    function lockSlots() {
      if (!letters.length) return;
      name.style.removeProperty('--va-fit');
      letters.forEach(l => { l.el.style.width = ''; l.el.style.fontVariationSettings = "'wght' " + W_MAX; });
      const fs = parseFloat(getComputedStyle(name).fontSize) || 16;
      const widths = letters.map(l => l.el.getBoundingClientRect().width);
      const rowWidth = [];
      letters.forEach((l, i) => {
        const cs = getComputedStyle(l.el);
        rowWidth[l.row] = (rowWidth[l.row] || 0) + widths[i] + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
      });
      letters.forEach((l, i) => {
        if (widths[i] > 0) l.el.style.width = (widths[i] / fs).toFixed(4) + 'em';
        writeWeight(l);
      });
      const avail = name.parentNode ? name.parentNode.clientWidth : 0;
      const widest = rowWidth.reduce((m, w) => Math.max(m, w || 0), 0);
      if (avail > 0 && widest > avail) name.style.setProperty('--va-fit', (avail / widest * 0.985).toFixed(4));
      measureLetters();
    }

    if (letters.length) {
      lockSlots();
      const relock = () => lockSlots();
      if (document.fonts) {
        if (document.fonts.ready) document.fonts.ready.then(relock).catch(() => {});
        if (document.fonts.load) document.fonts.load('800 80px "Bricolage Grotesque"').then(relock).catch(() => {});
      }
      bus.on('resize', relock);
      bus.on('measure', measureLetters);
    }

    function startIntro() {
      if (introStarted) return;
      introStarted = true;
      if (!name) return;
      name.classList.add('is-live');
      const t = state.time;
      letters.forEach(l => { l.born = t + l.i * 0.04; });
    }
    function onEnter() {
      const away = window.scrollY > env.h * 0.6;
      if (away) qsa('[data-reveal]', panel).forEach((n, i) => n.style.setProperty('--delay', i * 80));
      if (env.reduced || away) startIntro();
      else setTimeout(startIntro, 900);
      setTimeout(() => {
        panel.classList.add('is-hinting');
        qsa('[data-reveal]:not(.is-in)', panel).forEach(n => n.style.setProperty('--delay', 0));
      }, env.reduced || away ? 0 : 3200);
    }
    if (state.entered) onEnter(); else bus.once('enter', onEnter);

    /* Singularity Grazer: double-click, hold on Hero Black Hole, or click the Singularity button */
    const fireSingularity = (cx, cy) => {
      if (GK.cosmos && GK.cosmos.ripple) GK.cosmos.ripple(cx, cy, 1.25);
      if (GK.cosmos && GK.cosmos.flash) GK.cosmos.flash(0.35);
      GK.sfx('gravity', { x: cx });
      if (GK.unlockObjective) GK.unlockObjective('event-horizon');
    };
    if (name) {
      let holdTimer = 0;
      name.addEventListener('dblclick', e => {
        fireSingularity(e.clientX || env.w / 2, e.clientY || env.h / 2);
      });
      name.addEventListener('pointerdown', e => {
        clearTimeout(holdTimer);
        const cx = e.clientX || env.w / 2, cy = e.clientY || env.h / 2;
        holdTimer = setTimeout(() => fireSingularity(cx, cy), 680);
      }, { passive: true });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => {
        name.addEventListener(ev, () => clearTimeout(holdTimer), { passive: true });
      });
    }
    const pulseBtn = byId('singularityBtn');
    if (pulseBtn) {
      pulseBtn.addEventListener('click', e => {
        const r = pulseBtn.getBoundingClientRect();
        fireSingularity(r.left + r.width / 2, env.h * 0.42);
      });
    }

    bus.on('loop', () => {
      if (env.reduced || !introStarted || !name || !letters.length) return;
      name.classList.remove('is-live');
      void name.offsetWidth;
      name.classList.add('is-live');
      const t = state.time;
      letters.forEach(l => { l.born = t + l.i * 0.04; l.w = W_MIN; });
    });

    let visible = true, scrolled = false, lastP = -1;
    onVisible(panel, v => { visible = v; });

    GK.ticker.add((s, dt) => {
      if (!visible) return;
      if (!scrolled && s.entered && s.scrollY > 24) { scrolled = true; panel.classList.add('is-scrolled'); }
      if (!name || !letters.length || env.reduced) return;

      const p = clamp(s.scrollY / Math.max(1, env.h * 0.6));
      if (Math.abs(p - lastP) > 0.0015 || (p !== lastP && (p === 0 || p === 1))) {
        lastP = p;
        if (p <= 0) {
          name.classList.remove('is-falling');
          name.style.transform = '';
          name.style.opacity = '';
          name.style.removeProperty('--spread');
        } else {
          const e = p * p;
          name.classList.add('is-falling');
          name.style.transform = 'scaleY(' + (1 + 0.2 * e).toFixed(4) + ')';
          name.style.opacity = (1 - smoothstep(0.08, 0.92, p)).toFixed(3);
          name.style.setProperty('--spread', (0.09 * e).toFixed(4) + 'em');
        }
      }
      if (p >= 1 || !introStarted) return;

      const ptr = s.pointer, t = s.time, sy = s.scrollY;
      const wave = !env.fine || !ptr.active;
      const step = wave ? 10 : 6;
      for (let i = 0; i < letters.length; i++) {
        const l = letters[i];
        const age = t - l.born;
        let target = W_MIN, lambda = 9;
        if (age >= 0) {
          let k;
          if (wave) {
            const sv = 0.5 + 0.5 * Math.sin((t / 6 - l.u * 0.8) * TAU);
            k = sv * sv * sv * 0.85;
          } else {
            const d = Math.hypot(ptr.x - l.cx, ptr.y - (l.cy - sy));
            const q = d < 280 ? 1 - d / 280 : 0;
            k = q * q * (3 - 2 * q);
          }
          target = l.base + (W_MAX - l.base) * k;
          if (age < 1.4) lambda = 3.5;
        }
        l.w = damp(l.w, target, lambda, dt);
        if (Math.abs(l.w - l.last) >= step) writeWeight(l);
      }
    }, 11);
  }

  /* ───────────────────────── sector 1 · holo-planet ───────────────────────── */
  function createHolo(GK, canvas, wrap, roles, onPick) {
    const ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return null;
    const { clamp, damp, easeOutCubic, onVisible, fitCanvas } = GK.util;
    const env = GK.env, state = GK.state, bus = GK.bus;

    const css = getComputedStyle(document.documentElement);
    const token = (name, fallback) => (css.getPropertyValue(name) || '').trim() || fallback;
    const INK = token('--ink', '#F3F1EA'), INK2 = token('--ink-2', '#B9BCC8');
    const FOCUS = token('--cyan', '#00E5FF'), BG = token('--bg', '#05060A');
    const FONT = '500 11px ' + token('--font-mono', 'monospace');
    const HAS_SPACING = 'letterSpacing' in ctx;

    const N = env.mobile ? 420 : 900;
    const PERSP = 0.16, BASE_PITCH = 0.32, SPIN = 0.12;
    const pts = new Float32Array(N * 3), lag = new Float32Array(N);
    const off = new Float32Array(N * 2), scr = new Float32Array(N * 2), bucket = new Uint8Array(N);
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * i + 1) / N, r = Math.sqrt(1 - y * y), th = i * GOLDEN;
      pts[i * 3] = Math.cos(th) * r; pts[i * 3 + 1] = y; pts[i * 3 + 2] = Math.sin(th) * r;
      lag[i] = ((i * 0.6180339887) % 1) * 0.3;
    }
    const ALPHA = [0.14, 0.26, 0.44, 0.68, 0.95], SIZE = [1.2, 1.3, 1.5, 1.6, 1.8];

    const SEG = 72, RING_LAT = [-0.62, 0, 0.62], DASHED = [3, 7], SOLID = [];
    const ringC = new Float32Array(SEG + 1), ringS = new Float32Array(SEG + 1);
    for (let s = 0; s <= SEG; s++) { ringC[s] = Math.cos(s / SEG * TAU); ringS[s] = Math.sin(s / SEG * TAU); }

    const LAT = [26, -30, 44, -12, 10, -46];
    const beacons = roles.map((label, i) => {
      const lat = LAT[i % LAT.length] * Math.PI / 180, lon = i / roles.length * TAU;
      return {
        lat, lon,
        x: Math.cos(lat) * Math.cos(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.sin(lon),
        label: String(label).toUpperCase(), sx: 0, sy: 0, sz: 0, tw: 0,
      };
    });

    let W = 0, H = 0, kx = 1, ky = 1, cx = 0, cy = 0, R = 0, small = false, ready = false, stale = true;
    let yaw = 0.6, pitch = BASE_PITCH, vyaw = 0, vpitch = 0, spin = 1;
    let steerYaw = null, steerPitch = null, steerTimer = 0;
    let started = false, converged = env.reduced, t0 = 0;
    let visible = false, dirty = true, dirtyUntil = 0, drawn = false, nextFit = 0, liteAcc = 0;
    let active = 0, focus = -1, hover = -1, actT = 1, burst = 1, ax = null, ay = 0;
    let dragging = false, pid = -1, lastX = 0, lastY = 0, dragDX = 0, dragDY = 0, travel = 0, downT = 0;
    let ptrIn = false, mx = 0, my = 0;

    function fit() {
      const f = fitCanvas(canvas, env.lite ? 1.25 : 1.5);
      W = canvas.clientWidth || f.w; H = canvas.clientHeight || f.h;
      ready = W > 2 && H > 2;
      if (!ready) return;
      kx = canvas.width / W; ky = canvas.height / H;
      cx = W / 2; cy = H / 2; R = Math.min(W, H) * 0.3;
      small = W < 360;
      stale = true; dirty = true; ax = null;
    }

    function localPos(e) {
      const r = canvas.getBoundingClientRect();
      const sx = r.width > 0 ? W / r.width : 1;
      const sy = r.height > 0 ? H / r.height : 1;
      return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
    }

    function hit(x, y, radius) {
      let best = -1, bd = radius * radius;
      if (!drawn) return best;
      for (let i = 0; i < beacons.length; i++) {
        const b = beacons[i], dx = b.sx - x, dy = b.sy - y;
        let d = dx * dx + dy * dy;
        if (b.sz < 0) d *= 1.6;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }

    function step(dt) {
      if (dragging) {
        const dxr = dragDX * 0.008, dyr = dragDY * 0.008;
        dragDX = 0; dragDY = 0;
        yaw += dxr;
        pitch = clamp(pitch + dyr, -1.15, 1.15);
        if (dt > 0) {
          vyaw = clamp(damp(vyaw, dxr / dt, 20, dt), -6, 6);
          vpitch = clamp(damp(vpitch, dyr / dt, 20, dt), -6, 6);
        }
        spin = 0;
        steerTimer = 0;
      } else if (dt > 0) {
        if (steerTimer > 0 && steerYaw !== null) {
          steerTimer -= dt;
          let dyaw = ((steerYaw - yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
          yaw += dyaw * (1 - Math.exp(-6.5 * dt));
          pitch = damp(pitch, steerPitch, 6.5, dt);
          vyaw = 0; vpitch = 0; spin = 0.15;
        } else {
          const f = Math.pow(0.94, dt * 60);
          vyaw *= f; vpitch *= f;
          spin = damp(spin, 1, 1.2, dt);
          yaw += (vyaw + SPIN * spin) * dt;
          pitch = clamp(pitch + vpitch * dt, -1.15, 1.15);
          pitch = damp(pitch, BASE_PITCH, 0.35, dt);
        }
      }
      if (actT < 1) actT = Math.min(1, actT + dt / 0.3);
      if (burst < 1) burst = Math.min(1, burst + dt / 0.7);
    }

    function plate(b, x, y, alpha, strong) {
      ctx.globalAlpha = alpha * 0.84;
      ctx.fillStyle = BG;
      ctx.fillRect(x - 5, y - 9, b.tw + 10, 18);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = strong ? INK : INK2;
      ctx.fillText(b.label, x, y + 0.5);
    }

    function ring(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }

    function draw(time, dt) {
      const tRel = converged ? 99 : time - t0;
      ctx.setTransform(kx, 0, 0, ky, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (tRel <= 0) return;
      if (tRel > 1.7) converged = true;
      const fade = clamp(tRel / 0.5), late = clamp((tRel - 0.55) / 0.45);
      const pa = state.palette.a;
      const col = 'rgb(' + Math.round(pa[0] * 255) + ',' + Math.round(pa[1] * 255) + ',' + Math.round(pa[2] * 255) + ')';
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw), cosP = Math.cos(pitch), sinP = Math.sin(pitch);

      /* outer orbital telemetry ring */
      if (late > 0) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.22);
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.18 * late;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.ellipse(0, 0, R * 1.28, R * 0.38, 0, 0, TAU);
        ctx.stroke();
        ctx.setLineDash(SOLID);
        if (!env.reduced) {
          const satA = time * 0.55;
          const sx = Math.cos(satA) * R * 1.28, sy = Math.sin(satA) * R * 0.38;
          ctx.globalAlpha = 0.85 * late;
          ctx.fillStyle = FOCUS;
          ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, TAU); ctx.fill();
        }
        ctx.restore();

        const rr = R * 1.05;
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        for (let k = 0; k < RING_LAT.length; k++) {
          const cl = Math.cos(RING_LAT[k]), sl = Math.sin(RING_LAT[k]);
          ctx.setLineDash(RING_LAT[k] === 0 ? SOLID : DASHED);
          ctx.lineDashOffset = yaw * rr * cl;
          for (let pass = 0; pass < 2; pass++) {
            ctx.beginPath();
            let pen = false;
            for (let s = 0; s <= SEG; s++) {
              const z = ringS[s] * cl;
              const y2 = sl * cosP - z * sinP, z2 = sl * sinP + z * cosP;
              if ((z2 >= 0) === (pass === 1)) {
                const m = rr / (1 - z2 * PERSP), px = cx + ringC[s] * cl * m, py = cy - y2 * m;
                if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
              } else pen = false;
            }
            ctx.globalAlpha = (pass ? 0.36 : 0.1) * late;
            ctx.stroke();
          }
        }
        ctx.setLineDash(SOLID);
      }

      /* points */
      const repel = ptrIn && !env.reduced;
      const ke = 1 - Math.exp(-12 * dt);
      for (let i = 0, j = 0, o = 0; i < N; i++, j += 3, o += 2) {
        const x = pts[j], y = pts[j + 1], z = pts[j + 2];
        const x1 = x * cosY + z * sinY, z1 = z * cosY - x * sinY;
        const y2 = y * cosP - z1 * sinP, z2 = y * sinP + z1 * cosP;
        let m = R / (1 - z2 * PERSP);
        if (!converged) m *= 1 + 1.2 * (1 - easeOutCubic(clamp((tRel - lag[i]) / 0.62)));
        let px = cx + x1 * m, py = cy - y2 * m;
        let tx = 0, ty = 0;
        if (repel) {
          const dx = px - mx, dy = py - my, d2 = dx * dx + dy * dy;
          if (d2 < 4900 && d2 > 0.01) {
            const d = Math.sqrt(d2), f = 14 * (1 - d / 70) / d;
            tx = dx * f; ty = dy * f;
          }
        }
        let ox = off[o], oy = off[o + 1];
        if (tx !== 0 || ty !== 0 || ox !== 0 || oy !== 0) {
          ox += (tx - ox) * ke; oy += (ty - oy) * ke;
          if (tx === 0 && ty === 0 && ox * ox + oy * oy < 0.01) { ox = 0; oy = 0; }
          off[o] = ox; off[o + 1] = oy;
          px += ox; py += oy;
        }
        scr[o] = px; scr[o + 1] = py;
        bucket[i] = z2 < -0.6 ? 0 : z2 < -0.2 ? 1 : z2 < 0.2 ? 2 : z2 < 0.6 ? 3 : 4;
      }
      ctx.fillStyle = col;
      for (let b = 0; b < 5; b++) {
        const sz = SIZE[b], h = sz / 2;
        ctx.globalAlpha = ALPHA[b] * fade;
        for (let i = 0; i < N; i++) if (bucket[i] === b) ctx.fillRect(scr[i * 2] - h, scr[i * 2 + 1] - h, sz, sz);
      }

      /* beacons */
      if (late <= 0) { ctx.globalAlpha = 1; return; }
      const br = R * 1.05;
      for (let i = 0; i < beacons.length; i++) {
        const b = beacons[i];
        const x1 = b.x * cosY + b.z * sinY, z1 = b.z * cosY - b.x * sinY;
        const y2 = b.y * cosP - z1 * sinP, z2 = b.y * sinP + z1 * cosP;
        const m = br / (1 - z2 * PERSP);
        b.sx = cx + x1 * m; b.sy = cy - y2 * m; b.sz = z2;
      }
      drawn = true;

      /* Great-circle data arcs + traveling telemetry packets */
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      for (let i = 0; i < beacons.length; i++) {
        const a = beacons[i], b = beacons[(i + 1) % beacons.length];
        if (a.sz < -0.15 && b.sz < -0.15) continue;
        const vis = clamp((a.sz + b.sz + 0.6) * 0.45, 0.06, 0.34) * late;
        ctx.globalAlpha = vis;
        const mxp = (a.sx + b.sx) * 0.5 + (cx - (a.sx + b.sx) * 0.5) * -0.18;
        const myp = (a.sy + b.sy) * 0.5 + (cy - (a.sy + b.sy) * 0.5) * -0.18;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.quadraticCurveTo(mxp, myp, b.sx, b.sy);
        ctx.stroke();

        if (!env.reduced && vis > 0.12) {
          const u = (time * 0.45 + i * 0.21) % 1;
          const iu = 1 - u;
          const px = iu * iu * a.sx + 2 * iu * u * mxp + u * u * b.sx;
          const py = iu * iu * a.sy + 2 * iu * u * myp + u * u * b.sy;
          ctx.globalAlpha = vis * 2.2;
          ctx.fillStyle = INK;
          ctx.beginPath(); ctx.arc(px, py, 1.8, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();

      ctx.font = FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      if (HAS_SPACING) ctx.letterSpacing = '0.08em';
      if (stale) { beacons.forEach(b => { b.tw = ctx.measureText(b.label).width; }); stale = false; }

      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < beacons.length; i++) {
          const b = beacons[i];
          if (i === active || (b.sz >= 0) !== (pass === 1)) continue;
          const d = (b.sz + 1) / 2, a = (0.28 + 0.72 * d) * late, hot = i === hover || i === focus;
          ctx.globalAlpha = a; ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(b.sx, b.sy, 1.8 + d * 1.2, 0, TAU); ctx.fill();
          ctx.globalAlpha = a * 0.55; ctx.strokeStyle = col; ctx.lineWidth = 1;
          ring(b.sx, b.sy, 5 + d * 1.5);
          if (hot) {
            ctx.globalAlpha = late; ctx.strokeStyle = i === focus ? FOCUS : INK; ctx.lineWidth = 1.5;
            ring(b.sx, b.sy, 10);
          }
          if (hot || (!small && b.sz > -0.05)) {
            plate(b, clamp(b.sx + 13, 6, Math.max(6, W - 6 - b.tw)), clamp(b.sy, 12, H - 12), hot ? late : a * 0.9, hot);
          }
        }
      }

      /* the current role: pulse, leader line, callout */
      const b = beacons[active];
      if (!b) { ctx.globalAlpha = 1; return; }
      const show = late * easeOutCubic(actT);
      ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      if (env.reduced) { ctx.globalAlpha = 0.7 * late; ring(b.sx, b.sy, 11); }
      else {
        for (let k = 0; k < 2; k++) {
          const u = (time * 0.6 + k * 0.5) % 1;
          ctx.globalAlpha = Math.pow(1 - u, 1.6) * 0.75 * late;
          ring(b.sx, b.sy, 6 + u * 20);
        }
        if (burst < 1) {
          ctx.strokeStyle = INK;
          ctx.globalAlpha = (1 - burst) * 0.6 * late;
          ring(b.sx, b.sy, 8 + easeOutCubic(burst) * 40);
        }
      }
      ctx.globalAlpha = late; ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(b.sx, b.sy, 3.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ring(b.sx, b.sy, 6.5);
      if (focus === active) { ctx.strokeStyle = FOCUS; ring(b.sx, b.sy, 11); }

      const tx = clamp(b.sx + 26, 10, Math.max(10, W - 10 - b.tw));
      const ty = b.sy - 28 < 16 ? b.sy + 30 : b.sy - 28;
      if (ax === null || env.reduced) { ax = tx; ay = ty; }
      else { ax = damp(ax, tx, 12, dt); ay = damp(ay, ty, 12, dt); }
      const jy = ay < b.sy ? ay + 11 : ay - 11;
      const ux0 = ax - 5, ux1 = ax + b.tw + 5, jx = clamp(b.sx + 14, ux0, ux1);
      const ldx = jx - b.sx, ldy = jy - b.sy, ld = Math.hypot(ldx, ldy) || 1;
      ctx.globalAlpha = 0.7 * show; ctx.strokeStyle = INK; ctx.lineWidth = 1;
      ctx.beginPath();
      if (ld > 10) { ctx.moveTo(b.sx + ldx / ld * 8, b.sy + ldy / ld * 8); ctx.lineTo(jx, jy); }
      ctx.moveTo(ux0, jy); ctx.lineTo(ux1, jy);
      ctx.stroke();
      plate(b, ax, ay, show, true);
      ctx.globalAlpha = 1;
    }

    canvas.addEventListener('pointerdown', e => {
      if (e.button) return;
      dragging = true; pid = e.pointerId;
      lastX = e.clientX; lastY = e.clientY; dragDX = 0; dragDY = 0; travel = 0; downT = performance.now();
      const pt = localPos(e);
      mx = pt.x; my = pt.y; ptrIn = true;
      try { canvas.setPointerCapture(pid); } catch (err) {}
      wrap.classList.add('is-grabbing');
      dirty = true;
    });
    canvas.addEventListener('pointermove', e => {
      const pt = localPos(e);
      mx = pt.x; my = pt.y;
      if (dragging && e.pointerId === pid) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        dragDX += dx; dragDY += dy; travel += Math.abs(dx) + Math.abs(dy);
      } else if (e.pointerType !== 'touch') {
        ptrIn = true;
        const h = hit(mx, my, 22);
        if (h !== hover) { hover = h; wrap.classList.toggle('is-over', h > -1); }
      }
      dirty = true;
    }, { passive: true });
    function release(e, cancelled) {
      if (!dragging || e.pointerId !== pid) return;
      dragging = false;
      wrap.classList.remove('is-grabbing');
      try { canvas.releasePointerCapture(pid); } catch (err) {}
      const touch = e.pointerType === 'touch';
      if (touch) ptrIn = false;
      if (env.reduced) { vyaw = 0; vpitch = 0; }
      if (!cancelled && travel < 8 && performance.now() - downT < 600) {
        const pt = localPos(e);
        const h = hit(pt.x, pt.y, touch ? 32 : 24);
        if (h > -1) onPick(h);
      }
      dirty = true;
    }
    canvas.addEventListener('pointerup', e => release(e, false));
    canvas.addEventListener('pointercancel', e => release(e, true));
    canvas.addEventListener('pointerleave', () => {
      if (dragging) return;
      ptrIn = false;
      if (hover !== -1) { hover = -1; wrap.classList.remove('is-over'); }
      dirty = true;
    });

    fit();
    onVisible(canvas, v => { visible = v; if (v) dirty = true; });
    bus.on('resize', fit);
    bus.on('lite', fit);
    bus.on('measure', () => { if (canvas.clientWidth !== W || canvas.clientHeight !== H) fit(); });
    bus.on('sector', () => { dirtyUntil = state.time + 3; });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { stale = true; dirty = true; }).catch(() => {});

    GK.ticker.add((s, dt) => {
      if (!visible || !started || s.paused) return;
      if (!ready) {
        if (s.time < nextFit) return;
        nextFit = s.time + 1;
        fit();
        if (!ready) return;
      }
      if (env.reduced) {
        if (!dirty && s.time > dirtyUntil) return;
        dirty = false;
        step(0);
        draw(s.time, 0);
      } else {
        /* lite: ~30 fps while idle, full rate while dragging */
        if (env.lite && !dragging && !dirty) {
          liteAcc += dt;
          if (liteAcc < 1 / 31) return;
          dt = Math.min(liteAcc, 0.1);
        }
        liteAcc = 0;
        dirty = false;
        step(dt);
        draw(s.time, dt);
      }
    }, 16);

    return {
      start(delay) {
        if (started) return;
        started = true;
        t0 = state.time + (env.reduced ? 0 : delay || 0);
        dirty = true;
        setTimeout(fit, 1500);
      },
      setActive(i, manual) {
        if (!beacons[i]) return;
        const b = beacons[i];
        if (manual && !env.reduced) {
          /* steer globe so beacon (lon, lat) faces forward (+z) */
          steerYaw = Math.PI / 2 - b.lon - 0.22;
          steerPitch = clamp(b.lat * 0.55 + 0.15, -0.75, 0.75);
          steerTimer = 1.6;
        }
        if (i === active) { dirty = true; return; }
        active = i; actT = env.reduced ? 1 : 0; burst = env.reduced ? 1 : 0; ax = null; dirty = true;
      },
      setFocus(i) { focus = i; dirty = true; },
    };
  }

  /* ───────────────────────── sector 1 · role ───────────────────────── */
  function initRole(GK) {
    const { clamp, esc, pad, qs, qsa, onVisible } = GK.util;
    const env = GK.env, bus = GK.bus;
    const panel = byId('p1');
    if (!panel) return;
    const roles = GK.data && Array.isArray(GK.data.roles) ? GK.data.roles.slice() : [];
    if (!roles.length) return;

    const n = roles.length, PERIOD = 2.6;
    const typed = byId('roleTyped'), count = byId('roleCount'), bar = byId('roleBar');
    const list = byId('roleList'), picks = byId('rolePicks'), canvas = byId('roleCanvas');
    const signal = qs('.role-signal', panel), holoWrap = qs('.role-holo', panel);
    let current = 0, timer = 0, live = false, visible = false, lastBar = -1;

    if (list) list.innerHTML = roles.map(r => '<li>' + esc(r) + '</li>').join('');
    if (picks) {
      picks.innerHTML = roles.map((r, i) =>
        '<button type="button" class="role-pick" data-role="' + i + '" data-sfx="none" data-sfx-hover="none" aria-pressed="' + (i === 0) + '"><span>' + pad(i + 1) + '</span>' + esc(r) + '</button>').join('');
    }
    const visitedRoles = new Set([0]);
    const pickBtns = picks ? qsa('.role-pick', picks) : [];
    if (typed) typed.textContent = roles[0];
    const label = i => pad(i + 1) + ' / ' + pad(n);
    if (count) count.textContent = label(0);

    let holo = null;
    function setRole(i, manual) {
      current = ((i % n) + n) % n;
      timer = manual ? -4.5 : 0;
      if (typed) {
        if (GK.fx && GK.fx.decode) GK.fx.decode(typed, roles[current]);
        else typed.textContent = roles[current];
      }
      if (count) count.textContent = label(current);
      pickBtns.forEach((b, k) => b.setAttribute('aria-pressed', k === current ? 'true' : 'false'));
      if (holo) holo.setActive(current, !!manual);
      if (manual) {
        GK.sfx('ping', { i: current });
        visitedRoles.add(current);
        if (visitedRoles.size >= 3 && GK.unlockObjective) GK.unlockObjective('full-spectrum');
      }
    }

    if (canvas && holoWrap) holo = createHolo(GK, canvas, holoWrap, roles, i => setRole(i, true));

    if (picks) {
      picks.addEventListener('click', e => {
        const b = e.target.closest ? e.target.closest('.role-pick') : null;
        if (b) setRole(parseInt(b.dataset.role, 10) || 0, true);
      });
      picks.addEventListener('focusin', e => {
        const b = e.target.closest ? e.target.closest('.role-pick') : null;
        if (b && holo) holo.setFocus(parseInt(b.dataset.role, 10) || 0);
      });
      picks.addEventListener('focusout', () => { if (holo) holo.setFocus(-1); });
    }

    function goLive() {
      if (live) return;
      live = true; timer = 0;
      if (typed && GK.fx && GK.fx.decode) GK.fx.decode(typed, roles[current]);
    }
    bus.on('reveal', node => {
      if (node === signal) goLive();
      else if (node === holoWrap && holo) holo.start(0.3);
    });
    const fallback = () => {
      if (document.documentElement.classList.contains('has-reveal')) return;
      goLive();
      if (holo) holo.start(0);
    };
    if (GK.state.entered) fallback(); else bus.once('enter', fallback);

    onVisible(panel, v => { visible = v; });
    GK.ticker.add((s, dt) => {
      if (!visible || !live || env.reduced || s.paused || s.modalOpen) return;
      timer += dt;
      if (timer >= PERIOD) setRole(current + 1, false);
      if (bar) {
        const v = clamp(timer / PERIOD);
        if (Math.abs(v - lastBar) > 0.004) { lastBar = v; bar.style.transform = 'scaleX(' + v.toFixed(3) + ')'; }
      }
    }, 14);
  }

  GK.register('voyage-a', function init(GK) {
    [initHero, initRole].forEach(fn => {
      try { fn(GK); } catch (e) { console.error('[GK] voyage-a: ' + fn.name + ' failed', e); }
    });
  });
})();
