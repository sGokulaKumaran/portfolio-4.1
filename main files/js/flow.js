/* ═══════════════════════════════════════════════════════════════
   VOYAGER · flow.js
   Travel between sectors and every overlay layer:
     · GK.navTo — cancellable scroll tween for one sector, hyperspace
       jump for two or more
     · anchor links, keyboard travel, [data-action] shortcuts
     · mission-briefing modal (GK.modal)
     · ship console / command palette (GK.palette)
     · overlay stack (GK.flow), wormhole loop + footer, flash layer
     · the owner's soft protections (PROTECT)
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Owner's feature, de-fanged: each switch is a polite block and nothing more.
     Set either to false to hand the browser default back. */
  const PROTECT = { contextMenu: true, devShortcuts: true };

  const GK = window.GK;
  if (!GK || !GK.register) return;

  GK.register('flow', function init(GK) {
    const doc = document, root = doc.documentElement;
    const { clamp, qs, qsa, pad, esc, el, easeInOutCubic } = GK.util;
    const env = GK.env, state = GK.state, bus = GK.bus;
    const SECTORS = GK.SECTORS;
    const LAST = SECTORS.length - 1;
    const STOP_WORMHOLE = SECTORS.length;   // pseudo stop after the last sector
    const story = doc.getElementById('story');
    const wormhole = doc.getElementById('wormhole');

    /* ───────────── icons (24px grid, 1.5px stroke) ───────────── */
    const svg = d => '<svg class="flow-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
    const ICON = {
      close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
      prev: svg('<path d="M14.5 5.5L8 12l6.5 6.5"/>'),
      next: svg('<path d="M9.5 5.5L16 12l-6.5 6.5"/>'),
      play: svg('<path d="M8 5.5v13l11-6.5z"/>'),
      ext: svg('<path d="M8 16l8.5-8.5M9.5 7.5h7v7"/>'),
      down: svg('<path d="M12 4.5v11M7 11l5 5 5-5M5.5 19.5h13"/>'),
      chev: svg('<path d="M9 6l6 6-6 6"/>'),
      enter: svg('<path d="M18.5 6v6.5h-12M10 9l-3.5 3.5L10 16"/>'),
      sector: svg('<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-20 12 12)"/>'),
      mission: svg('<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>'),
      record: svg('<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4M10 12.5h5M10 16h5"/>'),
      music: svg('<path d="M9.5 17.5V6l9-2v11.5"/><circle cx="7" cy="17.5" r="2.5"/><circle cx="16" cy="15.5" r="2.5"/>'),
      sfx: svg('<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M15.5 9a4.2 4.2 0 010 6M18 6.5a7.8 7.8 0 010 11"/>'),
      write: svg('<path d="M4.5 19.5l1-4L16 5l3 3L8.5 18.5z"/><path d="M14 7l3 3"/>'),
      mail: svg('<path d="M3.5 6.5h17v11h-17z"/><path d="M3.5 7l8.5 6.5L20.5 7"/>'),
      lock: svg('<path d="M6.5 10.5h11v9h-11z"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/>'),
      game: svg('<path d="M12 3.5l2.4 6.1 6.1 2.4-6.1 2.4-2.4 6.1-2.4-6.1-6.1-2.4 6.1-2.4z"/>'),
    };

    /* a fixed root for one of our layers; created if the @flow region lost it */
    function ensure(id, cls, hidden) {
      let node = doc.getElementById(id);
      if (!node) {
        node = el('div', { id, class: cls, hidden: !!hidden });
        doc.body.appendChild(node);
      }
      return node;
    }

    /* ───────────── overlay stack ─────────────
       Our own layers ('modal', 'palette') plus anything another module
       announces with overlay:open / overlay:close { name }. */
    const stack = [];
    const topLayer = () => stack[stack.length - 1];
    function dropLayer(name) { const i = stack.indexOf(name); if (i > -1) stack.splice(i, 1); }
    function pushLayer(name) { if (!name) return; dropLayer(name); stack.push(name); }
    bus.on('overlay:open', d => pushLayer(d && d.name));
    bus.on('overlay:close', d => dropLayer(d && d.name));

    const flow = (GK.flow = { busy: false, overlayOpen: () => stack.length > 0 });

    /* page lock shared by our layers: no scroll (scrollbars are already hidden,
       so nothing shifts) and the story is inert for keyboard + assistive tech */
    let locks = 0;
    function lock() {
      if (locks++ > 0) return;
      root.classList.add('is-locked');
      if (story) { story.inert = true; story.setAttribute('aria-hidden', 'true'); }
    }
    function unlock() {
      if (locks === 0 || --locks > 0) return;
      root.classList.remove('is-locked');
      if (story) { story.inert = false; story.removeAttribute('aria-hidden'); }
    }

    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';
    function trapTab(e, scope) {
      const list = qsa(FOCUSABLE, scope).filter(n => n.offsetParent !== null);
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0], last = list[list.length - 1], active = doc.activeElement;
      const outside = !scope.contains(active) || list.indexOf(active) < 0;
      if (e.shiftKey && (active === first || outside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || outside)) { e.preventDefault(); first.focus(); }
    }
    function refocus(node) {
      if (!node || !node.focus || node === doc.body || !doc.contains(node)) return;
      try { node.focus({ preventScroll: true }); } catch (err) { /* detached mid-flight */ }
    }

    /* ───────────── flash layer ─────────────
       Opacity only, ramps ≥ 150ms. Used at the loop peak and as the jump
       flash when there is no WebGL backdrop to do it. */
    const flashEl = ensure('flash', 'flow-flash', false);
    flashEl.setAttribute('aria-hidden', 'true');
    let flashTimer = 0;
    function flash(peak) {
      if (env.reduced) return;
      flashEl.style.setProperty('--flash-peak', String(peak));
      flashEl.classList.add('is-on');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => flashEl.classList.remove('is-on'), 200);
    }

    /* ───────────── cached geometry ───────────── */
    let whTop = -1, whH = 1, storyTop = 0;
    let pin = null;                 // keeps a deep link aligned while late layout settles
    let measuredMidJump = false;
    function remeasure() {
      if (root.classList.contains('is-jumping')) { measuredMidJump = true; return; }
      whTop = wormhole ? GK.scroll.topOf('wormhole') : -1;
      whH = wormhole ? Math.max(1, wormhole.offsetHeight) : 1;
      storyTop = story ? story.getBoundingClientRect().top + window.scrollY : 0;
      if (pin) {
        if (performance.now() > pin.until || Math.abs(window.scrollY - pin.y) > 4) pin = null;
        else {
          const y = destY(pin.dest);
          if (y >= 0 && Math.abs(y - pin.y) > 1) { GK.scroll.teleport(y); pin.y = window.scrollY; }
        }
      }
    }
    bus.on('measure', remeasure);

    /* ───────────── travel: resolve a target ───────────── */
    function resolve(target) {
      if (typeof target === 'string') {
        let t = target.charAt(0) === '#' ? target.slice(1) : target;
        try { t = decodeURIComponent(t); } catch (err) { /* keep the raw hash */ }
        if (t === 'story') return { stop: 0, index: 0, id: SECTORS[0].id, top: true };
        if (t === 'wormhole') return wormhole ? { stop: STOP_WORMHOLE, index: LAST, id: 'wormhole' } : null;
        target = GK.scroll.indexOf(t);
      }
      if (typeof target !== 'number' || !isFinite(target)) return null;
      const index = Math.round(target);
      if (index < 0 || index > LAST) return null;
      return { stop: index, index, id: SECTORS[index].id };
    }
    function destY(dest) {
      const y = dest.top ? 0 : dest.id === 'wormhole' ? GK.scroll.topOf('wormhole') : GK.scroll.topOf(dest.index);
      return y < 0 ? -1 : Math.min(y, Math.max(0, root.scrollHeight - window.innerHeight));
    }
    function currentStop() {
      return whTop >= 0 && window.scrollY + window.innerHeight * 0.5 >= whTop ? STOP_WORMHOLE : state.sector;
    }
    function focusHeading(dest) {
      const host = doc.getElementById(dest.id);
      if (!host) return;
      const ref = host.getAttribute('aria-labelledby');
      const h = (ref && doc.getElementById(ref.split(' ')[0])) || qs('h1, h2, h3', host) || host;
      if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
      h.setAttribute('data-flow-focus', '');
      refocus(h);
    }

    /* ───────────── travel: single step (cancellable scroll tween) ───────────── */
    let tween = null;
    function cancelTween() { if (!tween) return; tween.stop(); tween = null; }
    function tweenTo(y, done) {
      cancelTween();
      const y0 = window.scrollY, d = y - y0;
      if (Math.abs(d) < 2) { if (done) done(); return; }
      const dur = clamp(380 + Math.abs(d) * 0.7, 480, 1100) / 1000;
      const job = { y1: y, t: 0, stop: null };
      job.stop = GK.ticker.add((s, dt) => {
        job.t += dt;
        const p = clamp(job.t / dur);
        window.scrollTo(0, y0 + d * easeInOutCubic(p));
        if (p >= 1) { job.stop(); if (tween === job) tween = null; if (done) done(); }
      }, 5);
      tween = job;
    }
    window.addEventListener('wheel', cancelTween, { passive: true });
    window.addEventListener('touchstart', cancelTween, { passive: true });

    /* ───────────── travel: hyperspace jump ─────────────
       spool out (content fades + shrinks) → streak peak: teleport while the
       story is invisible → drop out (flash, content settles). Driven by the
       shared ticker so it stays in step with GK.warp; a timer guarantees the
       story can never be left hidden. */
    let jumpJob = null;
    function setOrigin() {
      root.style.setProperty('--jump-oy', Math.round(window.scrollY + window.innerHeight / 2 - storyTop) + 'px');
    }
    function jumpPeak(job, quiet) {
      if (job.moved) return;
      job.moved = true;
      GK.scroll.teleport(job.y);
      setOrigin();
      if (job.loop) bus.emit('loop');
      if (quiet || env.reduced) return;
      const shader = env.webgl && GK.cosmos && typeof GK.cosmos.flash === 'function';
      if (shader) GK.cosmos.flash(0.25);
      if (job.loop || !shader) flash(job.loop ? 0.26 : 0.16);
    }
    function endJump(job) {
      if (jumpJob !== job) return;
      jumpJob = null;
      clearTimeout(job.safety);
      if (job.stop) job.stop();
      try { jumpPeak(job, true); }
      finally {
        root.classList.remove('is-jumping', 'is-jump-out', 'is-jump-hold', 'is-jump-in');
        flow.busy = false;
      }
      if (measuredMidJump) { measuredMidJump = false; GK.scroll.measure(); }
      if (job.done) job.done();
    }
    function stepJump(job) {
      if (job.phase === 0 && job.t >= job.tPeak) {
        jumpPeak(job, false);
        root.classList.remove('is-jump-out');
        root.classList.add('is-jump-hold');
        job.phase = 1;
      } else if (job.phase === 1 && job.t >= job.tIn) {
        root.classList.remove('is-jump-hold');
        root.classList.add('is-jump-in');
        job.phase = 2;
      } else if (job.phase === 2 && job.t >= job.tEnd) endJump(job);
    }
    function jump(y, o) {
      const reduced = env.reduced;
      const dur = reduced ? 420 : o.dur || 1500;
      const peak = reduced ? 200 : dur * 0.36;
      const job = (jumpJob = {
        y, t: 0, phase: 0, moved: false, loop: !!o.loop, done: o.done || null,
        tPeak: peak, tIn: reduced ? peak : peak + 120, tEnd: dur, stop: null, safety: 0,
      });
      flow.busy = true;
      cancelTween();
      setOrigin();
      root.classList.add('is-jumping', 'is-jump-out');
      if (!reduced) GK.warp(1, dur);
      job.stop = GK.ticker.add((s, dt) => {
        job.t += dt * 1000;
        try { stepJump(job); } catch (err) { endJump(job); }
      }, 5);
      job.safety = setTimeout(() => endJump(job), dur + 1500);
    }
    function fastForward() {
      const job = jumpJob;
      if (!job) return;
      if (job.phase === 0) { job.tPeak = job.t; job.tIn = job.t + 40; job.tEnd = job.t + 440; }
      else if (job.phase === 1) { job.tIn = job.t; job.tEnd = job.t + 400; }
      else job.tEnd = Math.min(job.tEnd, job.t + 240);
    }

    /* ───────────── GK.navTo ─────────────
       target: sector index | element id ("p3") | sector key ("missions") |
               "wormhole" | "story"; a leading "#" is fine.
       opts:   instant  — no animation
               jump     — false forces the one-step tween
               focus    — false keeps keyboard focus where it is
               onArrive — called when travel completes (not if cancelled) */
    let loopArmed = false;
    function navTo(target, opts) {
      const o = opts || {};
      const dest = resolve(target);
      if (!dest || flow.busy) return false;
      const y = destY(dest);
      if (y < 0) return false;
      closeOwnLayers();
      cancelTween();
      loopArmed = false;

      const arrive = () => {
        if (o.focus !== false && state.entered) focusHeading(dest);
        if (typeof o.onArrive === 'function') o.onArrive(dest);
      };
      if (Math.abs(y - window.scrollY) < 2) { arrive(); return true; }

      const instant = !!o.instant || !state.entered;
      const isJump = !instant && o.jump !== false && Math.abs(dest.stop - currentStop()) >= 2;
      bus.emit('nav', { from: state.sector, to: dest.index, jump: isJump, id: dest.id });

      if (isJump) jump(y, { done: arrive });
      else if (instant || env.reduced) { GK.scroll.teleport(y); arrive(); }
      else {
        GK.sfx('whoosh', { dir: y > window.scrollY ? 1 : -1 });
        tweenTo(y, arrive);
      }
      return true;
    }
    GK.navTo = navTo;

    /* ↑/↓ and j/k: one sector at a time, but a panel taller than the viewport is
       read through first (≈85% of a screen per press). */
    function glide(y) { GK.sfx('tick'); tweenTo(y); }
    function hop(dir) {
      const list = GK.scroll.panels();
      if (!list.length) return;
      const vh = window.innerHeight;
      const y = tween ? tween.y1 : window.scrollY;
      const max = Math.max(0, root.scrollHeight - vh);
      const step = vh * 0.85;
      const probe = y + vh * 0.5;
      const step1 = { jump: false };

      if (whTop >= 0 && probe >= whTop) {
        if (dir > 0) { if (y < max - 2) glide(Math.min(max, y + step)); return; }
        if (y > whTop + 8) glide(Math.max(whTop, y - step)); else navTo(LAST, step1);
        return;
      }
      let at = 0;
      for (let i = 0; i < list.length; i++) { if (list[i].top <= probe) at = i; else break; }
      const cur = list[at], bottom = cur.top + cur.height;
      if (dir > 0) {
        if (bottom > y + vh + 8) glide(Math.min(y + step, bottom - vh));
        else if (list[at + 1]) navTo(list[at + 1].index, step1);
        else navTo('wormhole', step1);
      } else if (cur.top < y - 8) glide(Math.max(y - step, cur.top));
      else if (list[at - 1]) navTo(list[at - 1].index, step1);
    }

    /* ───────────── mission briefing (modal) ───────────── */
    const KIND = {
      project: { word: 'Mission briefing', alt: 'project preview', doc: false },
      cert: { word: 'Certificate', alt: 'certificate', doc: true },
      education: { word: 'Education', alt: 'photo', doc: false },
      internship: { word: 'Deployment', alt: 'certificate', doc: true },
    };
    const aspects = Object.create(null);   // item id → natural aspect, learnt as files load
    const bf = {
      root: ensure('briefing', 'briefing', true), built: false,
      item: null, list: [], index: 0, from: null,
      video: null, playing: false, token: 0, closeTimer: 0, swapTimer: 0,
    };
    const modal = (GK.modal = Object.assign(GK.modal || {}, { isOpen: false, open: openBriefing, close: closeBriefing }));

    function buildBriefing() {
      if (bf.built) return;
      bf.built = true;
      const tool = (act, label, icon) => '<button type="button" class="briefing-tool" data-briefing="' + act + '" data-sfx="none" aria-label="' + label + '">' + icon + '</button>';
      bf.root.innerHTML =
        '<div class="briefing-veil" data-briefing="close" data-cursor="Close" data-sfx="none" data-sfx-hover="none"></div>' +
        '<div class="briefing-panel" role="dialog" aria-modal="true" aria-labelledby="briefingTitle" aria-describedby="briefingDesc" tabindex="-1">' +
          '<header class="briefing-bar">' +
            '<p class="briefing-strip"><span class="briefing-kind"></span><span class="briefing-count"></span></p>' +
            '<div class="briefing-tools">' +
              tool('prev', 'Previous entry', ICON.prev) + tool('next', 'Next entry', ICON.next) +
              '<i aria-hidden="true"></i>' + tool('close', 'Close briefing', ICON.close) +
            '</div>' +
          '</header>' +
          '<div class="briefing-scroll"><div class="briefing-content">' +
            '<div class="briefing-media"></div>' +
            '<div class="briefing-body">' +
              '<p class="briefing-meta"></p>' +
              '<h2 class="briefing-title" id="briefingTitle"></h2>' +
              '<p class="briefing-desc" id="briefingDesc"></p>' +
              '<ul class="chips briefing-tags" aria-label="Tags"></ul>' +
              '<div class="briefing-actions"></div>' +
            '</div>' +
          '</div></div>' +
          '<p class="sr-only" aria-live="polite"></p>' +
        '</div>';
      const pick = sel => qs(sel, bf.root);
      bf.panel = pick('.briefing-panel'); bf.scroll = pick('.briefing-scroll');
      bf.kind = pick('.briefing-kind'); bf.count = pick('.briefing-count');
      bf.prev = pick('[data-briefing="prev"]'); bf.next = pick('[data-briefing="next"]');
      bf.media = pick('.briefing-media'); bf.meta = pick('.briefing-meta');
      bf.title = pick('.briefing-title'); bf.desc = pick('.briefing-desc');
      bf.tags = pick('.briefing-tags'); bf.actions = pick('.briefing-actions');
      bf.live = pick('[aria-live]');

      bf.root.addEventListener('click', e => {
        const t = e.target.closest ? e.target.closest('[data-briefing]') : null;
        if (!t) return;
        const act = t.dataset.briefing;
        if (act === 'close') closeBriefing();
        else if (act === 'prev') cycle(-1);
        else if (act === 'next') cycle(1);
        else if (act === 'play') playVideo();
      });
    }

    function onBriefingKey(e) {
      if (topLayer() !== 'modal') return;
      if (e.key === 'Tab') { trapTab(e, bf.panel); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || GK.util.isTyping(e)) return;
      if (e.target && e.target.tagName === 'VIDEO') return;     // arrows seek the footage
      if (e.key === 'ArrowRight') { e.preventDefault(); cycle(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); cycle(-1); }
    }

    function collectionOf(item) {
      const d = GK.data || {};
      const sets = [d.projects, d.certs, d.education, d.internships];
      for (let i = 0; i < sets.length; i++) if (sets[i] && sets[i].indexOf(item) > -1) return sets[i];
      return [item];
    }

    /* wide documents and panoramas sit above the copy; everything else beside it */
    function applyAspect(ar, isDoc, hasMedia) {
      const a = clamp(ar || 1.6, 0.4, 3.2);
      bf.panel.style.setProperty('--ar', a.toFixed(4));
      bf.panel.dataset.layout = !hasMedia ? 'text' : (isDoc && a >= 1.1) || a >= 1.9 ? 'stack' : 'row';
      bf.panel.toggleAttribute('data-doc', !!isDoc);
    }

    function stopVideo() {
      const v = bf.video;
      if (!v) return;
      bf.video = null;
      try { v.pause(); v.removeAttribute('src'); v.load(); } catch (err) { /* already torn down */ }
      if (v.parentNode) { v.parentNode.classList.remove('is-playing'); v.parentNode.removeChild(v); }
      if (bf.playing) { bf.playing = false; bus.emit('media:stop'); }
    }
    /* the <video> is created only on this press: nothing is fetched before it */
    function playVideo() {
      const item = bf.item;
      const frame = qs('.briefing-frame', bf.media);
      if (!item || !item.video || bf.video || !frame) return;
      const v = el('video', { class: 'briefing-video', controls: true, playsinline: true, preload: 'auto', 'aria-label': (item.title || 'Project') + ' — footage' });
      if (item.image) v.poster = item.image;
      const mine = () => bf.video === v;
      const halt = () => { if (mine() && bf.playing) { bf.playing = false; bus.emit('media:stop'); } };
      v.addEventListener('play', () => { if (mine() && !bf.playing) { bf.playing = true; bus.emit('media:play'); } });
      v.addEventListener('pause', halt);
      v.addEventListener('ended', halt);
      v.addEventListener('loadedmetadata', () => { if (mine() && v.videoHeight) applyAspect(v.videoWidth / v.videoHeight, false, true); });
      v.addEventListener('error', () => {
        if (!mine()) return;
        stopVideo();
        GK.toast('Footage could not be loaded.', { tone: 'warn' });
        const again = qs('.briefing-play', frame);
        if (again) refocus(again);
      });
      bf.video = v;
      frame.classList.add('is-playing');
      frame.appendChild(v);
      v.src = item.video;
      const started = v.play();
      if (started && started.catch) started.catch(() => { /* the visitor can still use the controls */ });
      refocus(v);
    }

    function renderBriefing(item, announce) {
      stopVideo();
      const token = ++bf.token;
      const kind = KIND[item.kind] || KIND.project;
      const n = bf.list.length, title = item.title || '';
      bf.item = item;
      bf.kind.textContent = kind.word;
      bf.count.textContent = n > 1 ? '· ' + pad(bf.index + 1) + ' / ' + pad(n) : '';
      bf.prev.hidden = bf.next.hidden = n < 2;
      bf.meta.textContent = item.meta || '';
      bf.desc.textContent = item.desc || item.short || '';
      if (GK.fx && GK.fx.decode) GK.fx.decode(bf.title, title); else bf.title.textContent = title;
      bf.tags.innerHTML = (item.tags || []).map((t, i) => '<li class="chip" style="--i:' + i + '">' + esc(t) + '</li>').join('');
      bf.tags.hidden = !bf.tags.firstChild;
      if (announce) bf.live.textContent = kind.word + ' ' + (bf.index + 1) + ' of ' + n + ': ' + title;

      /* actions come strictly from the data */
      const link = (href, label, icon, primary) => '<a class="btn' + (primary ? ' btn-primary' : '') + '" href="' + esc(href) + '" target="_blank" rel="noopener" data-spot><span>' + label + '</span>' + icon + '</a>';
      let acts = '';
      if (item.download) acts += link(item.download, 'Download', ICON.down, true);
      if (item.link) acts += link(item.link, 'Visit website', ICON.ext, !item.download);
      if (kind.doc && item.image) acts += link(item.image, 'Open full size', ICON.ext, false);
      bf.actions.innerHTML = acts;
      bf.actions.hidden = !acts;

      const box = bf.media;
      box.textContent = '';
      box.hidden = !item.image && !item.video;
      applyAspect(aspects[item.id] || (kind.doc ? 1.414 : 1.6), kind.doc, !box.hidden);
      if (box.hidden) return;

      const frame = el('div', { class: 'briefing-frame' });
      if (item.image) {
        if (item.thumb) {                    // already cached by the lists: instant placeholder
          const ph = el('img', { class: 'briefing-thumb', src: item.thumb, alt: '', decoding: 'async' });
          ph.addEventListener('load', () => {
            if (token === bf.token && !aspects[item.id] && ph.naturalHeight) applyAspect(ph.naturalWidth / ph.naturalHeight, kind.doc, true);
          });
          frame.appendChild(ph);
        }
        const img = el('img', { class: 'briefing-img', alt: title + ' — ' + kind.alt, decoding: 'async' });
        img.addEventListener('load', () => {
          if (!img.naturalHeight) return;
          aspects[item.id] = img.naturalWidth / img.naturalHeight;
          if (token !== bf.token) return;
          applyAspect(aspects[item.id], kind.doc, true);
          frame.classList.add('is-loaded');
        });
        img.addEventListener('error', () => { if (token === bf.token) frame.classList.add('is-failed'); });
        img.src = item.image;
        frame.appendChild(img);
        frame.appendChild(el('p', { class: 'briefing-miss hud-label', text: 'Image unavailable' }));
      }
      if (item.video) {
        const info = [item.videoLength, item.videoSize].filter(Boolean).join(' · ');
        const btn = el('button', { type: 'button', class: 'briefing-play', 'data-briefing': 'play', 'data-cursor': 'Play', 'aria-label': 'Play footage' + (info ? ' · ' + info : '') });
        btn.innerHTML = '<span class="briefing-play-pill"><span class="briefing-play-ico">' + ICON.play + '</span><span class="briefing-play-txt"><b>Play footage</b>' + (info ? '<span>' + esc(info) + '</span>' : '') + '</span></span>';
        frame.appendChild(btn);
      }
      box.appendChild(frame);
    }

    /* the panel grows from wherever it was opened */
    function aimEntrance(from) {
      let origin = '50% 50%';
      if (from && from.getBoundingClientRect && !env.reduced && !env.mobile) {
        const r = from.getBoundingClientRect(), p = bf.panel.getBoundingClientRect();
        if (r.width && p.width) origin = Math.round(r.left + r.width / 2 - p.left) + 'px ' + Math.round(r.top + r.height / 2 - p.top) + 'px';
      }
      bf.panel.style.transformOrigin = origin;
    }

    function openBriefing(item, opts) {
      if (!item || typeof item !== 'object' || flow.busy) return;
      const o = opts || {};
      buildBriefing();
      bf.list = Array.isArray(o.collection) && o.collection.indexOf(item) > -1 ? o.collection : collectionOf(item);
      bf.index = Math.max(0, bf.list.indexOf(item));
      clearTimeout(bf.swapTimer);
      bf.root.classList.remove('is-swapping');
      if (modal.isOpen) {                    // already open: swap the entry in place
        renderBriefing(item, true);
        bf.scroll.scrollTop = 0;
        bus.emit('modal:open', { item });
        return;
      }
      if (palette.isOpen) palette.close();
      cancelTween();
      bf.from = o.from && typeof o.from.focus === 'function' ? o.from : doc.activeElement;
      clearTimeout(bf.closeTimer);
      bf.root.hidden = false;
      modal.isOpen = true;
      state.modalOpen = true;
      lock();
      pushLayer('modal');
      renderBriefing(item, false);
      bf.scroll.scrollTop = 0;
      aimEntrance(bf.from);
      void bf.root.offsetWidth;              // commit the closed state so the entrance transition runs
      bf.root.classList.add('is-open');
      doc.addEventListener('keydown', onBriefingKey);
      GK.sfx('open');
      refocus(bf.panel);
      bus.emit('modal:open', { item });
    }

    function closeBriefing() {
      if (!modal.isOpen) return;
      modal.isOpen = false;
      state.modalOpen = false;
      stopVideo();
      clearTimeout(bf.swapTimer);
      doc.removeEventListener('keydown', onBriefingKey);
      bf.root.classList.remove('is-open', 'is-swapping');
      dropLayer('modal');
      unlock();
      GK.sfx('close');
      bf.closeTimer = setTimeout(() => {
        if (modal.isOpen) return;
        bf.root.hidden = true;
        bf.media.textContent = '';
        bf.token++;
      }, env.reduced ? 0 : 320);
      const back = bf.from;
      bf.from = null;
      bf.item = null;
      refocus(back);
      bus.emit('modal:close');
    }

    function cycle(step) {
      const n = bf.list.length;
      if (!modal.isOpen || n < 2) return;
      bf.index = (bf.index + step + n) % n;
      const item = bf.list[bf.index];
      const swap = () => { renderBriefing(item, true); bf.scroll.scrollTop = 0; bf.root.classList.remove('is-swapping'); };
      GK.sfx('tick');
      stopVideo();
      clearTimeout(bf.swapTimer);
      if (env.reduced) swap();
      else { bf.root.classList.add('is-swapping'); bf.swapTimer = setTimeout(swap, 150); }
      bus.emit('modal:open', { item });
    }

    /* ───────────── ship console (command palette) ───────────── */
    const cs = {
      root: ensure('console', 'console', true), built: false,
      cmds: [], rows: [], nodes: [], active: -1, from: null, closeTimer: 0, freshTimer: 0, unwatch: null,
    };
    const palette = (GK.palette = Object.assign(GK.palette || {}, {
      isOpen: false,
      open: openConsole,
      close: () => closeConsole(false),
      toggle: o => (palette.isOpen ? closeConsole(false) : openConsole(o)),
    }));

    function buildCommands() {
      const d = GK.data || {}, out = [];
      const add = (group, icon, label, hint, keys, run, extra) => out.push(Object.assign({ group, icon, label, hint, keys: String(keys || '').toLowerCase(), run }, extra));
      const onOff = fn => () => (GK.audio && typeof GK.audio[fn] === 'function' ? (GK.audio[fn]() ? 'On' : 'Off') : 'Unavailable');
      const brief = item => from => modal.open(item, { from });

      SECTORS.forEach(s => add('Navigate', 'sector', s.label, pad(s.index) + ' · ' + s.name, s.name + ' ' + s.key + ' sector go to', () => navTo(s.index)));
      (d.projects || []).forEach(p => add('Missions', 'mission', p.title, p.meta, [p.listTitle, p.type, 'project'].concat(p.tags || []).join(' '), brief(p)));
      (d.education || []).forEach(x => add('Records', 'record', x.title, 'Education · ' + (x.period || ''), [x.short, x.org, 'school college'].concat(x.tags || []).join(' '), brief(x)));
      (d.internships || []).forEach(x => add('Records', 'record', x.title, 'Deployment · ' + (x.org || ''), [x.org, x.place, 'internship'].concat(x.tags || []).join(' '), brief(x)));
      (d.certs || []).forEach(x => add('Records', 'record', x.title, 'Certificate · ' + (x.meta || ''), [x.short, 'certification credential'].concat(x.tags || []).join(' '), brief(x)));

      add('Systems', 'music', 'Toggle music', onOff('isMusicOn'), 'audio score soundtrack mute', () => { if (GK.audio && GK.audio.toggleMusic) GK.audio.toggleMusic(); }, { keep: true, kbd: 'M' });
      add('Systems', 'sfx', 'Toggle sound effects', onOff('isSfxOn'), 'audio sfx interface sounds mute', () => { if (GK.audio && GK.audio.toggleSfx) GK.audio.toggleSfx(); }, { keep: true });
      add('Systems', 'write', 'Write a message', 'Contact form', 'contact hire email form project', () => navTo(LAST, {
        onArrive() {
          const name = doc.getElementById('cf-name'), msg = doc.getElementById('cf-message');
          if (msg && !msg.value && d.contact && d.contact.prefill) {
            msg.value = d.contact.prefill;
            msg.dispatchEvent(new Event('input', { bubbles: true }));
          }
          if (name) { try { name.focus(); } catch (err) { /* field not focusable yet */ } }
        },
      }));
      if (typeof d.mailto === 'function') add('Systems', 'mail', 'Open mail app', d.person ? d.person.email : '', 'email mailto contact', () => { window.location.href = d.mailto(); });
      (d.social || []).forEach(x => add('Systems', 'ext', x.name, x.handle, 'social profile link', () => { window.open(x.url, '_blank', 'noopener'); }));

      add('Classified', 'lock', 'Secret panel', 'Restricted', 'easter egg hidden', () => GK.openSecret('console'));
      add('Classified', 'game', 'Asteroid Run', 'Mini-game', 'play game arcade', () => GK.openGame(), { kbd: 'G' });
      return out;
    }

    function buildConsole() {
      if (cs.built) return;
      cs.built = true;
      cs.cmds = buildCommands();
      cs.root.innerHTML =
        '<div class="console-veil" data-console="close" data-cursor="Close" data-sfx="none" data-sfx-hover="none"></div>' +
        '<div class="console-panel" role="dialog" aria-modal="true" aria-label="Ship console" tabindex="-1">' +
          '<div class="console-head">' +
            '<span class="console-prompt hud-label" aria-hidden="true">GK-01' + ICON.chev + '</span>' +
            '<input class="console-input" id="consoleInput" type="text" role="combobox" aria-expanded="true" aria-controls="consoleList" aria-autocomplete="list" aria-label="Search sectors, missions and commands" placeholder="Search sectors, missions, commands" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" />' +
            '<button type="button" class="console-close" data-console="close" data-sfx="none" aria-label="Close console"><kbd>Esc</kbd></button>' +
          '</div>' +
          '<div class="console-list" id="consoleList" role="listbox" aria-label="Commands"></div>' +
          '<p class="console-empty" role="status" hidden>Nothing on the charts matches that.</p>' +
          '<div class="console-foot hud-label" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> Select</span><span><kbd>↵</kbd> Run</span><span class="console-count"></span></div>' +
        '</div>';
      cs.panel = qs('.console-panel', cs.root);
      cs.input = qs('.console-input', cs.root);
      cs.list = qs('.console-list', cs.root);
      cs.empty = qs('.console-empty', cs.root);
      cs.count = qs('.console-count', cs.root);

      cs.input.addEventListener('input', () => { cs.list.classList.remove('is-fresh'); renderList(false); cs.list.scrollTop = 0; });
      cs.root.addEventListener('click', e => {
        const t = e.target.closest ? e.target : null;
        if (!t) return;
        if (t.closest('[data-console="close"]')) { closeConsole(false); return; }
        const row = t.closest('.console-row');
        if (row) runRow(parseInt(row.dataset.i, 10));
      });
      /* pointermove, not mouseover: rows sliding under a resting pointer must not steal the selection */
      cs.list.addEventListener('pointermove', e => {
        const row = e.target.closest ? e.target.closest('.console-row') : null;
        if (!row) return;
        const i = parseInt(row.dataset.i, 10);
        if (i !== cs.active) setActive(i, false);
      });
      bus.on('audio:state', () => { if (palette.isOpen) renderList(true); });
    }

    function onConsoleKey(e) {
      if (topLayer() !== 'palette' || e.isComposing) return;
      const n = cs.rows.length;
      if (e.key === 'Tab') trapTab(e, cs.panel);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!n) return;
        setActive((cs.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n, true);
        GK.sfx('tick');
      } else if (e.key === 'Enter' && doc.activeElement !== qs('.console-close', cs.root)) {
        e.preventDefault();
        if (n) runRow(cs.active);
      }
    }

    /* subsequence match; contiguous runs and word starts score higher. Returns { score, pos[] } or null. */
    const wordStart = (t, i) => i === 0 || ' -—·/#&+.'.indexOf(t.charAt(i - 1)) > -1;
    function match(q, text) {
      const t = text.toLowerCase(), needle = q.replace(/\s+/g, '');
      if (!needle) return null;
      const at = t.indexOf(q), pos = [];
      if (at > -1) {
        for (let i = 0; i < q.length; i++) if (q.charAt(i) !== ' ') pos.push(at + i);
        return { score: 40 + (at === 0 ? 14 : wordStart(t, at) ? 8 : 0) - t.length * 0.05, pos };
      }
      let from = 0, last = -2, score = 0;
      for (let i = 0; i < needle.length; i++) {
        const idx = t.indexOf(needle.charAt(i), from);
        if (idx < 0) return null;
        score += idx === last + 1 ? 6 : wordStart(t, idx) ? 5 : 1;
        score -= Math.min(3, (idx - from) * 0.15);
        pos.push(idx);
        last = idx;
        from = idx + 1;
      }
      return { score: score - t.length * 0.05, pos };
    }
    function mark(text, pos) {
      if (!pos || !pos.length) return esc(text);
      let out = '', p = 0, open = false;
      for (let i = 0; i < text.length; i++) {
        const hit = pos[p] === i;
        if (hit) p++;
        if (hit !== open) { out += hit ? '<mark>' : '</mark>'; open = hit; }
        out += esc(text.charAt(i));
      }
      return out + (open ? '</mark>' : '');
    }
    const hintOf = cmd => String(typeof cmd.hint === 'function' ? cmd.hint() : cmd.hint || '');

    function renderList(keepActive) {
      const q = cs.input.value.trim().toLowerCase().replace(/\s+/g, ' ');
      const tokens = q ? q.split(' ') : [];
      const groups = [], byName = Object.create(null);
      cs.cmds.forEach((cmd, order) => {
        let score = 0, pos = null;
        if (q) {
          const m = match(q, cmd.label);
          if (m) { score = m.score + 12; pos = m.pos; }
          else {                             // fall back to whole words in the hint / keywords
            const blob = (cmd.group + ' ' + hintOf(cmd) + ' ' + cmd.keys).toLowerCase();
            if (!tokens.every(tok => blob.indexOf(tok) > -1)) return;
          }
        }
        let g = byName[cmd.group];
        if (!g) { g = byName[cmd.group] = { name: cmd.group, rows: [], best: -Infinity }; groups.push(g); }
        g.rows.push({ cmd, score, pos, order });
        if (score > g.best) g.best = score;
      });
      if (q) {
        groups.forEach(g => g.rows.sort((a, b) => b.score - a.score || a.order - b.order));
        groups.sort((a, b) => b.best - a.best);
      }

      let html = '', i = 0;
      cs.rows = [];
      groups.forEach((g, gi) => {
        html += '<div class="console-group" role="group" aria-labelledby="consoleGroup' + gi + '">' +
          '<p class="console-group-name hud-label" id="consoleGroup' + gi + '">' + esc(g.name) + '</p>';
        g.rows.forEach(r => {
          const c = r.cmd;
          html += '<div class="console-row" role="option" id="consoleOpt' + i + '" data-i="' + i + '" data-sfx="none" aria-selected="false" style="--i:' + Math.min(i, 14) + '">' +
            ICON[c.icon] +
            '<span class="console-label">' + mark(c.label, r.pos) + '</span>' +
            '<span class="console-hint">' + esc(hintOf(c)) + '</span>' +
            (c.kbd ? '<kbd aria-hidden="true">' + esc(c.kbd) + '</kbd>' : '') +
            '<span class="console-enter" aria-hidden="true">' + ICON.enter + '</span>' +
          '</div>';
          cs.rows.push(r);
          i++;
        });
        html += '</div>';
      });
      cs.list.innerHTML = html;
      cs.nodes = qsa('.console-row', cs.list);
      cs.list.hidden = i === 0;
      cs.empty.hidden = i > 0;
      cs.count.textContent = pad(i) + ' / ' + pad(cs.cmds.length);
      const keep = keepActive ? cs.active : 0;
      cs.active = -1;
      setActive(i ? clamp(keep, 0, i - 1) : -1, false);
    }

    function setActive(i, reveal) {
      const was = cs.nodes[cs.active];
      if (was) { was.classList.remove('is-active'); was.setAttribute('aria-selected', 'false'); }
      cs.active = i;
      const now = cs.nodes[i];
      if (!now) { cs.input.removeAttribute('aria-activedescendant'); return; }
      now.classList.add('is-active');
      now.setAttribute('aria-selected', 'true');
      cs.input.setAttribute('aria-activedescendant', now.id);
      if (reveal) now.scrollIntoView({ block: 'nearest' });
    }

    function runRow(i) {
      const row = cs.rows[i];
      if (!row) return;
      const cmd = row.cmd;
      GK.sfx('click');
      if (cmd.keep) { cmd.run(); renderList(true); return; }   // toggles stay open so the new state is visible
      const from = cs.from;
      closeConsole(true);
      cmd.run(from);
    }

    /* on touch devices the sheet lifts above the on-screen keyboard */
    function watchKeyboard() {
      const vv = window.visualViewport;
      if (!vv || env.fine) return;
      const apply = () => cs.panel.style.setProperty('--kb', Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) + 'px');
      vv.addEventListener('resize', apply);
      vv.addEventListener('scroll', apply);
      apply();
      cs.unwatch = () => {
        vv.removeEventListener('resize', apply);
        vv.removeEventListener('scroll', apply);
        cs.panel.style.removeProperty('--kb');
      };
    }

    function openConsole(opts) {
      if (palette.isOpen || flow.busy || !state.entered) return;
      buildConsole();
      cancelTween();
      cs.from = opts && opts.from && typeof opts.from.focus === 'function' ? opts.from : doc.activeElement;
      clearTimeout(cs.closeTimer);
      clearTimeout(cs.freshTimer);
      cs.input.value = '';
      cs.root.hidden = false;
      palette.isOpen = true;
      lock();
      renderList(false);
      cs.list.scrollTop = 0;
      cs.list.classList.add('is-fresh');
      cs.freshTimer = setTimeout(() => cs.list.classList.remove('is-fresh'), 700);
      void cs.root.offsetWidth;              // commit the closed state so the entrance transition runs
      cs.root.classList.add('is-open');
      doc.addEventListener('keydown', onConsoleKey);
      GK.sfx('open');
      bus.emit('overlay:open', { name: 'palette' });
      refocus(env.fine ? cs.input : cs.panel);   // no surprise keyboard on touch: tap the field to type
      watchKeyboard();
    }

    function closeConsole(quiet) {
      if (!palette.isOpen) return;
      palette.isOpen = false;
      doc.removeEventListener('keydown', onConsoleKey);
      if (cs.unwatch) { cs.unwatch(); cs.unwatch = null; }
      cs.root.classList.remove('is-open');
      unlock();
      if (!quiet) GK.sfx('close');
      cs.closeTimer = setTimeout(() => { if (!palette.isOpen) cs.root.hidden = true; }, env.reduced ? 0 : 240);
      const back = cs.from;
      cs.from = null;
      refocus(back);
      bus.emit('overlay:close', { name: 'palette' });
    }

    function closeOwnLayers() {
      if (palette.isOpen) palette.close();
      if (modal.isOpen) modal.close();
    }

    /* ───────────── wormhole: loop back to Origin + footer ───────────── */
    const ARM_BELOW = 0.8, LOOP_AT = 0.97, LOOP_HOLD = 0.35;
    const pctEl = doc.getElementById('wormholePct');
    const yearEl = doc.getElementById('year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    let lastY = window.scrollY, dir = 0, hold = 0, coolUntil = 0, whK = -1, whPct = -1;
    let endKey = false;             // arrived with the End key: no loop until the visitor moves up again
    function loopToOrigin() {
      if (flow.busy) return;
      closeOwnLayers();
      cancelTween();
      loopArmed = false;
      hold = 0;
      coolUntil = state.time + 3;
      const arrive = () => focusHeading({ id: SECTORS[0].id });
      if (window.scrollY < 2) { arrive(); return; }
      jump(0, { dur: 1200, loop: true, done: arrive });
    }
    if (wormhole) {
      const back = doc.getElementById('wormholeReturn');
      if (back) back.addEventListener('click', loopToOrigin);
      GK.util.onVisible(wormhole, v => wormhole.classList.toggle('is-live', v));
    }
    GK.ticker.add((s, dt) => {
      const y = s.scrollY;
      if (y > lastY + 0.5) dir = 1; else if (y < lastY - 0.5) { dir = -1; endKey = false; }
      lastY = y;
      if (!wormhole) return;
      const w = s.wormhole;

      /* honest readout + the "falling in" scale of the closing line */
      const k = env.reduced || w <= 0 ? 0 : clamp((y - whTop) / Math.max(1, whH - env.h));
      if (k !== whK && (Math.abs(k - whK) > 0.003 || k === 0 || k === 1)) {
        whK = k;
        wormhole.style.setProperty('--wh', (k * k).toFixed(4));
      }
      const pct = Math.round(w * 100);
      if (pct !== whPct) {
        whPct = pct;
        wormhole.style.setProperty('--wh-p', (pct / 100).toFixed(2));
        if (pctEl) pctEl.textContent = pad(pct) + '%';
      }

      /* the loop: only after the visitor scrolled here themselves, kept going
         down and stayed at the very end for a moment. Never with reduced motion. */
      if (env.reduced || !s.entered || flow.busy || stack.length) { hold = 0; return; }
      if (w < ARM_BELOW) { loopArmed = true; hold = 0; return; }
      if (loopArmed && !endKey && w >= LOOP_AT && dir === 1 && s.time >= coolUntil) {
        hold += dt;
        if (hold >= LOOP_HOLD) loopToOrigin();
      } else hold = 0;
    }, 30);

    /* ───────────── clicks: [data-action] and in-page sector links ───────────── */
    function runAction(name, src) {
      switch (name) {
        case 'palette': palette.toggle({ from: src }); return true;
        case 'music': if (GK.audio && GK.audio.toggleMusic) GK.audio.toggleMusic(); return true;
        case 'sfx': if (GK.audio && GK.audio.toggleSfx) GK.audio.toggleSfx(); return true;
        case 'game': GK.openGame(); return true;
        case 'secret': GK.openSecret('action'); return true;
        case 'top': navTo(0); return true;
        default: return false;
      }
    }
    doc.addEventListener('click', e => {
      if (e.defaultPrevented || e.button) return;
      const t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      const act = t.closest('[data-action]');
      if (act && runAction(act.dataset.action, act)) { e.preventDefault(); return; }
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = t.closest('a[href^="#"]');
      if (!a || a.target === '_blank') return;
      const hash = a.getAttribute('href');
      if (hash.length < 2 || !resolve(hash)) return;
      e.preventDefault();
      navTo(hash);
    });

    /* ───────────── keys ───────────── */
    const SCROLL_KEYS = { ArrowUp: 1, ArrowDown: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1, ' ': 1 };
    const WIDGET = '[role="slider"], [role="listbox"], [role="tablist"], [role="radiogroup"], [role="menu"], [role="grid"], video, audio';
    window.addEventListener('keydown', e => {
      if (e.defaultPrevented) return;
      const key = e.key || '';
      if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return;
      const mod = e.ctrlKey || e.metaKey || e.altKey;
      const typing = GK.util.isTyping(e);
      const k = key.length === 1 ? key.toLowerCase() : key;

      if (flow.busy) {                       // mid-jump: Esc fast-forwards, the rest waits
        if (key === 'Escape') { e.preventDefault(); fastForward(); }
        else if (!mod && !typing && SCROLL_KEYS[key]) e.preventDefault();
        return;
      }
      const hopDir = mod || e.shiftKey || typing ? 0 : (key === 'ArrowDown' || k === 'j') ? 1 : (key === 'ArrowUp' || k === 'k') ? -1 : 0;
      if (tween && !hopDir) cancelTween();
      if (key === 'End' && !typing) endKey = true;   // jumping to the end is not "falling in"
      if (!state.entered) return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k === 'k') {
        const top = topLayer();
        if (top && top !== 'palette' && top !== 'modal') return;
        e.preventDefault();
        if (!e.repeat) palette.toggle();
        return;
      }
      if (key === 'Escape') {
        const top = topLayer();
        if (top === 'palette') { e.preventDefault(); palette.close(); }
        else if (top === 'modal') { e.preventDefault(); modal.close(); }
        return;
      }
      if (mod || typing || stack.length) return;

      if (k === '/') { e.preventDefault(); if (!e.repeat) palette.open(); return; }
      if (k === 'm') { if (!e.repeat && GK.audio && GK.audio.toggleMusic) GK.audio.toggleMusic(); return; }
      if (k === 'g') { if (!e.repeat) GK.openGame(); return; }
      if (hopDir) {
        if (e.target && e.target.closest && e.target.closest(WIDGET)) return;
        e.preventDefault();
        if (e.repeat && tween) return;       // holding the key walks sector by sector
        hop(hopDir);
      }
    });

    /* ───────────── protections (owner's feature, soft) ───────────── */
    let warned = false;
    function softBlock() {
      GK.sfx('error');
      if (warned) return;
      warned = true;
      try {
        if (sessionStorage.getItem('gk5.protect')) return;
        sessionStorage.setItem('gk5.protect', '1');
      } catch (err) { /* storage blocked: the in-memory flag still limits it to once */ }
      GK.toast('Inspect shortcuts are switched off on this site.', { tone: 'info' });
    }
    if (PROTECT.contextMenu) {
      doc.addEventListener('contextmenu', e => {
        const t = e.target;
        if (t && t.closest && t.closest('input, textarea, [contenteditable], [data-allow-context]')) return;
        e.preventDefault();
        softBlock();
      });
    }
    if (PROTECT.devShortcuts) {
      window.addEventListener('keydown', e => {
        const k = (e.key || '').toLowerCase(), c = e.code || '';
        const is = ch => c === 'Key' + ch.toUpperCase() || k === ch;
        const hit = k === 'f12'
          || (e.ctrlKey && e.shiftKey && (is('i') || is('j') || is('c')))
          || (e.ctrlKey && !e.shiftKey && !e.altKey && is('u'))
          || (e.metaKey && e.altKey && (is('i') || is('j') || is('c') || is('u')));
        if (!hit) return;
        e.preventDefault();
        e.stopPropagation();
        softBlock();
      }, true);
    }

    /* ───────────── start ───────────── */
    remeasure();
    function deepLink() {
      const dest = location.hash.length > 1 ? resolve(location.hash) : null;
      if (!dest || dest.top) return;
      GK.scroll.measure();
      navTo(location.hash, { instant: true });
      pin = { dest, y: window.scrollY, until: performance.now() + 2500 };
    }
    if (state.entered) deepLink(); else bus.once('enter', deepLink);
  });
})();
