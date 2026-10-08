/* ═══════════════════════════════════════════════════════════════
   VOYAGER · extras.js
   The two hidden rooms:
     · the secret panel   — Konami code (↑↑↓↓←→←→BA) or the console
     · "Asteroid Run"     — a small arcade game (G, console, secret)
   Both are full-screen overlays that announce themselves on the bus
   (overlay:open / overlay:close) so travel keys pause and the music
   muffles while they are up.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const GK = window.GK;

  GK.register('extras', function init(GK) {
    const { clamp, rand, qs, esc } = GK.util;
    const env = GK.env, bus = GK.bus;
    const secretEl = document.getElementById('secret');
    const gameEl = document.getElementById('game');

    /* ───────────────────────── shared overlay plumbing ───────────────────────── */
    let lastFocus = null;
    function trapTab(e, rootEl) {
      if (e.key !== 'Tab') return;
      const list = Array.prototype.filter.call(rootEl.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])'), n => n.offsetParent !== null);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function openOverlay(node, name) {
      lastFocus = document.activeElement;
      node.hidden = false;
      void node.offsetWidth; // let the hidden → visible transition run
      node.classList.add('is-open');
      document.documentElement.classList.add('has-extra');
      bus.emit('overlay:open', { name });
    }
    function closeOverlay(node, name) {
      node.classList.remove('is-open');
      document.documentElement.classList.remove('has-extra');
      bus.emit('overlay:close', { name });
      setTimeout(() => { if (!node.classList.contains('is-open')) node.hidden = true; }, 420);
      if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* element gone */ } }
      lastFocus = null;
    }

    /* ═════════════════════════ SECRET PANEL ═════════════════════════ */
    let typeStop = null, secretOpen = false;
    function typeMessage(node, text) {
      if (typeStop) typeStop();
      if (env.reduced) { node.textContent = text; return; }
      node.textContent = '';
      let shown = 0, acc = 0;
      typeStop = GK.ticker.add((state, dt) => {
        acc += dt * 1000;
        const want = Math.min(text.length, Math.floor(acc / 18));
        if (want !== shown) {
          shown = want;
          node.textContent = text.slice(0, shown);
          if (shown % 5 === 0) GK.sfx('tick');
        }
        if (shown >= text.length) { typeStop(); typeStop = null; }
      }, 30);
    }
    function openSecret() {
      if (!secretEl || secretOpen) return;
      if (gameOpen) closeGame();
      secretOpen = true;
      openOverlay(secretEl, 'secret');
      if (GK.cosmos && GK.cosmos.shower) GK.cosmos.shower(2.5);
      GK.sfx('success');
      typeMessage(qs('.secret-body', secretEl), GK.data.secret.message);
      const close = qs('.secret-close', secretEl);
      if (close) close.focus({ preventScroll: true });
    }
    function closeSecret() {
      if (!secretOpen) return;
      secretOpen = false;
      if (typeStop) { typeStop(); typeStop = null; }
      GK.sfx('close');
      closeOverlay(secretEl, 'secret');
    }
    if (secretEl) {
      qs('.secret-favs', secretEl).innerHTML = GK.data.secret.favs.map(f => '<li class="chip">' + esc(f) + '</li>').join('');
      qs('.secret-sig', secretEl).textContent = GK.data.secret.signature;
      qs('.secret-sr', secretEl).textContent = GK.data.secret.message; // the typed line is decorative
      secretEl.addEventListener('click', e => {
        if (e.target.closest('[data-secret-close]')) closeSecret();
        else if (e.target.closest('[data-secret-play]')) { closeSecret(); setTimeout(openGame, 200); }
      });
      secretEl.addEventListener('keydown', e => trapTab(e, secretEl));
    }
    GK.openSecret = openSecret;

    /* Konami code — capture phase so no other handler can swallow the keys first */
    const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let kIdx = 0;
    document.addEventListener('keydown', e => {
      if (GK.util.isTyping(e) || !GK.state.entered) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      kIdx = key === KONAMI[kIdx] ? kIdx + 1 : key === KONAMI[0] ? 1 : 0;
      if (kIdx === KONAMI.length) { kIdx = 0; openSecret(); }
    }, true);

    /* ═════════════════════════ ASTEROID RUN ═════════════════════════ */
    let gameOpen = false, stopLoop = null;
    const canvas = gameEl ? qs('canvas', gameEl) : null;
    const ctx = canvas ? canvas.getContext('2d') : null;
    const ui = gameEl ? {
      score: qs('[data-g="score"]', gameEl), best: qs('[data-g="best"]', gameEl), shields: qs('[data-g="shields"]', gameEl),
      panel: qs('.game-panel', gameEl), title: qs('.game-title', gameEl), sub: qs('.game-sub', gameEl), go: qs('[data-game-start]', gameEl),
    } : null;

    const COL = { ink: '#F3F1EA', dim: 'rgba(243,241,234,0.5)', violet: '#8F88FF', cyan: '#00E5FF', amber: '#FFB454', red: '#FF5E7A' };
    let W = 0, H = 0, dpr = 1;
    let mode = 'idle'; // idle · play · over
    let ship, rocks, shots, sparks, cells, stars, score, best, shields, time, spawnT, fireT, shake, invuln, keys, pointerX, usePointer;

    function fit() {
      const f = GK.util.fitCanvas(canvas, 1.5);
      W = f.w; H = f.h; dpr = f.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function resetWorld() {
      ship = { x: W / 2, y: H - Math.max(90, H * 0.14), vx: 0, r: 13 };
      rocks = []; shots = []; sparks = []; cells = [];
      score = 0; shields = 3; time = 0; spawnT = 0.6; fireT = 0; shake = 0; invuln = 0;
      keys = { left: false, right: false };
      pointerX = W / 2; usePointer = false;
      if (!stars || !stars.length) stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: rand(0.3, 1) }));
      paintHud();
    }
    function paintHud() {
      ui.score.textContent = String(Math.floor(score)).padStart(5, '0');
      ui.best.textContent = String(Math.floor(best)).padStart(5, '0');
      ui.shields.textContent = '◆'.repeat(Math.max(0, shields)) + '◇'.repeat(Math.max(0, 3 - shields));
    }
    function makeRock(x, y, r, vx, vy) {
      const n = 7 + ((Math.random() * 4) | 0), pts = [];
      for (let i = 0; i < n; i++) pts.push(rand(0.72, 1.12));
      return { x, y, r, vx, vy, a: rand(6.28), spin: rand(-1.2, 1.2), pts, hp: r > 34 ? 3 : r > 22 ? 2 : 1 };
    }
    function spawnRock() {
      const level = 1 + time / 22;
      const r = rand(14, clamp(26 + level * 5, 30, 52));
      rocks.push(makeRock(rand(r, W - r), -r - 10, r, rand(-28, 28) * level * 0.6, rand(70, 120) + level * 26));
    }
    function burst(x, y, n, color, speed) {
      for (let i = 0; i < n && sparks.length < 220; i++) {
        const a = rand(6.28), s = rand(0.25, 1) * speed;
        sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.8), t: 0, color });
      }
    }
    function hurt() {
      if (invuln > 0) return;
      shields--; invuln = 1.6; shake = 0.35;
      burst(ship.x, ship.y, 26, COL.red, 240);
      GK.sfx('explode');
      paintHud();
      if (shields <= 0) endGame();
    }
    function endGame() {
      mode = 'over';
      if (score > best) { best = Math.floor(score); GK.store.set('game.best', best); }
      paintHud();
      GK.sfx('gameover');
      ui.title.textContent = 'Signal lost';
      ui.sub.textContent = 'Score ' + Math.floor(score) + ' · Best ' + best;
      ui.go.textContent = 'Fly again';
      ui.panel.hidden = false;
      ui.go.focus({ preventScroll: true });
    }
    function startGame() {
      fit(); resetWorld();
      mode = 'play';
      ui.panel.hidden = true;
      canvas.focus({ preventScroll: true });
      GK.sfx('whoosh');
    }

    function step(dt) {
      time += dt;
      /* ship: pointer leads when used, keys otherwise */
      const accel = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (accel !== 0) usePointer = false;
      if (usePointer) ship.vx = (pointerX - ship.x) * 9;
      else ship.vx = GK.util.damp(ship.vx, accel * 520, 9, dt);
      ship.x = clamp(ship.x + ship.vx * dt, 18, W - 18);
      invuln = Math.max(0, invuln - dt);
      shake = Math.max(0, shake - dt);

      fireT -= dt;
      if (fireT <= 0) {
        fireT = 0.19;
        shots.push({ x: ship.x, y: ship.y - 16, vy: -760 });
        GK.sfx('shoot', { x: (ship.x / W) * window.innerWidth });
      }

      spawnT -= dt;
      if (spawnT <= 0) { spawnRock(); spawnT = clamp(0.95 - time * 0.012, 0.28, 0.95) * rand(0.7, 1.3); }

      for (let i = shots.length - 1; i >= 0; i--) { const s = shots[i]; s.y += s.vy * dt; if (s.y < -20) shots.splice(i, 1); }

      for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        r.x += r.vx * dt; r.y += r.vy * dt; r.a += r.spin * dt;
        if (r.x < r.r || r.x > W - r.r) r.vx *= -1;
        if (r.y - r.r > H + 20) { rocks.splice(i, 1); continue; }
        let dead = false;
        for (let j = shots.length - 1; j >= 0; j--) {
          const s = shots[j], dx = s.x - r.x, dy = s.y - r.y;
          if (dx * dx + dy * dy < r.r * r.r) {
            shots.splice(j, 1);
            r.hp--;
            burst(s.x, s.y, 5, COL.ink, 120);
            if (r.hp <= 0) { dead = true; break; }
            GK.sfx('hit', { x: (r.x / W) * window.innerWidth });
          }
        }
        if (dead) {
          rocks.splice(i, 1);
          score += Math.round(r.r) * 2;
          burst(r.x, r.y, 14, COL.violet, 200);
          GK.sfx('explode', { x: (r.x / W) * window.innerWidth });
          if (r.r > 26 && rocks.length < 40) {
            for (let k = 0; k < 2; k++) rocks.push(makeRock(r.x + (k ? 10 : -10), r.y, r.r * 0.55, (k ? 1 : -1) * rand(50, 110), r.vy * rand(0.8, 1.1)));
          }
          if (Math.random() < 0.12 && cells.length < 3) cells.push({ x: r.x, y: r.y, vy: 110, t: 0 });
          paintHud();
          continue;
        }
        const dx = ship.x - r.x, dy = ship.y - r.y;
        if (dx * dx + dy * dy < (r.r + ship.r - 4) * (r.r + ship.r - 4)) { rocks.splice(i, 1); burst(r.x, r.y, 10, COL.ink, 160); hurt(); }
      }

      for (let i = cells.length - 1; i >= 0; i--) {
        const c = cells[i];
        c.y += c.vy * dt; c.t += dt;
        if (c.y > H + 20) { cells.splice(i, 1); continue; }
        const dx = ship.x - c.x, dy = ship.y - c.y;
        if (dx * dx + dy * dy < 28 * 28) {
          cells.splice(i, 1);
          if (shields < 3) shields++; else score += 150;
          burst(c.x, c.y, 12, COL.amber, 150);
          GK.sfx('pickup');
          paintHud();
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= 0.985;
        if (p.t >= p.life) sparks.splice(i, 1);
      }

      if (mode === 'play') { score += dt * 8; if ((time * 4 | 0) !== ((time - dt) * 4 | 0)) paintHud(); }
    }

    function draw(dt) {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (shake > 0 && !env.reduced) ctx.translate(rand(-1, 1) * shake * 14, rand(-1, 1) * shake * 14);

      /* speed lines */
      ctx.strokeStyle = 'rgba(243,241,234,0.22)'; ctx.lineWidth = 1;
      ctx.beginPath();
      const fall = mode === 'play' ? 240 : 60;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.y += fall * s.z * dt;
        if (s.y > H) { s.y = -10; s.x = Math.random() * W; }
        ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + 3 + 10 * s.z * (fall / 240));
      }
      ctx.stroke();

      /* shots */
      ctx.strokeStyle = COL.violet; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < shots.length; i++) { const s = shots[i]; ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + 12); }
      ctx.stroke();

      /* rocks: irregular wireframes */
      ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
      for (let i = 0; i < rocks.length; i++) {
        const r = rocks[i], n = r.pts.length;
        ctx.strokeStyle = r.hp > 1 ? COL.ink : COL.dim;
        ctx.fillStyle = 'rgba(8,10,16,0.85)';
        ctx.beginPath();
        for (let k = 0; k <= n; k++) {
          const a = r.a + (k % n) / n * 6.2832, rr = r.r * r.pts[k % n];
          const x = r.x + Math.cos(a) * rr, y = r.y + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.fill(); ctx.stroke();
      }

      /* energy cells */
      ctx.strokeStyle = COL.amber; ctx.lineWidth = 1.5;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i], s = 7 + Math.sin(c.t * 6) * 1.5;
        ctx.beginPath(); ctx.moveTo(c.x, c.y - s); ctx.lineTo(c.x + s, c.y); ctx.lineTo(c.x, c.y + s); ctx.lineTo(c.x - s, c.y); ctx.closePath(); ctx.stroke();
      }

      /* sparks */
      for (let i = 0; i < sparks.length; i++) {
        const p = sparks[i];
        ctx.globalAlpha = 1 - p.t / p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
      ctx.globalAlpha = 1;

      /* ship */
      if (mode !== 'over' && (invuln <= 0 || Math.floor(invuln * 12) % 2 === 0)) {
        const lean = clamp(ship.vx / 520, -1, 1) * 0.35;
        ctx.save();
        ctx.translate(ship.x, ship.y); ctx.rotate(lean);
        ctx.strokeStyle = COL.ink; ctx.fillStyle = 'rgba(8,10,16,0.9)'; ctx.lineWidth = 1.75;
        ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(12, 12); ctx.lineTo(0, 6); ctx.lineTo(-12, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = COL.cyan; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-4, 11); ctx.lineTo(0, 16 + Math.random() * 9); ctx.lineTo(4, 11); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    function loop(state, dt) {
      if (!gameOpen) return;
      if (mode === 'play') step(dt);
      else if (mode === 'over') { /* let debris settle behind the panel */
        for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t >= p.life) sparks.splice(i, 1); }
      }
      draw(dt);
    }

    function openGame() {
      if (!gameEl || !ctx || gameOpen) return;
      if (secretOpen) closeSecret();
      gameOpen = true;
      best = GK.store.get('game.best', 0) || 0;
      openOverlay(gameEl, 'game');
      GK.state.paused = true;
      fit(); resetWorld();
      mode = 'idle';
      ui.title.textContent = 'Asteroid Run';
      ui.sub.textContent = env.fine ? 'Steer with the mouse or ← →  ·  the cannon fires by itself  ·  Esc to leave' : 'Drag to steer — the cannon fires by itself';
      ui.go.textContent = 'Launch';
      ui.panel.hidden = false;
      ui.go.focus({ preventScroll: true });
      stopLoop = GK.ticker.add(loop, 40);
      GK.sfx('open');
    }
    function closeGame() {
      if (!gameOpen) return;
      gameOpen = false;
      mode = 'idle';
      GK.state.paused = false;
      if (stopLoop) { stopLoop(); stopLoop = null; }
      GK.sfx('close');
      closeOverlay(gameEl, 'game');
    }
    GK.openGame = openGame;

    if (gameEl && ctx) {
      gameEl.addEventListener('click', e => {
        if (e.target.closest('[data-game-close]')) closeGame();
        else if (e.target.closest('[data-game-start]')) startGame();
      });
      gameEl.addEventListener('keydown', e => trapTab(e, gameEl));
      canvas.addEventListener('pointermove', e => {
        const r = canvas.getBoundingClientRect();
        pointerX = e.clientX - r.left;
        if (e.pointerType !== 'mouse' || mode === 'play') usePointer = true;
      });
      canvas.addEventListener('pointerdown', e => {
        const r = canvas.getBoundingClientRect();
        pointerX = e.clientX - r.left; usePointer = true;
      });
      bus.on('resize', () => { if (gameOpen) { fit(); ship.y = H - Math.max(90, H * 0.14); ship.x = clamp(ship.x, 18, W - 18); } });
      bus.on('visibility', v => { if (v.hidden && gameOpen && keys) keys.left = keys.right = false; });
    }

    /* keys for both rooms — capture phase so page shortcuts never fire underneath */
    document.addEventListener('keydown', e => {
      if (secretOpen) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSecret(); }
        return;
      }
      if (!gameOpen) return;
      const k = e.key;
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); closeGame(); return; }
      if (k === 'Tab') return;
      e.stopPropagation();
      if (mode !== 'play') {
        if ((k === ' ' || k === 'Enter') && document.activeElement !== ui.go) { e.preventDefault(); startGame(); }
        return;
      }
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.left = true; e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = true; e.preventDefault(); }
      else if (k === ' ' || k === 'ArrowUp' || k === 'ArrowDown') e.preventDefault(); // never scroll the page behind the game
    }, true);
    document.addEventListener('keyup', e => {
      if (!gameOpen || !keys) return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
    }, true);
  });
})();
