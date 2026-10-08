/* ═══════════════════════════════════════════════════════════════
   VOYAGER · voyage-c.js
   Sector 04 MISSIONS    — work list + cursor-following preview
   Sector 05 TELEMETRY   — four stat gauges
   Sector 06 DEPLOYMENTS — internship "deployment logs"

   Everything is rendered from GK.data; items open in GK.modal.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const GK = window.GK;
  if (!GK || typeof GK.register !== 'function') return;

  GK.register('voyage-c', function init(GK) {
    const U = GK.util, env = GK.env, bus = GK.bus;
    const data = GK.data || {};
    const esc = U.esc, clamp = U.clamp, damp = U.damp;
    const root = document.documentElement;
    const list = v => (Array.isArray(v) ? v : []);

    const SVG = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
    const ICON = {
      arrow: '<svg ' + SVG + ' width="16" height="16"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>',
      play: '<svg ' + SVG + ' width="10" height="10"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    };

    /* cb() once, when fx.js reveals `node` (or, if fx.js is not running, when it
       first scrolls into view after the visitor has passed the loader). */
    function whenRevealed(node, cb) {
      let done = false, off = function () {};
      const fire = () => { if (done) return; done = true; off(); cb(); };
      if (node.classList.contains('is-in')) { fire(); return; }
      off = bus.on('reveal', n => { if (n === node) fire(); });
      if (root.classList.contains('has-reveal')) return;
      const watch = () => {
        let stop = function () {};
        stop = U.onVisible(node, visible => { if (visible) { stop(); fire(); } }, { rootMargin: '0px' });
        if (done) stop();
      };
      if (GK.state.entered) watch(); else bus.once('enter', watch);
    }

    /* ─────────────────────────────────────────────────────────────
       04 · MISSIONS
       ───────────────────────────────────────────────────────────── */
    function initMissions() {
      const host = document.getElementById('workList');
      const projects = list(data.projects);
      if (!host || !projects.length) return;
      const section = host.closest('.panel') || host;
      const total = U.pad(projects.length);

      const meta = document.getElementById('workMeta');
      if (meta) meta.textContent = total + ' projects · ' + (env.fine ? 'click' : 'tap') + ' to open';

      const typeLine = p => [p.type, p.year].filter(Boolean).join(' · ');
      /* desktop rows arrive as one staggered group; stacked cards reveal one by one as they scroll in */
      const grouped = env.fine && window.innerWidth >= 880;

      host.innerHTML =
        '<div class="missions-head hud-label legible" aria-hidden="true" data-reveal="fade" data-delay="150">' +
          '<span>No.</span><span>Project</span><span>Brief</span><span>Stack</span><span></span>' +
        '</div>' +
        '<ol class="missions"' + (grouped ? ' data-reveal-group="70"' : '') + '>' +
        projects.map((p, i) => {
          const title = p.listTitle || p.title || '';
          const line = typeLine(p);
          const tags = list(p.listTags || p.tags).map(t => '<span class="mission-tag">' + esc(t) + '</span>').join('');
          return '<li class="mission-item"' + (grouped ? '' : ' data-reveal') + '>' +
            '<button type="button" class="mission" data-index="' + i + '" data-cursor="OPEN BRIEFING"' +
              ' aria-label="' + esc(title + (line ? ' — ' + line : '') + '. Open briefing') + '" aria-describedby="missionDesc' + i + '">' +
              (p.thumb ? '<span class="mission-thumb" aria-hidden="true"><img src="' + esc(p.thumb) + '" alt="" width="720" height="405" loading="lazy" decoding="async" /></span>' : '') +
              '<span class="mission-num" aria-hidden="true">' + esc(p.num || U.pad(i + 1)) + '</span>' +
              '<span class="mission-main">' +
                '<span class="mission-title" data-text="' + esc(title) + '"><span>' + esc(title) + '</span></span>' +
                '<span class="mission-meta">' +
                  (line ? '<span>' + esc(line) + '</span>' : '') +
                  (p.video ? '<span class="mission-footage">' + ICON.play + 'Footage</span>' : '') +
                '</span>' +
              '</span>' +
              '<span class="mission-desc" id="missionDesc' + i + '">' + esc(p.short || p.desc || '') + '</span>' +
              '<span class="mission-tags">' + tags + '</span>' +
              '<span class="mission-arrow" aria-hidden="true">' + ICON.arrow + '</span>' +
            '</button>' +
          '</li>';
        }).join('') +
        '</ol>';

      const ol = host.querySelector('.missions');

      /* rows (fine pointer + wide) or cards (touch / narrow) */
      let rowMode = false;
      function applyMode() {
        rowMode = env.fine && window.innerWidth >= 880;
        host.classList.toggle('is-cards', !rowMode);
        if (!rowMode) { hoverRow = null; focusRow = null; sync(); }
      }

      /* ── cursor-following preview ── */
      const PW = 360, PH = 225, EDGE = 12, TOP = 84;
      const pv = { el: null, imgs: [], idx: null, type: null, foot: null, shown: false, live: false, active: -1, z: 1,
        x: 0, y: 0, r: 0, left: false, snap: true, dock: false, dockX: 0, dockDocY: 0, hideT: 0 };
      let hoverRow = null, focusRow = null, activeRow = null;
      let mx = env.w / 2, my = env.h / 2, vw = window.innerWidth, vh = window.innerHeight;
      let suppressed = false, scrolled = false, muteDock = false, stopTick = null;

      function buildPreview() {
        if (pv.el || !env.fine) return;
        const stack = U.el('div', { class: 'mission-preview-stack' });
        projects.forEach((p, i) => {
          if (!p.thumb) { pv.imgs.push(null); return; }
          const img = U.el('img', { class: 'mission-preview-img', alt: '', width: 720, height: 450, decoding: 'async' });
          img.addEventListener('error', () => { pv.imgs[i] = null; if (img.parentNode) img.parentNode.removeChild(img); if (pv.active === i && pv.el) pv.el.classList.add('is-blank'); });
          img.src = p.thumb;
          pv.imgs.push(img);
          stack.appendChild(img);
        });
        pv.idx = U.el('span', { class: 'mission-preview-idx' });
        pv.type = U.el('span', { class: 'mission-preview-type' });
        pv.foot = U.el('span', { class: 'mission-preview-foot' });
        pv.el = U.el('div', { class: 'mission-preview', 'aria-hidden': 'true' }, [
          U.el('div', { class: 'mission-preview-body brackets' }, [
            U.el('div', { class: 'mission-preview-frame' }, [stack, pv.foot, U.el('div', { class: 'mission-preview-cap' }, [pv.idx, pv.type])]),
          ]),
        ]);
        document.body.appendChild(pv.el);
      }

      function swapImage(i) {
        const p = projects[i], img = pv.imgs[i];
        pv.active = i;
        pv.el.classList.toggle('is-blank', !img);
        if (img) {
          img.classList.add('is-reset');
          img.classList.remove('is-on');
          img.style.zIndex = String(++pv.z);
          void img.offsetWidth; // commit the hidden state so the wipe restarts (once per row change)
          img.classList.remove('is-reset');
          img.classList.add('is-on');
        }
        pv.idx.textContent = (p.num || U.pad(i + 1)) + ' / ' + total;
        pv.type.textContent = typeLine(p);
        pv.foot.textContent = p.video ? 'Footage' + (p.videoLength ? ' ' + p.videoLength : '') : '';
        pv.foot.hidden = !p.video;
      }

      function showPreview(i) {
        buildPreview();
        if (!pv.el) return;
        clearTimeout(pv.hideT);
        if (!pv.live) { pv.live = true; pv.snap = true; stopTick = GK.ticker.add(tick, 14); }
        if (!pv.shown) { pv.shown = true; if (!suppressed) pv.el.classList.add('is-on'); }
        if (i !== pv.active) swapImage(i);
      }

      function hidePreview() {
        if (!pv.el || !pv.shown) return;
        pv.shown = false;
        pv.el.classList.remove('is-on');
        clearTimeout(pv.hideT);
        pv.hideT = setTimeout(() => {
          if (stopTick) { stopTick(); stopTick = null; }
          pv.live = false; pv.active = -1; pv.z = 1; pv.r = 0;
          pv.imgs.forEach(img => { if (img) { img.classList.remove('is-on'); img.style.zIndex = ''; } });
        }, 340);
      }

      function measureDock(row) {
        const r = row.getBoundingClientRect();
        pv.dockX = Math.max(EDGE, r.right - PW - 76);
        pv.dockDocY = r.top + window.scrollY + r.height / 2 - PH / 2;
      }

      /* one place decides which row is "hot": the pointer wins over keyboard focus */
      function sync() {
        const row = hoverRow || focusRow;
        if (row !== activeRow) {
          if (activeRow) activeRow.classList.remove('is-active');
          activeRow = row;
          if (row) row.classList.add('is-active');
          if (ol) ol.classList.toggle('is-hot', !!row);
        }
        if (!row) { hidePreview(); return; }
        pv.dock = !hoverRow;
        if (pv.dock) measureDock(row);
        showPreview(parseInt(row.dataset.index, 10) || 0);
      }

      function rowAt(x, y) {
        const node = document.elementFromPoint(x, y);
        const row = node && node.closest ? node.closest('.mission') : null;
        return row && ol.contains(row) ? row : null;
      }

      function tick(state, dt) {
        if (!pv.el) return;
        /* the page moved under a resting pointer: re-check what it is over once scrolling settles */
        if (Math.abs(state.velocity) > 40) scrolled = true;
        else if (scrolled) { scrolled = false; if (hoverRow) { hoverRow = rowAt(mx, my); sync(); } }

        const fast = state.speed > 0.2 || state.warp > 0.02;
        if (fast !== suppressed) { suppressed = fast; pv.el.classList.toggle('is-on', pv.shown && !fast); }

        let tx, ty;
        if (pv.dock) { tx = pv.dockX; ty = pv.dockDocY - state.scrollY; }
        else {
          if (!pv.left && mx > vw * 0.6) pv.left = true;
          else if (pv.left && mx < vw * 0.54) pv.left = false;
          tx = pv.left ? mx - 28 - PW : mx + 28;
          ty = my + 28;
        }
        tx = clamp(tx, EDGE, Math.max(EDGE, vw - PW - EDGE));
        ty = clamp(ty, TOP, Math.max(TOP, vh - PH - EDGE));

        if (pv.snap || env.reduced) { pv.x = tx; pv.y = ty; pv.r = 0; pv.snap = false; }
        else {
          /* 0.12 per frame at 60fps ⇒ λ ≈ 7.67; the lag doubles as horizontal velocity for the swing */
          pv.x = damp(pv.x, tx, 7.67, dt);
          pv.y = damp(pv.y, ty, 7.67, dt);
          pv.r = damp(pv.r, clamp((tx - pv.x) * 0.04, -8, 8), 10, dt);
        }
        pv.el.classList.toggle('is-left', pv.left && !pv.dock);
        pv.el.style.transform = 'translate3d(' + pv.x.toFixed(1) + 'px,' + pv.y.toFixed(1) + 'px,0) rotate(' + pv.r.toFixed(2) + 'deg)';
      }

      function dismiss() { hoverRow = null; focusRow = null; muteDock = true; sync(); }

      if (ol) {
        if (env.fine) {
          const track = e => { mx = e.clientX; my = e.clientY; };
          ol.addEventListener('pointerover', e => {
            if (e.pointerType === 'touch' || !rowMode) return;
            track(e);
            const row = e.target.closest ? e.target.closest('.mission') : null;
            if (row && row !== hoverRow) { hoverRow = row; sync(); }
          }, { passive: true });
          ol.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') track(e); }, { passive: true });
          ol.addEventListener('pointerleave', () => { if (hoverRow) { hoverRow = null; sync(); } });
          ol.addEventListener('keydown', () => { muteDock = false; });
          ol.addEventListener('focusin', e => {
            const row = e.target.closest ? e.target.closest('.mission') : null;
            if (!row || !rowMode || muteDock) return;
            let keyboard = false;
            try { keyboard = row.matches(':focus-visible'); } catch (err) { keyboard = false; }
            if (keyboard) { focusRow = row; sync(); }
          });
          ol.addEventListener('focusout', () => { if (focusRow) { focusRow = null; sync(); } });

          bus.on('modal:open', dismiss);
          bus.on('overlay:open', dismiss);
          bus.on('nav', dismiss);
          bus.on('visibility', v => { if (v && v.hidden) dismiss(); });

          /* thumbnails for the preview are fetched only once the sector is within one viewport */
          let stopWatch = function () {};
          stopWatch = U.onVisible(section, visible => { if (visible) { stopWatch(); buildPreview(); } }, { rootMargin: '100% 0px' });
          if (pv.el) stopWatch();
        }

        ol.addEventListener('click', e => {
          const row = e.target.closest ? e.target.closest('.mission') : null;
          if (!row) return;
          const item = projects[parseInt(row.dataset.index, 10)];
          if (!item) return;
          dismiss();
          GK.modal.open(item, { from: row, collection: projects });
        });
      }

      bus.on('resize', () => { vw = window.innerWidth; vh = window.innerHeight; applyMode(); if (focusRow) sync(); });
      applyMode();
      GK.scan(host);
    }

    /* ─────────────────────────────────────────────────────────────
       05 · TELEMETRY
       ───────────────────────────────────────────────────────────── */
    function initGauges() {
      const host = document.getElementById('metricsGrid');
      const metrics = list(data.metrics);
      if (!host || !metrics.length) return;

      const CX = 80, CY = 80, R = 60, A0 = 135, SWEEP = 270;
      const pt = (deg, r) => { const a = (deg * Math.PI) / 180; return (CX + r * Math.cos(a)).toFixed(2) + ' ' + (CY + r * Math.sin(a)).toFixed(2); };
      const arc = (a1, a2) => 'M' + pt(a1, R) + 'A' + R + ' ' + R + ' 0 ' + (a2 - a1 > 180 ? 1 : 0) + ' 1 ' + pt(a2, R);

      let minor = '', major = '';
      for (let i = 0; i <= 27; i++) {
        const a = A0 + i * 10, big = i % 9 === 0;
        const d = 'M' + pt(a, 69) + 'L' + pt(a, big ? 76 : 73);
        if (big) major += d; else minor += d;
      }
      const ticks = '<path class="gauge-ticks" d="' + minor + '"/><path class="gauge-ticks gauge-ticks-major" d="' + major + '"/>';

      host.innerHTML = metrics.map(m => {
        const value = Number(m.value) || 0, suffix = m.suffix || '';
        const segmented = suffix !== '%' && value === Math.floor(value) && value >= 1 && value <= 12;
        let dial;
        if (segmented) {
          const gap = value > 1 ? 4 : 0, span = (SWEEP - gap * (value - 1)) / value;
          dial = '';
          for (let k = 0; k < value; k++) {
            const a1 = A0 + k * (span + gap);
            dial += '<path class="gauge-seg" style="--k:' + k + '" d="' + arc(a1, a1 + span) + '"/>';
          }
        } else {
          const pct = suffix === '%' ? clamp(value, 0, 100) : 100;
          dial = '<path class="gauge-track" d="' + arc(A0, A0 + SWEEP) + '"/>' +
            '<path class="gauge-arc" pathLength="100" style="--rest:' + (100 - pct) + '" d="' + arc(A0, A0 + SWEEP) + '"/>';
        }
        return '<li class="gauge" data-n="' + (segmented ? value : 1) + '">' +
          '<span class="sr-only">' + esc(value + suffix + ' ' + (m.label || '')) + '</span>' +
          '<div class="gauge-dial" aria-hidden="true">' +
            '<svg class="gauge-svg" viewBox="0 0 160 160" width="160" height="160" focusable="false">' + ticks + dial + '</svg>' +
            '<span class="gauge-num" data-count="' + esc(value) + '" data-suffix="' + esc(suffix) + '" data-duration="1400">' + esc(value + suffix) + '</span>' +
            '<span class="gauge-end gauge-min">0</span><span class="gauge-end gauge-max">' + esc(value) + '</span>' +
          '</div>' +
          '<span class="gauge-label" aria-hidden="true">' + esc(m.label || '') + '</span>' +
        '</li>';
      }).join('');

      const gauges = U.qsa('.gauge', host).map(el => ({ el, num: el.querySelector('.gauge-num'), n: parseInt(el.dataset.n, 10) || 1, live: false, busyUntil: 0 }));

      function play(g, replay) {
        const now = performance.now();
        if (replay) {
          if (env.reduced || !g.live || now < g.busyUntil) return;
          g.el.classList.remove('is-live');
          void g.el.offsetWidth; // restart the sweep (one read per hover)
          g.el.style.setProperty('--step', Math.round(Math.min(120, 360 / g.n)) + 'ms');
          g.el.style.setProperty('--sweep', '600ms');
          if (g.num && GK.fx && GK.fx.count) { g.num.dataset.duration = '600'; GK.fx.count(g.num); }
          g.busyUntil = now + 720;
          GK.sfx('tick');
        } else {
          g.live = true;
          g.busyUntil = now + 1700;
        }
        g.el.classList.add('is-live');
      }

      gauges.forEach(g => {
        g.el.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') play(g, true); });
        g.el.addEventListener('click', () => play(g, true));
      });

      whenRevealed(host, () => {
        gauges.forEach((g, i) => {
          if (env.reduced) { play(g, false); return; }
          setTimeout(() => { play(g, false); GK.sfx('chime', { i }); }, 160 + i * 110);
        });
        if (env.reduced) GK.sfx('chime', { i: 0 });
      });

      GK.scan(host);
    }

    /* ─────────────────────────────────────────────────────────────
       06 · DEPLOYMENTS
       ───────────────────────────────────────────────────────────── */
    function initDeployments() {
      const host = document.getElementById('internList');
      const items = list(data.internships);
      if (!host || !items.length) return;

      const meta = document.getElementById('internMeta');
      if (meta) meta.textContent = U.pad(items.length) + ' experiences · certificates on file';

      host.innerHTML = items.map((it, i) => {
        const strip = ['Deployment ' + U.pad(i + 1), it.period, it.place].filter(Boolean);
        const tags = list(it.tags);
        return '<article class="deploy glass" data-tilt="4" data-spot data-reveal data-delay="' + i * 140 + '" aria-labelledby="deployTitle' + i + '">' +
          '<p class="deploy-strip">' + strip.map((s, k) => '<span' + (k === 0 ? ' class="deploy-idx"' : '') + '>' + esc(s) + '</span>').join('') + '</p>' +
          '<h3 class="deploy-title" id="deployTitle' + i + '">' + esc(it.title || '') + '</h3>' +
          (it.org ? '<p class="deploy-org">' + esc(it.org) + '</p>' : '') +
          '<p class="deploy-desc">' + esc(it.desc || '') + '</p>' +
          (tags.length
            ? '<div class="deploy-log">' +
                '<p class="deploy-log-head" aria-hidden="true"><span>Skills log</span><span>' + U.pad(tags.length) + ' entries</span></p>' +
                '<ul class="deploy-lines" aria-label="Skills used">' +
                  tags.map((t, k) => '<li class="deploy-line" style="--k:' + k + '"><span class="deploy-ok" aria-hidden="true">[OK]</span><span>' + esc(t) + '</span></li>').join('') +
                '</ul>' +
              '</div>'
            : '') +
          '<div class="deploy-foot">' +
            '<button type="button" class="btn deploy-btn" data-index="' + i + '" data-cursor="OPEN" data-cursor-lock>View certificate <span class="arrow" aria-hidden="true">' + ICON.arrow + '</span></button>' +
          '</div>' +
        '</article>';
      }).join('');

      host.addEventListener('click', e => {
        const btn = e.target.closest ? e.target.closest('.deploy-btn') : null;
        if (!btn) return;
        const item = items[parseInt(btn.dataset.index, 10)];
        if (item) GK.modal.open(item, { from: btn, collection: items });
      });

      /* the log prints line by line once its card is revealed; one soft tick per line, never overlapping */
      let lastTick = 0;
      U.qsa('.deploy', host).forEach((card, i) => {
        whenRevealed(card, () => {
          const lead = env.reduced ? 0 : 380 + i * 140;
          card.style.setProperty('--log-delay', lead + 'ms');
          card.classList.add('is-logged');
          if (env.reduced) return;
          const lines = card.querySelectorAll('.deploy-line').length;
          let k = 0;
          const step = () => {
            if (k >= lines) return;
            const now = performance.now();
            if (now - lastTick > 55) { lastTick = now; GK.sfx('tick', { i: k }); }
            k++;
            setTimeout(step, 70);
          };
          setTimeout(step, lead);
        });
      });

      GK.scan(host);
    }

    /* each sector stands alone: a fault in one never blanks the other two */
    [initMissions, initGauges, initDeployments].forEach(fn => {
      try { fn(); } catch (err) { console.error('[GK] voyage-c: ' + fn.name + ' failed', err); }
    });
  });
})();
