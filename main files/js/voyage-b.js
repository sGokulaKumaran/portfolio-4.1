/* ═══════════════════════════════════════════════════════════════
   VOYAGER · voyage-b.js
   Sector 2 "Crew" (about)      — crew dossier with an x-ray lens.
   Sector 3 "Trajectory" (edu)  — a flight path drawn by scroll,
                                  two waypoints that ignite as the
                                  ship passes them.

   Content comes from GK.data (person, tags, education). Geometry is
   measured on the bus 'measure' event and cached; the single ticker
   task only interpolates pre-sampled points.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const GK = window.GK;
  if (!GK || typeof GK.register !== 'function') return;

  GK.register('voyage-b', function init(GK) {
    const { clamp, damp, esc, el, pad, qs, qsa, onVisible, easeInOutCubic } = GK.util;
    const env = GK.env, bus = GK.bus, data = GK.data || {};
    const doc = document;

    /* one sector failing must never take the other one down */
    const guard = (name, fn) => {
      try { fn(); } catch (e) { console.error('[GK] voyage-b: ' + name + ' failed to initialise', e); }
    };
    guard('crew', initCrew);
    guard('trajectory', initTrajectory);

    /* ─────────────────────── sector 2 · crew ─────────────────────── */
    function initCrew() {
      const person = data.person || {};
      const fig = doc.getElementById('aboutDossier');
      const photo = doc.getElementById('aboutPhoto');
      const lines = doc.getElementById('aboutData');
      const tags = doc.getElementById('aboutTags');
      const tagCount = doc.getElementById('aboutTagCount');
      const hint = doc.getElementById('aboutHint');

      /* dossier data lines */
      if (lines) {
        const rows = [
          { k: 'Crew 01', v: person.name, cls: 'is-name' },
          { k: 'Role', v: person.title },
          { k: 'Base', v: person.location },
          { k: 'Status', v: person.status, cls: 'is-status' },
        ].filter(r => r.v);
        lines.innerHTML = rows.map(r =>
          '<div class="dossier-row' + (r.cls ? ' ' + r.cls : '') + '">' +
            '<dt>' + esc(r.k) + '</dt>' +
            '<dd>' + (r.cls === 'is-status' ? '<span class="dot" aria-hidden="true"></span>' : '') + '<span>' + esc(r.v) + '</span></dd>' +
          '</div>').join('');
        GK.scan(lines);
      }

      /* loadout chips */
      if (tags && Array.isArray(data.tags) && data.tags.length) {
        tags.innerHTML = data.tags.map(t => '<li class="chip">' + esc(t) + '</li>').join('');
        if (tagCount) tagCount.textContent = pad(data.tags.length);
        GK.scan(tags);
      }

      /* x-ray lens */
      const view = fig ? qs('.dossier-view', fig) : null;
      if (!fig || !view || !photo) return;
      const src = person.photo || photo.getAttribute('src');
      if (!src) return;
      if (photo.getAttribute('src') !== src) photo.setAttribute('src', src);

      const xray = el('img', {
        class: 'dossier-xray', loading: 'lazy', decoding: 'async', alt: '', 'aria-hidden': 'true', draggable: 'false',
        width: photo.getAttribute('width'), height: photo.getAttribute('height'), src: src,
      });
      photo.insertAdjacentElement('afterend', xray);
      if (hint) hint.textContent = env.fine ? 'X-ray · move to scan' : 'X-ray · touch to scan';

      /* The lens reads --lx / --ly, which default to the --mx / --my that fx.js feeds on hover.
         The automatic sweep and touch scanning override them inline, then hand control back. */
      let stopSweep = null, clearTimer = 0, hideTimer = 0, touching = false, box = null;
      const place = (x, y) => { fig.style.setProperty('--lx', x); fig.style.setProperty('--ly', y); };
      const release = () => { fig.style.removeProperty('--lx'); fig.style.removeProperty('--ly'); };
      const cancelSweep = () => { if (stopSweep) { stopSweep(); stopSweep = null; } };
      function lensOff(immediate) {
        fig.classList.remove('is-scanning');
        clearTimeout(clearTimer);
        if (immediate) release(); else clearTimer = setTimeout(release, 420); // after the fade-out
      }

      /* one pass across the face once the portrait has wiped in */
      function sweep() {
        if (stopSweep) return;
        const t0 = GK.state.time + 1.05, dur = 1.8;
        let on = false;
        stopSweep = GK.ticker.add(state => {
          if (fig.classList.contains('is-spot')) { cancelSweep(); lensOff(true); return; } // the pointer took over
          const t = (state.time - t0) / dur;
          if (t < 0) return;
          if (t >= 1) { cancelSweep(); lensOff(false); return; }
          if (!on) { on = true; clearTimeout(clearTimer); fig.classList.add('is-scanning'); }
          const k = easeInOutCubic(t);
          place((14 + 72 * k).toFixed(2) + '%', (27 + 9 * k - 5 * Math.sin(k * Math.PI)).toFixed(2) + '%');
        }, 14);
      }
      if (!env.reduced) {
        const off = bus.on('reveal', node => { if (node === fig) { off(); sweep(); } });
      }

      /* touch / pen (and mouse where fx.js has no hover tracking): press and drag to scan */
      const follow = e => {
        if (box) place((e.clientX - box.left).toFixed(1) + 'px', (e.clientY - box.top).toFixed(1) + 'px');
      };
      const lift = () => {
        if (!touching) return;
        touching = false;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => lensOff(false), 900);
      };
      view.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && env.fine) return; // hover already drives the lens
        cancelSweep();
        clearTimeout(hideTimer);
        clearTimeout(clearTimer);
        touching = true;
        box = view.getBoundingClientRect();
        follow(e);
        fig.classList.add('is-scanning');
      }, { passive: true });
      view.addEventListener('pointermove', e => { if (touching) follow(e); }, { passive: true });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => view.addEventListener(type, lift, { passive: true }));
    }

    /* ─────────────────────── sector 3 · trajectory ─────────────────────── */
    function initTrajectory() {
      const sector = doc.getElementById('p2-edu');
      const track = doc.getElementById('eduTrack');
      const list = Array.isArray(data.education) ? data.education.filter(Boolean) : [];
      if (!sector || !track || !list.length) return;

      const count = list.length;
      const duo = count === 2; // two waypoints fly the S-curve on wide screens; any other count stacks
      const roleOf = i => (i === 0 ? 'Origin' : i === count - 1 ? 'Current heading' : 'En route');
      const f = n => Math.round(n * 10) / 10;

      /* ── cards ── */
      const ARROW = '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 9l6-6M4.5 3H9v4.5"/></svg>';
      const cards = list.map((item, i) => {
        const name = item.short || item.title || '';
        const live = /present/i.test(item.period || '');
        const label = 'Waypoint ' + pad(i + 1) + ', ' + roleOf(i) + ': ' + name +
          (item.org ? ', ' + item.org : '') + (item.period ? ', ' + item.period : '') + '. Open briefing';
        return '<li class="edu-point">' +
          '<button type="button" class="waypoint glass" data-i="' + i + '" data-spot data-cursor="OPEN" data-cursor-lock aria-label="' + esc(label) + '">' +
            '<span class="waypoint-thumb">' +
              (item.thumb ? '<img src="' + esc(item.thumb) + '" alt="" width="720" height="309" loading="lazy" decoding="async" draggable="false" />' : '') +
            '</span>' +
            '<span class="waypoint-body">' +
              '<span class="waypoint-tag hud-label"><b>Waypoint ' + pad(i + 1) + '</b><i aria-hidden="true">·</i>' + esc(roleOf(i)) + '</span>' +
              '<span class="waypoint-title">' + esc(name) + '</span>' +
              (item.org ? '<span class="waypoint-org">' + esc(item.org) + '</span>' : '') +
              '<span class="waypoint-foot">' +
                '<span class="waypoint-period">' + (live ? '<span class="dot" aria-hidden="true"></span>' : '') + esc(item.period || '') + '</span>' +
                '<span class="waypoint-open">Open' + ARROW + '</span>' +
              '</span>' +
            '</span>' +
          '</button>' +
        '</li>';
      }).join('');

      /* ── flight-path artwork (decorative; the cards are the DOM equivalent) ── */
      const SVG_NS = 'http://www.w3.org/2000/svg';
      const svgEl = (tag, attrs) => {
        const node = doc.createElementNS(SVG_NS, tag);
        if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
        return node;
      };
      const wrap = el('div', { class: 'traj-wrap', 'aria-hidden': 'true', 'data-reveal': 'fade', 'data-delay': '250' });
      const svg = svgEl('svg', { class: 'traj', focusable: 'false', preserveAspectRatio: 'none' });
      const guide = svgEl('path', { class: 'traj-guide' });
      const path = svgEl('path', { class: 'traj-path' });
      const tail = svgEl('g', { class: 'traj-tail' });
      const dots = [];
      for (let k = 0; k < 5; k++) {
        const c = svgEl('circle', { class: 'traj-dot', r: f(1.8 - k * 0.22) });
        c.style.setProperty('--i', k);
        c.style.setProperty('--o', (0.72 - k * 0.12).toFixed(2));
        tail.appendChild(c);
        dots.push(c);
      }
      svg.appendChild(guide);
      svg.appendChild(path);
      svg.appendChild(tail);
      const nodes = list.map(() => {
        const g = svgEl('g', { class: 'traj-node' });
        const leader = svgEl('line', { class: 'traj-leader' });
        g.appendChild(leader);
        g.appendChild(svgEl('circle', { class: 'traj-node-pulse', r: 28 }));
        g.appendChild(svgEl('circle', { class: 'traj-node-ring', r: 9 }));
        g.appendChild(svgEl('circle', { class: 'traj-node-core', r: 3.5 }));
        svg.appendChild(g);
        return { g, leader };
      });
      const ship = svgEl('g', { class: 'traj-ship' });
      ship.appendChild(svgEl('circle', { class: 'traj-ship-halo', r: 10 }));
      ship.appendChild(svgEl('path', { class: 'traj-ship-body', d: 'M9 0L-6 -5.5L-2.5 0L-6 5.5Z' }));
      svg.appendChild(ship);
      wrap.appendChild(svg);

      const ol = el('ol', { class: 'edu-points', html: cards });
      track.textContent = '';
      track.appendChild(wrap);
      track.appendChild(ol);
      track.classList.toggle('is-duo', duo);
      GK.scan(track);

      const points = qsa('.edu-point', ol);

      /* ── state ── */
      const N = 120; // samples along the path, taken once per layout
      const xs = new Float32Array(N), ys = new Float32Array(N), an = new Float32Array(N);
      const geo = { key: '', ok: false, len: 1, y0: 0, span: 1, left: 0, nx: [], ny: [], th: [] };
      const lit = list.map(() => false);
      let litCount = 0, shown = 0, drawn = -1, wasFlying = false, wasFar = false;

      function ignite(i, live) {
        if (lit[i]) return;
        lit[i] = true;
        litCount++;
        nodes[i].g.classList.add('is-lit');
        points[i].classList.add('is-lit');
        if (live) GK.sfx('lock', { x: geo.left + (geo.nx[i] || 0) });
      }
      function igniteAll() { for (let i = 0; i < count; i++) ignite(i, false); }

      /* s = 0..1 along the pre-sampled path */
      function draw(s) {
        path.style.strokeDashoffset = (geo.len * (1 - s)).toFixed(1);
        const pos = s * (N - 1), i = Math.min(N - 2, Math.floor(pos)), k = pos - i;
        ship.setAttribute('transform',
          'translate(' + (xs[i] + (xs[i + 1] - xs[i]) * k).toFixed(1) + ' ' + (ys[i] + (ys[i + 1] - ys[i]) * k).toFixed(1) + ') ' +
          'rotate(' + (an[i] + (an[i + 1] - an[i]) * k).toFixed(1) + ')');
        const flying = s > 0.004, far = s > 0.985;
        if (flying !== wasFlying) { wasFlying = flying; svg.classList.toggle('is-flying', flying); }
        if (far !== wasFar) { wasFar = far; svg.classList.toggle('is-far', far); }
      }

      /* Build the path from the cards' real layout so waypoints, leaders and curve always line up. */
      function build(W, H, boxes) {
        const last = count - 1;
        const A = boxes[0], B = boxes[last];
        const side = duo && B.y < A.y + A.h && B.x > A.x + A.w; // side by side (desktop) or stacked
        const nx = geo.nx, ny = geo.ny;
        let d, over, tx, ty, heading, bend;

        if (side) {
          /* waypoint A sits above the lower-left card, B below the upper-right card */
          nx[0] = A.x + Math.min(A.w * 0.3, 120); ny[0] = Math.max(30, A.y - 52);
          nx[1] = B.x + B.w * 0.5;                ny[1] = B.y + B.h + 52;
          const ax = nx[0], ay = ny[0], bx = nx[1], by = ny[1];
          const gapL = A.x + A.w, gapR = B.x;
          /* The S may start its dive a little before the cards' corners: find how much of a
             horizontal-handled cubic stays within ~26px of its start level. */
          const frac = clamp(26 / Math.max(1, Math.abs(by - ay)), 0, 0.3);
          let t = Math.sqrt(frac / 3);
          for (let i = 0; i < 3; i++) t = Math.sqrt(frac / (3 - 2 * t));
          const xr = 1.5 * t - 1.5 * t * t + t * t * t;
          const span = Math.max(48, gapR - gapL) / (1 - 2 * xr);
          const mid = (gapL + gapR) / 2;
          const sx = Math.max(mid - span / 2, ax + 24), ex = Math.min(mid + span / 2, bx - 24);
          if (ex - sx >= 40) {
            const hx = (ex - sx) / 2;
            d = 'M' + f(ax) + ' ' + f(ay) + 'L' + f(sx) + ' ' + f(ay) +
                'C' + f(sx + hx) + ' ' + f(ay) + ' ' + f(ex - hx) + ' ' + f(by) + ' ' + f(ex) + ' ' + f(by) +
                'L' + f(bx) + ' ' + f(by);
          } else {
            const mx = (ax + bx) / 2;
            d = 'M' + f(ax) + ' ' + f(ay) + 'C' + f(mx) + ' ' + f(ay) + ' ' + f(mx) + ' ' + f(by) + ' ' + f(bx) + ' ' + f(by);
          }
          nodes[0].leader.setAttribute('y1', 9);  nodes[0].leader.setAttribute('y2', f(Math.max(9, A.y - ay)));
          nodes[1].leader.setAttribute('y1', -9); nodes[1].leader.setAttribute('y2', f(Math.min(-9, B.y + B.h - by)));
          nodes.forEach(n => { n.leader.setAttribute('x1', 0); n.leader.setAttribute('x2', 0); });
        } else {
          /* a straight rail down the left edge, one waypoint beside each card */
          boxes.forEach((b, i) => {
            nx[i] = 20; ny[i] = b.y + 30;
            const ln = nodes[i].leader;
            ln.setAttribute('x1', 9); ln.setAttribute('x2', f(Math.max(9, b.x - 20)));
            ln.setAttribute('y1', 0); ln.setAttribute('y2', 0);
          });
          d = 'M20 ' + f(ny[0]) + 'L20 ' + f(ny[last]);
        }

        /* A→B first, to learn its length; then the overshoot that carries the ship past B */
        path.setAttribute('d', d);
        const lenAB = path.getTotalLength();
        over = Math.max(24, lenAB * 0.115);
        const bx = nx[last], by = ny[last];
        if (side) {
          d += 'Q' + f(bx + over * 0.62) + ' ' + f(by) + ' ' + f(bx + over * 0.95) + ' ' + f(by + over * 0.3);
          tx = bx + over * 0.95; ty = by + over * 0.3;
          heading = Math.atan2(0.3, 0.33); bend = 0.105; // keeps curving toward the lower right
        } else {
          d += 'L20 ' + f(by + over);
          tx = 20; ty = by + over;
          heading = Math.PI / 2; bend = 0;
        }
        path.setAttribute('d', d);
        guide.setAttribute('d', d);
        const len = Math.max(1, path.getTotalLength());
        geo.len = len;
        path.style.strokeDasharray = f(len) + ' ' + f(len);

        for (let i = 0; i < N; i++) {
          const p = path.getPointAtLength((len * i) / (N - 1));
          xs[i] = p.x; ys[i] = p.y;
        }
        for (let i = 0; i < N; i++) {
          const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
          an[i] = (Math.atan2(ys[b] - ys[a], xs[b] - xs[a]) * 180) / Math.PI;
        }

        /* beyond B the path dissolves into dots — still in flight */
        dots.forEach((c, k) => {
          heading += bend;
          const step = 14 - k;
          tx += Math.cos(heading) * step; ty += Math.sin(heading) * step;
          c.setAttribute('cx', f(tx)); c.setAttribute('cy', f(ty));
        });

        /* ignition thresholds: the origin fires just after launch, the rest as the ship passes */
        for (let i = 0; i < count; i++) {
          nodes[i].g.setAttribute('transform', 'translate(' + f(nx[i]) + ' ' + f(ny[i]) + ')');
          const along = i === last ? lenAB / len : side ? 0 : (ny[i] - ny[0]) / len;
          geo.th[i] = i === 0 ? 0.12 : clamp(along, 0.14, 0.97) - 0.004;
        }
        svg.setAttribute('viewBox', '0 0 ' + f(W) + ' ' + f(H));
      }

      function layout() {
        const W = track.clientWidth, H = track.clientHeight;
        if (W < 40 || H < 40) { geo.ok = false; return; }
        const boxes = points.map(li => ({ x: li.offsetLeft, y: li.offsetTop, w: li.offsetWidth, h: li.offsetHeight }));
        const key = [W, H].concat(boxes.map(b => [b.x, b.y, b.w, b.h].join(','))).join('|');
        if (key !== geo.key) {
          try { build(W, H, boxes); geo.ok = true; geo.key = key; }
          catch (e) { geo.ok = false; geo.key = ''; return; }
          drawn = env.reduced ? 1 : shown;
          draw(drawn);
        }

        /* Scroll window for the flight. It starts when the sector's top reaches 80% of the viewport —
           but not before the origin waypoint is on screen — and completes when the sector is centred
           (or sits at the top with the destination already in view). */
        const y = window.scrollY, vh = window.innerHeight;
        const sr = sector.getBoundingClientRect(), tr = track.getBoundingClientRect();
        const top = sr.top + y, tTop = tr.top + y;
        const y1 = Math.min(top + (sr.height - vh) / 2, Math.max(top, tTop + geo.ny[count - 1] - vh * 0.9));
        const y0 = Math.max(top - vh * 0.8, Math.min(tTop + geo.ny[0] - vh * 0.86, y1 - vh * 0.3));
        geo.y0 = y0;
        geo.span = Math.max(1, y1 - y0);
        geo.left = tr.left;
      }

      /* ── interaction ── */
      ol.addEventListener('click', e => {
        const btn = e.target && e.target.closest ? e.target.closest('.waypoint') : null;
        if (!btn) return;
        const item = list[parseInt(btn.dataset.i, 10)];
        if (item) GK.modal.open(item, { from: btn, collection: list });
      });
      points.forEach((li, i) => {
        const hot = () => nodes[i].g.classList.add('is-hot');
        const cool = () => nodes[i].g.classList.remove('is-hot');
        li.addEventListener('pointerenter', hot);
        li.addEventListener('pointerleave', cool);
        li.addEventListener('focusin', hot);
        li.addEventListener('focusout', cool);
      });

      /* ── run ── */
      bus.on('measure', layout);

      if (env.reduced) {
        /* final state, no motion: path drawn, ship beyond B, both cards visible */
        igniteAll();
        layout();
        return;
      }

      let visible = false, armed = !!GK.state.entered;
      if (!armed) bus.once('enter', () => setTimeout(() => { armed = true; }, 380));
      onVisible(sector, v => { visible = v; });
      layout();

      GK.ticker.add((state, dt) => {
        if (!visible) return;
        if (!geo.ok) { if (armed && litCount < count) igniteAll(); return; } // never leave the cards hidden
        const target = armed ? clamp((state.scrollY - geo.y0) / geo.span) : 0;
        shown = damp(shown, target, 5.5, dt);
        if (Math.abs(target - shown) < 0.0006) shown = target;
        if (shown !== drawn) { drawn = shown; draw(shown); }
        if (litCount < count) {
          for (let i = 0; i < count; i++) if (!lit[i] && shown > geo.th[i]) ignite(i, true);
        }
      }, 14);
    }
  });
})();
