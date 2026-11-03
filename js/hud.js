/* ═══════════════════════════════════════════════════════════════
   VOYAGER · hud.js
   The ship's chrome — everything fixed on screen that is not an
   overlay:

     · launch sequence (#loader): real boot log → ENGAGE
     · reticle cursor (fine pointers): dot + ring, lock-on brackets,
       label chip — driven by data-cursor / data-cursor-lock
     · header: nav indicator, audio toggles + live spectrum, star
       chart (the menu below 1100px)
     · HUD readouts, orbit map, bottom rail, scroll progress
     · GK.toast(message, { tone, duration })

   Every part initialises on its own, so one failing piece never
   takes the loader (or the rest of the chrome) down with it.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const GK = window.GK;
  if (!GK || !GK.register) return;

  GK.register('hud', function init(GK) {
    const { clamp, damp, pad, el, qsa } = GK.util;
    const env = GK.env, state = GK.state, bus = GK.bus, SECTORS = GK.SECTORS;
    const doc = document, root = doc.documentElement;
    const $ = id => doc.getElementById(id);
    const now = () => performance.now();
    const guard = (name, fn) => {
      try { fn(); return true; } catch (e) { console.error('[GK] hud: ' + name + ' failed', e); return false; }
    };
    /* text node writer that only touches the DOM when the value changed */
    const writer = node => { let last = null; return text => { if (node && text !== last) { last = text; node.textContent = text; } }; };
    const focusQuiet = node => { try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); } };

    const wideMq = window.matchMedia ? window.matchMedia('(min-width: 1100px)') : null;
    const isWide = () => (wideMq ? wideMq.matches : env.w >= 1100);
    let wide = isWide();
    bus.on('resize', () => { wide = isWide(); });
    /* set by the reticle: re-read data-cursor of whatever it is on (labels can change under a resting pointer) */
    let refreshReticle = function () {};

    /* ───────────────────────── toasts ───────────────────────── */
    function initToasts() {
      const box = $('toasts');
      if (!box) return;
      const live = [];
      function dismiss(t) {
        if (t.gone) return;
        t.gone = true;
        clearTimeout(t.timer);
        const i = live.indexOf(t);
        if (i > -1) live.splice(i, 1);
        t.node.classList.add('is-out');
        setTimeout(() => t.node.remove(), 280);
      }
      GK.toast = function (message, opts) {
        const text = message == null ? '' : String(message).trim();
        if (!text) return function () {};
        const o = opts || {};
        const tone = o.tone === 'ok' || o.tone === 'warn' ? o.tone : 'info';
        const life = clamp(typeof o.duration === 'number' && o.duration > 0 ? o.duration : 2600, 800, 15000);
        const newest = live[live.length - 1];
        if (newest && newest.text === text && newest.tone === tone) {   // same notice again: just keep it up longer
          clearTimeout(newest.timer);
          newest.timer = setTimeout(() => dismiss(newest), life);
          return () => dismiss(newest);
        }
        while (live.length >= 3) dismiss(live[0]);
        const t = { node: el('div', { class: 'toast', 'data-tone': tone, text }), text, tone, gone: false, timer: 0 };
        box.appendChild(t.node);
        live.push(t);
        t.timer = setTimeout(() => dismiss(t), life);
        return () => dismiss(t);
      };
    }

    /* ───────────────────────── loader · launch sequence ─────────────────────────
       A boot log of real checks, then ENGAGE — the gesture that unlocks audio.
       `enter` is emitted synchronously inside the click / key handler.        */
    function initLoader() {
      const loader = $('loader');
      if (!loader) return;
      if (state.entered) { loader.remove(); return; }
      const logEl = $('loaderLog'), bar = $('loaderBar'), pct = $('loaderPct');
      const btn = $('engageBtn'), silent = $('engageSilent'), status = $('loaderStatus'), title = $('loaderTitle');
      if (!btn || !logEl) return;            // markup lost: boot.js's fail-safe enters instead
      GK.loaderReady = true;                 // the loader is ours from here on

      const BOARDED = 'gk5.boarded';
      let repeat = false;
      try { repeat = sessionStorage.getItem(BOARDED) === '1'; } catch (e) { repeat = false; }
      const t0 = now();
      const minDur = env.reduced ? 300 : repeat ? 600 : 1600;
      const step = env.reduced ? 0 : repeat ? 70 : 210;
      const timers = [], offs = [];
      let armed = false, engaged = false, resolved = 0, armTimer = 0;
      let cur = 0, target = 0, lastBar = -1, lastPct = -1;

      const tasks = [
        { label: 'Cosmos shader', pending: 'PENDING', run(done) {
          const c = GK.cosmos;
          if (!c) { done('OFFLINE', 'warn'); return; }
          const report = d => {
            const gl = d && typeof d.webgl === 'boolean' ? d.webgl : env.webgl;
            const tier = d && d.tier != null ? d.tier : state.quality;
            done(gl ? 'COMPILED · ' + GK.perf.name().toUpperCase() : 'FALLBACK', gl ? 'ok' : 'warn');
          };
          if (c.ready) report(null); else offs.push(bus.once('cosmos:ready', report));
        } },
        { label: 'Audio engine', run(done) {
          if (GK.audio) done('STANDBY'); else done('UNAVAILABLE', 'warn');
        } },
        { label: 'Star chart', run(done) { done(pad(SECTORS.length) + ' SECTORS'); } },
        { label: 'Mission archive', run(done) {
          const n = GK.data && GK.data.projects ? GK.data.projects.length : 0;
          if (n) done(pad(n) + ' LOGS'); else done('EMPTY', 'warn');
        } },
        { label: 'Typefaces', pending: 'PENDING', run(done) {
          const fonts = doc.fonts;
          if (!fonts || !fonts.ready || !fonts.ready.then) { done('SYSTEM', 'warn'); return; }
          fonts.ready.then(() => {
            let n = 0;
            try { fonts.forEach(f => { if (f.status === 'loaded') n++; }); } catch (e) { n = 0; }
            if (n) done(pad(n) + ' FACES'); else done('SYSTEM', 'warn');
          }).catch(() => done('SYSTEM', 'warn'));
        } },
        { label: 'Nav lock', run(done) { done((SECTORS[state.sector] || SECTORS[0]).name); } },
      ];
      tasks.forEach(t => {
        t.out = el('b', { text: '· · ·' });
        t.row = el('li', null, [el('span', { text: t.label }), el('i'), t.out]);
        logEl.appendChild(t.row);
      });

      function check() {
        if (armed || engaged || resolved < tasks.length) return;
        const wait = minDur - (now() - t0);
        if (wait <= 0) arm();
        else if (!armTimer) armTimer = setTimeout(arm, wait);
      }
      function reveal(i) {
        const t = tasks[i];
        if (!t || t.shown) return;
        t.shown = true;
        t.row.classList.add('is-on');
        GK.sfx('boot', { i });
        t.finish = (value, tone) => {
          if (t.done) return;
          t.done = true;
          t.out.textContent = value;
          t.row.dataset.tone = tone || 'ok';
          resolved++;
          target = resolved / tasks.length;
          check();
        };
        try { t.run(t.finish); } catch (e) { t.finish('ERROR', 'warn'); }
      }
      function arm() {
        if (armed || engaged) return;
        armed = true;
        clearTimeout(capTimer);
        clearTimeout(armTimer);
        target = 1;
        loader.classList.add('is-armed');
        if (status) status.textContent = 'Systems ready. Press Enter to engage with sound, or M to engage silently.';
        focusQuiet(btn);
      }
      /* whatever is still pending after 4s is reported as such — the visitor is never held hostage */
      const capTimer = setTimeout(() => {
        tasks.forEach((t, i) => { reveal(i); if (!t.done) t.finish(t.pending || 'PENDING', 'warn'); });
        arm();
      }, 4000);

      tasks.forEach((t, i) => {
        if (!step) reveal(i);
        else timers.push(setTimeout(() => reveal(i), 120 + i * step));
      });
      if (title && GK.fx && GK.fx.decode) GK.fx.decode(title);

      const stopBar = GK.ticker.add((st, dt) => {
        cur = env.reduced ? target : damp(cur, target, 7, dt);
        if (target - cur < 0.005) cur = target;
        if (bar && Math.abs(cur - lastBar) > 0.001) { lastBar = cur; bar.style.transform = 'scaleX(' + cur.toFixed(3) + ')'; }
        const p = Math.round(cur * 100);
        if (pct && p !== lastPct) { lastPct = p; pct.textContent = pad(p, 3); }
        if (armed && cur >= 1) stopBar();
      }, 40);

      function onKey(e) {
        if (engaged) return;
        e.stopImmediatePropagation();          // no global shortcut reaches the ship before launch
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key;
        if (k === 'Tab') {
          e.preventDefault();
          if (armed) focusQuiet(doc.activeElement === btn && silent ? silent : btn);
          return;
        }
        if (!armed || e.repeat) return;
        if (k === 'Enter' || k === ' ' || k === 'Spacebar') { e.preventDefault(); engage(doc.activeElement !== silent); }
        else if (k === 'm' || k === 'M') { e.preventDefault(); engage(false); }
      }
      function dissolve() {
        window.removeEventListener('keydown', onKey, true);
        timers.forEach(clearTimeout);
        clearTimeout(capTimer);
        clearTimeout(armTimer);
        offs.forEach(off => off());
        loader.classList.add('is-engaging');
        if (doc.activeElement && loader.contains(doc.activeElement)) doc.activeElement.blur();
        setTimeout(() => { stopBar(); loader.remove(); }, env.reduced ? 240 : 1050);
      }
      function engage(sound) {
        if (engaged || !armed) return;
        engaged = true;
        try { sessionStorage.setItem(BOARDED, '1'); } catch (e) { /* storage blocked: every visit is a first visit */ }
        bus.emit('enter', { sound: !!sound });
        if (!env.reduced) GK.warp(1, 1600);
        dissolve();
      }

      window.addEventListener('keydown', onKey, true);
      btn.addEventListener('click', () => engage(true));
      if (silent) silent.addEventListener('click', () => engage(false));
      /* someone else entered for us (fail-safe / automation): just get out of the way */
      bus.on('enter', () => { if (!engaged) { engaged = true; dissolve(); } });
    }

    /* ───────────────────────── header · readouts · orbit map ───────────────────────── */
    function initChrome() {
      const header = $('siteHeader'), scrollBar = $('scrollBar');
      const hud = $('hud'), hudProg = $('hudProg'), nameEl = $('hudName');
      const wIdx = writer($('hudIdx')), wPlain = writer($('hudPlain')), wVel = writer($('hudVel')), wClock = writer($('hudClock'));
      const wTime = writer($('hudTime')), wTier = writer($('hudTier')), wChipIdx = writer($('chipIdx')), wChipName = writer($('chipName'));
      const total = $('hudTotal'), chartCount = $('chartCount'), consoleKey = $('consoleKey');
      if (total) total.textContent = pad(SECTORS.length - 1);
      if (chartCount) chartCount.textContent = '· ' + SECTORS.length + ' sectors';
      if (consoleKey && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '')) consoleKey.textContent = '⌘ K';

      /* ── build the three sector lists from the one source of truth ── */
      const orbitList = $('orbitList'), ship = $('orbitShip'), rail = $('rail'), chartList = $('chartList');
      const orbitNodes = [], railTicks = [], chartLinks = [];
      SECTORS.forEach((s, i) => {
        const num = pad(i);
        if (orbitList) {
          const a = el('a', { class: 'orbit-node', href: '#' + s.id }, [
            el('i', { class: 'orbit-dot' }),
            el('span', { class: 'orbit-label' }, [el('b', { text: num }), s.name, el('em', { text: s.label })]),
          ]);
          orbitNodes.push(a);
          orbitList.appendChild(el('li', null, [a]));
        }
        if (rail) { const tick = el('i'); railTicks.push(tick); rail.appendChild(tick); }
        if (chartList) {
          const a = el('a', { href: '#' + s.id }, [
            el('span', { class: 'chart-num', text: num }),
            el('span', { class: 'chart-label', text: s.label }),
            el('span', { class: 'chart-name', text: s.name }),
          ]);
          const li = el('li', null, [a]);
          li.style.setProperty('--i', i);
          chartLinks.push(a);
          chartList.appendChild(li);
        }
      });
      const hasWorm = !!(orbitList && $('wormhole'));
      if (hasWorm) {
        orbitList.appendChild(el('li', null, [el('a', {
          class: 'orbit-node orbit-worm', href: '#wormhole',
          html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/></svg>' +
            '<span class="orbit-label">Wormhole<em>Loop to Origin</em></span>',
        })]));
      }
      const maxPos = SECTORS.length - 1 + (hasWorm ? 1 : 0);

      /* ── nav indicator: one bar that slides to the current sector's link ── */
      const nav = $('siteNav'), navBar = $('navBar');
      const navLinks = nav ? qsa('a[href^="#"]', nav) : [];
      const metrics = new Map();
      let activeLink = null, barOn = false, orbitStep = 28;
      /* sectors without a link of their own keep the previous one lit (Stats → Work); Origin has none */
      function linkFor(i) {
        for (let k = i; k > 0; k--) {
          const href = '#' + SECTORS[k].id;
          const a = navLinks.find(l => l.getAttribute('href') === href);
          if (a) return a;
        }
        return null;
      }
      function placeBar(slide) {
        if (!navBar) return;
        const m = activeLink ? metrics.get(activeLink) : null;
        if (!m || !wide) { navBar.classList.remove('is-on', 'is-sliding'); barOn = false; return; }
        navBar.classList.toggle('is-sliding', !!slide && barOn && !env.reduced);
        navBar.style.transform = 'translate3d(' + m.x.toFixed(1) + 'px,0,0) scaleX(' + m.w.toFixed(1) + ')';
        navBar.classList.add('is-on');
        barOn = true;
      }
      function measure() {
        wide = isWide();
        if (!wide) { placeBar(false); return; }
        if (orbitNodes.length > 1) orbitStep = orbitNodes[1].offsetTop - orbitNodes[0].offsetTop || orbitStep;
        if (navLinks.length) {
          const inset = parseFloat(getComputedStyle(navLinks[0]).paddingLeft) || 0;
          navLinks.forEach(a => metrics.set(a, { x: a.offsetLeft + inset, w: Math.max(1, a.offsetWidth - inset * 2) }));
        }
        placeBar(false);
      }

      let sectorNow = -1;
      function setSector(i) {
        const s = SECTORS[i];
        if (!s || i === sectorNow) return;
        sectorNow = i;
        const num = pad(i);
        wIdx(num); wPlain(s.label); wChipIdx(num); wChipName(s.name);
        if (nameEl) { if (GK.fx && GK.fx.decode) GK.fx.decode(nameEl, s.name); else nameEl.textContent = s.name; }
        orbitNodes.forEach((a, k) => { if (k === i) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
        chartLinks.forEach((a, k) => { if (k === i) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
        railTicks.forEach((tick, k) => { tick.classList.toggle('is-past', k < i); tick.classList.toggle('is-active', k === i); });
        activeLink = linkFor(i);
        navLinks.forEach(a => {
          a.classList.toggle('is-active', a === activeLink);
          if (a === activeLink && a.getAttribute('href') === '#' + s.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        });
        placeBar(true);
      }

      /* ── audio toggles + live spectrum ── */
      const musicBtn = $('musicBtn'), sfxBtn = $('sfxBtn');
      const bars = musicBtn ? qsa('.spectrum i', musicBtn).map(node => ({ node, v: 0.14, last: 0.14 })) : [];
      const BANDS = [0.008, 0.02, 0.045, 0.09, 0.16];   // fractions of the spectrum, low → high
      let musicOn = false, sfxOn = false, specAcc = 0, flat = true;
      function syncAudio(d) {
        const a = GK.audio;
        try {
          musicOn = d && typeof d.music === 'boolean' ? d.music : !!(a && a.isMusicOn && a.isMusicOn());
          sfxOn = d && typeof d.sfx === 'boolean' ? d.sfx : !!(a && a.isSfxOn && a.isSfxOn());
        } catch (e) { musicOn = false; sfxOn = false; }
        if (musicBtn) { musicBtn.setAttribute('aria-pressed', String(musicOn)); musicBtn.dataset.cursor = musicOn ? 'Music on' : 'Music off'; }
        if (sfxBtn) { sfxBtn.setAttribute('aria-pressed', String(sfxOn)); sfxBtn.dataset.cursor = sfxOn ? 'SFX on' : 'SFX off'; }
        refreshReticle();
      }
      function toggleAudio(kind) {
        const a = GK.audio;
        const fn = a ? (kind === 'music' ? a.toggleMusic : a.toggleSfx) : null;
        if (typeof fn !== 'function') { GK.toast('Audio engine unavailable', { tone: 'warn' }); return; }
        try { fn.call(a); } catch (e) { GK.toast('Audio engine unavailable', { tone: 'warn' }); return; }
        syncAudio();
      }
      function bandFallback(i) {
        const au = state.audio;
        return i === 0 ? au.bass : i === 1 ? (au.bass + au.mid) / 2 : i === 2 ? au.mid : i === 3 ? (au.mid + au.high) / 2 : au.high;
      }
      function spectrum(dt) {
        if (!bars.length) return;
        specAcc += dt;
        if (specAcc < 0.033) return;                     // ~30 Hz is plenty for five bars
        const span = specAcc;
        specAcc = 0;
        const a = GK.audio;
        if (!musicOn || !a) {
          if (!flat) { flat = true; bars.forEach(b => { b.v = b.last = 0.14; b.node.style.transform = ''; }); }
          return;
        }
        let data = null;
        try { data = a.spectrum ? a.spectrum() : null; } catch (e) { data = null; }
        const n = data ? data.length : 0;
        let prev = -1;
        for (let i = 0; i < bars.length; i++) {
          let v;
          if (n) { prev = Math.min(n - 1, Math.max(prev + 1, Math.round(BANDS[i] * n))); v = data[prev] / 255; }
          else v = bandFallback(i) || 0;
          const b = bars[i];
          const to = clamp(0.14 + v * 0.95, 0.14, 1);
          b.v = to > b.v ? to : damp(b.v, to, 9, span);  // instant attack, eased release
          if (Math.abs(b.v - b.last) > 0.02) { b.last = b.v; b.node.style.transform = 'scaleY(' + b.v.toFixed(2) + ')'; }
        }
        flat = false;
      }
      if (musicBtn) musicBtn.addEventListener('click', () => toggleAudio('music'));
      if (sfxBtn) sfxBtn.addEventListener('click', () => toggleAudio('sfx'));
      if (!GK.audio) [musicBtn, sfxBtn].forEach(b => { if (b) b.setAttribute('aria-disabled', 'true'); });
      bus.on('audio:state', syncAudio);
      syncAudio();

      /* ── skip link: land keyboard focus on the content itself ── */
      const skip = doc.querySelector('.skip-link');
      if (skip) skip.addEventListener('click', e => {
        const main = $('story');
        if (!main) return;
        e.preventDefault();
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
        focusQuiet(main);
      });

      /* ── honest telemetry, written at most 10 times a second and only on change ── */
      let tEnter = now(), webgl = env.webgl;
      bus.on('cosmos:ready', d => { if (d && typeof d.webgl === 'boolean') webgl = d.webgl; });
      function readouts(st) {
        if (!wide) return;
        wVel(pad(Math.min(9999, Math.round(Math.abs(st.velocity) / 10) * 10), 4));
        const s = Math.max(0, Math.floor((now() - tEnter) / 1000));
        wClock(pad(Math.floor(s / 60)) + ':' + pad(s % 60));
        const d = new Date();
        wTime(pad(d.getHours()) + ':' + pad(d.getMinutes()));
        wTier((GK.perf.pinned == null ? 'Auto ' : '') + GK.perf.name());
      }

      let scrolled = false, fast = false, lastProg = -1, lastT = -1, lastShip = -1, acc = 1;
      GK.ticker.add((st, dt) => {
        if (!st.entered) return;
        const sc = st.scrollY > 40;
        if (header && sc !== scrolled) { scrolled = sc; header.classList.toggle('is-scrolled', sc); }
        if (scrollBar && Math.abs(st.progress - lastProg) > 0.0004) {
          lastProg = st.progress;
          scrollBar.style.transform = 'scaleX(' + st.progress.toFixed(4) + ')';
        }
        if (wide) {
          if (hudProg && Math.abs(st.sectorT - lastT) > 0.002) {
            lastT = st.sectorT;
            hudProg.style.transform = 'scaleX(' + st.sectorT.toFixed(3) + ')';
          }
          if (ship) {
            const y = Math.round(Math.min(maxPos, st.sectorF + (hasWorm ? st.wormhole : 0)) * orbitStep * 2) / 2;
            if (y !== lastShip) { lastShip = y; ship.style.transform = 'translate3d(0,' + y + 'px,0)'; }
          }
          const f = fast ? st.speed > 0.14 : st.speed > 0.4;
          if (hud && f !== fast) { fast = f; hud.classList.toggle('is-fast', f); }
        }
        acc += dt;
        if (acc >= 0.1) { acc = 0; readouts(st); }
        spectrum(dt);
      }, 30);

      bus.on('sector', d => { if (d) setSector(d.index); });
      bus.on('measure', measure);            // core re-measures (and emits this) on every resize, font load and reflow
      bus.on('enter', () => {
        tEnter = now(); acc = 1; setTimeout(syncAudio, 0);
        setTimeout(() => { if (GK.unlockObjective) GK.unlockObjective('first-contact'); }, 900);
      });
      const qCount = $('questCount'), cqCount = $('chartQuestCount'), qBtn = $('questBtn');
      bus.on('objective:state', d => {
        if (!d) return;
        const txt = d.done + '/' + d.total;
        if (qCount) qCount.textContent = txt;
        if (cqCount) cqCount.textContent = txt;
        if (qBtn) qBtn.classList.toggle('is-complete', d.done >= d.total);
      });
      setSector(state.sector);
      measure();
    }

    /* ───────────────────────── star chart (menu below 1100px) ───────────────────────── */
    function initMenu() {
      const chart = $('starChart'), btn = $('menuBtn'), closeBtn = $('chartClose');
      if (!chart || !btn) return;
      let open = false;
      function setOpen(v, restoreFocus) {
        if (v === open) return;
        open = v;
        chart.classList.toggle('is-open', v);
        root.classList.toggle('menu-open', v);
        btn.setAttribute('aria-expanded', String(v));
        btn.setAttribute('aria-label', v ? 'Close star chart' : 'Open star chart');
        if (v) {
          chart.scrollTop = 0;
          bus.emit('overlay:open', { name: 'menu' });
          focusQuiet(closeBtn || chart.querySelector('a[href]') || btn);
        } else {
          bus.emit('overlay:close', { name: 'menu' });
          if (restoreFocus) focusQuiet(btn);
        }
      }
      btn.addEventListener('click', () => setOpen(!open, true));
      if (closeBtn) closeBtn.addEventListener('click', () => setOpen(false, true));
      /* a destination or an action was chosen: close, and let its owner (flow.js) take focus from here */
      chart.addEventListener('click', e => {
        const t = e.target.closest ? e.target.closest('a[href], [data-action]') : null;
        if (t && chart.contains(t)) setOpen(false, false);
      });
      window.addEventListener('keydown', e => {
        if (!open) return;
        if (e.key === 'Escape' || e.key === 'Esc') {
          e.preventDefault();
          e.stopImmediatePropagation();
          setOpen(false, true);
          return;
        }
        if (e.key === 'Tab') {
          const f = qsa('a[href], button:not([disabled])', chart);
          if (!f.length) return;
          const first = f[0], last = f[f.length - 1], at = doc.activeElement;
          if (!chart.contains(at)) { e.preventDefault(); focusQuiet(first); }
          else if (e.shiftKey && at === first) { e.preventDefault(); focusQuiet(last); }
          else if (!e.shiftKey && at === last) { e.preventDefault(); focusQuiet(first); }
          return;
        }
        if (!e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();   // single-key shortcuts stay out from under the chart
      }, true);
      bus.on('resize', () => { if (open && isWide()) setOpen(false, false); });
      bus.on('overlay:open', d => { if (open && (!d || d.name !== 'menu')) setOpen(false, false); });
      bus.on('modal:open', () => { if (open) setOpen(false, false); });
    }

    /* ───────────────────────── reticle cursor ─────────────────────────
       dot  = the raw pointer, never smoothed
       ring = follows with easing, stretches along its velocity
       lock = ring dissolves into four brackets that fly to the target's
              rect (+6px) and stay attached while the page scrolls
       Only transforms are written; the only layout read after lock-on is
       the locked rect, and only while something is actually moving.     */
    function initReticle() {
      const box = $('reticle');
      if (!box) return;
      if (!env.fine) { box.remove(); return; }
      const dot = box.querySelector('.reticle-dot'), ring = box.querySelector('.reticle-ring'), label = box.querySelector('.reticle-label');
      const corners = qsa('.reticle-corner', box).map(node => ({ node, x: 0, y: 0 }));
      if (!dot || !ring || !label || corners.length !== 4) return;

      const NATIVE = 'input, textarea, select, video, iframe, [contenteditable=""], [contenteditable="true"]';
      const LINK = 'a[href], button, [role="button"], summary, label[for], .is-clickable';
      const PAD = 6;
      const t3 = (x, y) => 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      const cls = (name, on) => box.classList.toggle(name, on);

      let px = env.w / 2, py = env.h / 2, rx = px, ry = py, rs = 1, rv = 0, lx = px, ly = py;
      let seen = false, visible = false, moved = false, down = false, still = false, active = false, dead = false;
      let hover = null, resolveDue = false, mode = 'idle';
      let lockEl = null, lockKb = false, rect = null;
      let labelText = '', labelW = 0, labelH = 0, labelSnap = true;
      let lastMove = 0, lastLockSfx = 0, lastScroll = -1, awake = 0, settleUntil = 0, flyUntil = 0;

      function measureLock(node) {
        const r = node.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return null;
        if (r.width * r.height > 0.45 * env.w * env.h) return null;   // too big to bracket: plain link state
        return { l: r.left, t: r.top, r: r.right, b: r.bottom };
      }
      function setLabel(text) {
        const next = String(text || '').trim();
        if (next === labelText) return;
        if (!labelText) labelSnap = true;
        labelText = next;
        cls('has-label', !!next);
        if (!next) return;
        label.textContent = next;
        labelW = label.offsetWidth;
        labelH = label.offsetHeight;
        if (GK.fx && GK.fx.decode && !env.reduced) GK.fx.decode(label, next, { duration: 180 });
      }
      function apply(next, lock, text, kb, lockRect) {
        const prevLock = lockEl;
        mode = next;
        lockEl = next === 'lock' ? lock : null;
        lockKb = !!(kb && lockEl);
        rect = lockEl ? lockRect : null;
        cls('is-link', next === 'link');
        cls('is-lock', next === 'lock');
        cls('is-hidden', next === 'hidden');
        const t = now();
        if (lockEl && lockEl !== prevLock) {
          settleUntil = t + 450;
          if (!prevLock && t > flyUntil) {             // brackets unfold from the ring (or the target's centre for keyboard)
            const ox = seen ? rx : (rect.l + rect.r) / 2, oy = seen ? ry : (rect.t + rect.b) / 2;
            corners[0].x = ox - 9; corners[0].y = oy - 9;
            corners[1].x = ox + 9; corners[1].y = oy - 9;
            corners[2].x = ox - 9; corners[2].y = oy + 9;
            corners[3].x = ox + 9; corners[3].y = oy + 9;
          }
          if (t - lastLockSfx > 160) { lastLockSfx = t; GK.sfx('lock', { x: (rect.l + rect.r) / 2 }); }
        }
        if (!lockEl && prevLock) flyUntil = t + 240;
        setLabel(text);
        awake = t + 600;
      }
      function resolve() {
        resolveDue = false;
        if (lockKb) {                                    // a keyboard lock holds until focus or the pointer target moves
          const kbLab = lockEl ? lockEl.closest('[data-cursor]') : null;
          setLabel(kbLab ? kbLab.getAttribute('data-cursor') : '');
          return;
        }
        const t = hover && hover.closest ? hover : null;
        if (!t) { apply('idle', null, '', false, null); return; }
        if (t.closest(NATIVE)) { apply('hidden', null, '', false, null); return; }
        const lab = t.closest('[data-cursor]');
        const text = lab ? lab.getAttribute('data-cursor') || '' : '';
        const lock = t.closest('[data-cursor-lock]');
        const lockRect = lock ? measureLock(lock) : null;
        if (lockRect) apply('lock', lock, text, false, lockRect);
        else apply(lock || text || t.closest(LINK) ? 'link' : 'idle', null, text, false, null);
      }
      function retarget(node) {
        if (node === hover) return;
        hover = node;
        lockKb = false;
        resolveDue = true;
      }
      function hide() {
        visible = false;
        cls('is-on', false);
        retarget(null);
        awake = now() + 300;
      }

      function onMove(e) {
        if (e.pointerType === 'touch') return;
        px = e.clientX; py = e.clientY;
        moved = true;
        lastMove = now();
        if (!seen) { seen = true; rx = lx = px; ry = ly = py; root.classList.add('has-cursor'); }
        if (!visible) { visible = true; cls('is-on', true); }
        if (still) { still = false; cls('is-still', false); }
        retarget(e.target);
      }
      function onOver(e) { if (e.pointerType !== 'touch') retarget(e.target); }
      function onDown(e) {
        if (e.pointerType === 'touch') { hide(); return; }
        down = true;
        cls('is-down', true);
        awake = now() + 600;
      }
      function onUp() {
        if (!down) return;
        down = false;
        cls('is-down', false);
        awake = now() + 600;
      }
      function onFocusIn(e) {
        const t = e.target;
        if (!t || !t.closest) return;
        let keyboard = false;
        try { keyboard = t.matches(':focus-visible'); } catch (err) { keyboard = false; }
        const lock = keyboard ? t.closest('[data-cursor-lock]') : null;
        const lockRect = lock ? measureLock(lock) : null;
        if (lockRect) {
          const lab = t.closest('[data-cursor]');
          apply('lock', lock, lab ? lab.getAttribute('data-cursor') || '' : '', true, lockRect);
        } else if (lockKb) { lockKb = false; resolveDue = true; }
      }
      function onFocusOut() { if (lockKb) { lockKb = false; resolveDue = true; } }

      function move(c, x, y, k) {
        c.x += (x - c.x) * k;
        c.y += (y - c.y) * k;
        c.node.style.transform = t3(c.x, c.y);
      }
      function frame(st, dt) {
        const t = now();
        if (resolveDue) resolve();
        if (lockEl && !lockEl.isConnected) { hover = null; lockKb = false; apply('idle', null, '', false, null); }
        if (!seen && !lockEl && t > flyUntil) return;
        const scrolledNow = st.scrollY !== lastScroll;
        lastScroll = st.scrollY;
        if (moved) awake = Math.max(awake, t + 500);
        if (!(moved || scrolledNow || down || lockEl || t < awake || t < flyUntil)) {
          if (active) { active = false; cls('is-active', false); }
          if (!still && visible && mode === 'idle' && !env.reduced && t - lastMove > 4000) { still = true; cls('is-still', true); }
          return;
        }
        if (!active) { active = true; cls('is-active', true); }

        /* locked rect: re-read only while the page, the pointer or the lock itself is moving */
        if (lockEl && (scrolledNow || moved || t < settleUntil)) {
          const r = lockEl.getBoundingClientRect();
          if (rect) {                                    // carry the brackets with the element so they never trail a scroll
            const sx = r.left - rect.l, sy = r.top - rect.t;
            if (scrolledNow && (sx || sy)) for (let i = 0; i < 4; i++) { corners[i].x += sx; corners[i].y += sy; }
          }
          rect = { l: r.left, t: r.top, r: r.right, b: r.bottom };
          if (!lockKb && (px < r.left - 28 || px > r.right + 28 || py < r.top - 28 || py > r.bottom + 28)) {
            hover = null;
            apply('idle', null, '', false, null);
          }
        }

        const k = env.reduced ? 1 : 1 - Math.exp(-15 * dt);
        const dx = px - rx, dy = py - ry;
        rx += dx * k; ry += dy * k;
        dot.style.transform = t3(px, py);

        /* ring scale rides a light spring — the one place a little overshoot is allowed */
        const to = mode === 'lock' ? 0.6 : (mode === 'link' ? 1.44 : 1) * (down ? 0.8 : 1);
        if (env.reduced) { rs = to; rv = 0; }
        else { rv += (to - rs) * 220 * dt; rv *= Math.exp(-20 * dt); rs += rv * dt; }
        const stretch = env.reduced ? 0 : Math.min((Math.hypot(dx, dy) * k) / (dt * 60) / 40, 0.35);
        ring.style.transform = t3(rx, ry) + (stretch > 0.01
          ? ' rotate(' + Math.atan2(dy, dx).toFixed(3) + 'rad) scale(' + (rs * (1 + stretch)).toFixed(3) + ',' + (rs * (1 - stretch * 0.35)).toFixed(3) + ')'
          : ' scale(' + rs.toFixed(3) + ')');

        const kc = env.reduced ? 1 : 1 - Math.exp(-20 * dt);
        if (lockEl || t < flyUntil) {
          let x0 = rx - 9, y0 = ry - 9, x1 = rx + 9, y1 = ry + 9;
          if (lockEl && rect) {
            const p = PAD + (env.reduced ? 0 : Math.sin(st.time * 3.9) * 1.5);
            x0 = rect.l - p; y0 = rect.t - p; x1 = rect.r + p; y1 = rect.b + p;
          }
          move(corners[0], x0, y0, kc);
          move(corners[1], x1, y0, kc);
          move(corners[2], x0, y1, kc);
          move(corners[3], x1, y1, kc);
        }
        if (labelText) {
          let tx = rx + 20, ty = ry + 20;
          if (lockEl && rect) { tx = rect.r + PAD + 10; ty = rect.b + PAD + 10; }
          tx = Math.max(8, Math.min(tx, env.w - labelW - 8));
          ty = Math.max(8, Math.min(ty, env.h - labelH - 8));
          if (labelSnap) { labelSnap = false; lx = tx; ly = ty; }
          else { lx += (tx - lx) * kc; ly += (ty - ly) * kc; }
          label.style.transform = t3(lx, ly);
        }
        moved = false;
      }

      const offTick = GK.ticker.add((st, dt) => {
        if (dead) return;
        try { frame(st, dt); } catch (e) {
          /* never leave the visitor without a pointer: hand the native cursor back */
          dead = true;
          console.error('[GK] hud: reticle stopped', e);
          root.classList.remove('has-cursor');
          window.removeEventListener('pointermove', onMove);
          doc.removeEventListener('pointerover', onOver);
          box.remove();
          setTimeout(offTick, 0);
        }
      }, 40);

      refreshReticle = () => { if (!dead) { resolveDue = true; awake = now() + 300; } };
      window.addEventListener('pointermove', onMove, { passive: true });
      doc.addEventListener('pointerover', onOver, { passive: true });
      window.addEventListener('pointerdown', onDown, { passive: true });
      window.addEventListener('pointerup', onUp, { passive: true });
      window.addEventListener('pointercancel', onUp, { passive: true });
      root.addEventListener('mouseleave', hide);
      window.addEventListener('blur', hide);
      doc.addEventListener('focusin', onFocusIn);
      doc.addEventListener('focusout', onFocusOut);
    }

    guard('toasts', initToasts);
    if (!guard('loader', initLoader)) GK.loaderReady = false;   // let boot.js's fail-safe open the ship
    guard('chrome', initChrome);
    guard('menu', initMenu);
    guard('reticle', initReticle);
  });
})();
