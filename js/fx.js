/* ═══════════════════════════════════════════════════════════════
   VOYAGER · fx.js
   Declarative interaction primitives shared by every section.
   Markup opts in with data-attributes; nothing here knows about
   any specific section.

     data-reveal[="up|fade|left|right|scale|blur"]  data-delay="ms"
     data-reveal-group[="staggerMs"]   children reveal in sequence
     data-split="chars|words"          masked rise, per piece
     data-decode                       sci-fi text scramble → resolve
     data-count="42" data-suffix="+"   count-up on reveal
     data-magnetic[="0.3"]             pointer attraction (uses transform)
     data-tilt[="8"]                   3D tilt (uses transform) + --mx/--my
     data-spot                         --mx/--my (px) for spotlight glows
     data-parallax="0.15"              scroll drift (uses translate)
     data-sfx="name|none"  data-sfx-hover="name|none"

   Reveals wait for the loader: nothing animates until `enter`.
   Call GK.scan(root) after injecting new markup.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const GK = window.GK;
  const { clamp, qsa, easeOutExpo } = GK.util;
  const env = GK.env;

  /* ───────────── text splitting ───────────── */
  function splitText(host) {
    if (host.dataset.splitDone) return;
    host.dataset.splitDone = '1';
    const mode = host.dataset.split === 'words' ? 'words' : 'chars';
    const full = host.textContent.replace(/\s+/g, ' ').trim();
    const wrap = document.createElement('span');
    wrap.className = 's-wrap';
    wrap.setAttribute('aria-hidden', 'true');
    while (host.firstChild) wrap.appendChild(host.firstChild);

    let i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(child => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.nodeValue.split(/(\s+)/).forEach(tok => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(' ')); return; }
            const word = document.createElement('span');
            word.className = 's-word';
            if (mode === 'words') {
              const inner = document.createElement('span');
              inner.className = 's-piece s-word-i';
              inner.style.setProperty('--i', i++);
              inner.textContent = tok;
              word.appendChild(inner);
            } else {
              Array.from(tok).forEach(ch => {
                const c = document.createElement('span');
                c.className = 's-piece s-char';
                c.style.setProperty('--i', i++);
                c.textContent = ch;
                word.appendChild(c);
              });
            }
            frag.appendChild(word);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.tagName !== 'BR') walk(child);
      });
    })(wrap);

    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = full;
    host.appendChild(sr);
    host.appendChild(wrap);
    host.style.setProperty('--n', i);
  }

  /* ───────────── decode (scramble → resolve) ───────────── */
  const GLYPHS = '!<>-_\\/[]{}—=+*^?#01ΔΞΣΩλ';
  const decoding = new WeakMap();
  function decode(node, text, opts) {
    const final = text != null ? String(text) : (node.dataset.decodeText || node.textContent);
    node.dataset.decodeText = final;
    if (env.reduced) { node.textContent = final; return; }
    const prev = decoding.get(node);
    if (prev) prev();
    const o = opts || {};
    const dur = o.duration || Math.min(1400, 420 + final.length * 28);
    const t0 = performance.now();
    node.setAttribute('aria-label', final);
    let lastStep = -1;
    const stop = GK.ticker.add(() => {
      const p = clamp((performance.now() - t0) / dur);
      const step = Math.floor(p * 40);
      if (step === lastStep && p < 1) return; // ~40 visual steps is plenty
      lastStep = step;
      const solved = Math.floor(easeOutExpo(p) * final.length);
      let out = '';
      for (let i = 0; i < final.length; i++) {
        const ch = final[i];
        out += i < solved || ch === ' ' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      node.textContent = out;
      if (p >= 1) { node.textContent = final; stop(); decoding.delete(node); }
    }, 20);
    decoding.set(node, stop);
  }

  /* ───────────── count-up ───────────── */
  function count(node) {
    const end = parseFloat(node.dataset.count) || 0;
    const dec = parseInt(node.dataset.decimals || '0', 10);
    const pre = node.dataset.prefix || '', suf = node.dataset.suffix || '';
    const fmt = v => pre + v.toFixed(dec) + suf;
    if (env.reduced) { node.textContent = fmt(end); return; }
    const dur = parseFloat(node.dataset.duration) || 1600;
    const t0 = performance.now();
    const stop = GK.ticker.add(() => {
      const p = clamp((performance.now() - t0) / dur);
      node.textContent = fmt(end * easeOutExpo(p));
      if (p >= 1) { node.textContent = fmt(end); stop(); }
    }, 20);
  }

  /* ───────────── reveal ───────────── */
  let io = null;
  const pending = new Set();
  function show(node) {
    if (node.classList.contains('is-in')) return;
    node.classList.add('is-in');
    if (node.hasAttribute('data-reveal-group')) {
      Array.prototype.forEach.call(node.children, c => c.classList.add('is-in'));
    }
    if (node.hasAttribute('data-decode')) decode(node);
    if (node.hasAttribute('data-count')) count(node);
    GK.bus.emit('reveal', node);
  }
  function observe(node) {
    if (node.dataset.fxObserved) return;
    node.dataset.fxObserved = '1';
    if (!io) { pending.add(node); return; }
    watch(node);
  }
  /* A reveal target is handed to the observer only once its sector is within a screen of the
     viewport: an observer re-measures every target on every scroll frame, and most of the
     page's reveal targets are far away at any moment. */
  const sectors = new Map();   // sector element → { list, on, off }
  function watch(node) {
    const host = node.closest && node.closest('.panel, .wormhole');
    if (!host || !io.unobserve) { io.observe(node); return; }
    let h = sectors.get(host);
    if (!h) {
      h = { list: [], on: false, off: null };
      sectors.set(host, h);
      h.off = GK.util.onVisible(host, v => {
        if (!v || h.on) return;
        h.on = true;
        h.list.forEach(n => io.observe(n));
        h.list.length = 0;
        if (h.off) h.off();
      }, { rootMargin: '100% 0px' });
    }
    if (h.on) io.observe(node); else h.list.push(node);
  }
  function startObserving() {
    if (io) return;
    if (!('IntersectionObserver' in window)) { pending.forEach(show); pending.clear(); io = { observe: show }; return; }
    io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });
    pending.forEach(watch);
    pending.clear();
  }

  /* ───────────── parallax ───────────── */
  let parallax = [];
  function measureParallax() {
    const y = window.scrollY;
    parallax.forEach(p => {
      const prev = p.el.style.translate;
      p.el.style.translate = 'none';
      const r = p.el.getBoundingClientRect();
      p.el.style.translate = prev;
      p.mid = r.top + y + r.height / 2;
    });
  }

  /* ───────────── scan ───────────── */
  function scan(rootNode) {
    const ctx = rootNode && rootNode.querySelectorAll ? rootNode : document;
    const all = sel => { const list = qsa(sel, ctx); if (ctx !== document && ctx.matches && ctx.matches(sel)) list.unshift(ctx); return list; };

    all('[data-split]').forEach(n => { splitText(n); observe(n); });
    all('[data-reveal-group]').forEach(group => {
      const stagger = parseInt(group.dataset.revealGroup, 10);
      if (stagger) group.style.setProperty('--stagger', stagger + 'ms');
      Array.prototype.forEach.call(group.children, (c, i) => {
        if (!c.hasAttribute('data-reveal')) c.setAttribute('data-reveal', '');
        c.style.setProperty('--i', i);
        c.dataset.fxObserved = '1'; // revealed by the group, not individually
      });
      observe(group);
    });
    all('[data-reveal]').forEach(n => {
      if (n.dataset.delay) n.style.setProperty('--delay', parseInt(n.dataset.delay, 10) || 0);
      observe(n);
    });
    all('[data-decode]').forEach(n => { if (!n.dataset.decodeText) n.dataset.decodeText = n.textContent; observe(n); });
    all('[data-count]').forEach(observe);

    if (env.fine && !env.reduced) {
      let added = false;
      all('[data-parallax]').forEach(n => {
        if (n.dataset.fxParallax) return;
        n.dataset.fxParallax = '1';
        parallax.push({ el: n, k: parseFloat(n.dataset.parallax) || 0.1, mid: 0, vis: false });
        const item = parallax[parallax.length - 1];
        GK.util.onVisible(n, v => { item.vis = v; });
        added = true;
      });
      if (added) measureParallax();
    }
  }

  /* ───────────── pointer-driven: tilt · spot · magnetic ─────────────
     One delegated pointermove. Targets are written to small springs
     that the ticker eases every frame, so the motion never depends on
     a component's own CSS transition list. */
  function initPointerFx() {
    if (!env.fine) return;
    const { damp } = GK.util;
    let tiltEl = null, magEl = null, spotEl = null, queued = false, lastEvt = null;
    const tilts = new Map(), mags = new Map(); // node → { x, y, tx, ty, held }

    function hold(map, node) {
      let s = map.get(node);
      if (!s) { s = { x: 0, y: 0, tx: 0, ty: 0, held: true }; map.set(node, s); }
      s.held = true;
      return s;
    }
    function release(map, node) { const s = map.get(node); if (s) { s.tx = 0; s.ty = 0; s.held = false; } }

    function step(map, dt, a, b, unit, digits, cls, rest) {
      map.forEach((s, node) => {
        const k = s.held ? 14 : 6;
        s.x = damp(s.x, s.tx, k, dt);
        s.y = damp(s.y, s.ty, k, dt);
        if (!s.held && Math.abs(s.x) < rest && Math.abs(s.y) < rest) {
          map.delete(node);
          node.classList.remove(cls);
          node.style.removeProperty(a);
          node.style.removeProperty(b);
          return;
        }
        node.style.setProperty(a, s.x.toFixed(digits) + unit);
        node.style.setProperty(b, s.y.toFixed(digits) + unit);
      });
    }
    GK.ticker.add((state, dt) => {
      if (tilts.size) step(tilts, dt, '--rx', '--ry', 'deg', 2, 'is-tilting', 0.02);
      if (mags.size) step(mags, dt, '--mag-x', '--mag-y', 'px', 1, 'is-pulled', 0.05);
    }, 12);

    function apply() {
      queued = false;
      const e = lastEvt;
      if (!e) return;
      const target = e.target && e.target.closest ? e.target : null;

      const t = target && !env.reduced ? target.closest('[data-tilt]') : null;
      if (t !== tiltEl) { if (tiltEl) release(tilts, tiltEl); tiltEl = t; if (t) t.classList.add('is-tilting'); }
      if (t) {
        const r = t.getBoundingClientRect();
        const px = clamp((e.clientX - r.left) / r.width), py = clamp((e.clientY - r.top) / r.height);
        const max = parseFloat(t.dataset.tilt) || 7;
        const s = hold(tilts, t);
        s.tx = (0.5 - py) * 2 * max;
        s.ty = (px - 0.5) * 2 * max;
        t.style.setProperty('--mx', (px * r.width).toFixed(1) + 'px');
        t.style.setProperty('--my', (py * r.height).toFixed(1) + 'px');
      }

      const sp = target ? target.closest('[data-spot]') : null;
      if (sp !== spotEl) { if (spotEl) spotEl.classList.remove('is-spot'); spotEl = sp; if (sp) sp.classList.add('is-spot'); }
      if (sp && sp !== t) {
        const r = sp.getBoundingClientRect();
        sp.style.setProperty('--mx', (e.clientX - r.left).toFixed(1) + 'px');
        sp.style.setProperty('--my', (e.clientY - r.top).toFixed(1) + 'px');
      }

      const m = target && !env.reduced ? target.closest('[data-magnetic]') : null;
      if (m !== magEl) { if (magEl) release(mags, magEl); magEl = m; if (m) m.classList.add('is-pulled'); }
      if (m) {
        const r = m.getBoundingClientRect();
        const k = parseFloat(m.dataset.magnetic) || 0.28;
        const s = hold(mags, m);
        /* measure against the resting box, not the displaced one, or the pull fights itself */
        s.tx = (e.clientX - (r.left - s.x + r.width / 2)) * k;
        s.ty = (e.clientY - (r.top - s.y + r.height / 2)) * k;
      }
    }

    document.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      lastEvt = e;
      if (!queued) { queued = true; requestAnimationFrame(apply); }
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => {
      if (tiltEl) { release(tilts, tiltEl); tiltEl = null; }
      if (magEl) { release(mags, magEl); magEl = null; }
      if (spotEl) { spotEl.classList.remove('is-spot'); spotEl = null; }
    });
  }

  /* ───────────── declarative sound ───────────── */
  const INTERACTIVE = 'a[href], button, [role="button"], [data-sfx], [data-sfx-hover], [data-cursor], summary, label[for], .is-clickable';
  function initSound() {
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest(INTERACTIVE);
      if (!t) return;
      const name = t.dataset.sfx || 'click';
      if (name !== 'none') GK.sfx(name);
    }, true);

    if (env.fine) {
      let lastHover = null, lastTime = 0;
      document.addEventListener('pointerover', e => {
        if (e.pointerType === 'touch') return;
        const t = e.target.closest && e.target.closest(INTERACTIVE);
        if (t === lastHover) return;
        lastHover = t;
        if (!t) return;
        const now = performance.now();
        if (now - lastTime < 70) return;
        lastTime = now;
        const name = t.dataset.sfxHover || 'hover';
        if (name !== 'none') GK.sfx(name);
      }, { passive: true });
    }

    let lastType = 0;
    document.addEventListener('keydown', e => {
      if (!GK.util.isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1 && e.key !== 'Backspace' && e.key !== 'Enter') return;
      const now = performance.now();
      if (now - lastType < 45) return;
      lastType = now;
      GK.sfx('type');
    });
  }

  /* ───────────── module ───────────── */
  GK.fx = { decode, count, split: splitText, reveal: show };

  GK.register('fx', function () {
    document.documentElement.classList.add('has-reveal');
    GK.scan = scan;
    scan(document);
    initPointerFx();
    initSound();

    /* hold every reveal until the visitor has passed the loader */
    if (GK.state.entered) startObserving();
    else GK.bus.once('enter', () => setTimeout(startObserving, env.reduced ? 0 : 350));

    /* sectors out of view get .is-offstage so their decorative CSS loops pause (core.css):
       an infinite animation costs a style pass every frame even when nobody can see it */
    qsa('.panel, .wormhole').forEach(n => GK.util.onVisible(n, v => n.classList.toggle('is-offstage', !v)));

    GK.bus.on('measure', measureParallax);
    GK.ticker.add(state => {
      if (!parallax.length) return;
      const mid = state.scrollY + env.h / 2;
      for (let i = 0; i < parallax.length; i++) {
        const p = parallax[i];
        if (!p.vis) continue;
        p.el.style.translate = '0 ' + ((p.mid - mid) * -p.k).toFixed(1) + 'px';
      }
    }, 15);
  });
})();
