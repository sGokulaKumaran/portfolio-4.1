/* ═══════════════════════════════════════════════════════════════
   VOYAGER 6.0 · extras.js
   The Three Hidden Rooms of Voyager:
     1. Secret Bridge Panel       — Konami code (↑↑↓↓←→←→BA) or Ship Console
     2. Explorer Field Objectives — 7 interactive anomalies across the 10 sectors (Q or Header Star)
     3. Dual Arcade Deck          — Cartridge 01: Asteroid Run DX (Power-ups, EMP Nova, Bosses)
                                  — Cartridge 02: Orbital Slingshot (Real N-Body Gravity Golf)

   Upgrades & Fixes in 6.0:
   - Fixed critical ReferenceError (`state is not defined`) in `stepSlingshot`
   - Added taut launch vector band + live Δv velocity readout in Orbital Slingshot
   - Added Boss Health HUD bar & active powerup badges in Asteroid Run DX
   - Safe overlay scroll lock counting (no premature unlock when switching overlays)
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const GK = window.GK;

  GK.register('extras', function init(GK) {
    const { clamp, rand, qs, qsa, esc, pad } = GK.util;
    const env = GK.env, state = GK.state, bus = GK.bus, store = GK.store;
    const secretEl = document.getElementById('secret');
    const questsEl = document.getElementById('quests');
    const gameEl = document.getElementById('game');

    /* ───────────────────────── shared overlay plumbing ───────────────────────── */
    let lastFocus = null;
    let extraLocks = 0;
    function trapTab(e, rootEl) {
      if (e.key !== 'Tab') return;
      const list = Array.prototype.filter.call(rootEl.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'), n => n.offsetParent !== null);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    function openOverlay(node, name) {
      if (extraLocks++ === 0) {
        lastFocus = document.activeElement;
        document.documentElement.classList.add('has-extra');
      }
      node.hidden = false;
      void node.offsetWidth;
      node.classList.add('is-open');
      bus.emit('overlay:open', { name });
    }
    function closeOverlay(node, name) {
      node.classList.remove('is-open');
      bus.emit('overlay:close', { name });
      setTimeout(() => { if (!node.classList.contains('is-open')) node.hidden = true; }, 420);
      if (extraLocks > 0 && --extraLocks === 0) {
        document.documentElement.classList.remove('has-extra');
        if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
        lastFocus = null;
      }
    }

    /* ═════════════════════════ 1. EXPLORER FIELD OBJECTIVES ═════════════════════════ */
    const objectives = (GK.data && Array.isArray(GK.data.objectives)) ? GK.data.objectives : [];
    const savedDone = store.get('objectives', []);
    const unlockedSet = new Set(Array.isArray(savedDone) ? savedDone : []);
    let questsOpen = false;

    function emitObjectiveState() {
      bus.emit('objective:state', { done: unlockedSet.size, total: objectives.length || 7 });
    }
    function renderQuests() {
      if (!questsEl) return;
      const listEl = document.getElementById('questsList');
      const progLbl = document.getElementById('questsProgressLabel');
      const barFill = document.getElementById('questsBarFill');
      const rewardBtn = document.getElementById('questsRewardBtn');
      const total = objectives.length || 7;
      const done = unlockedSet.size;
      if (progLbl) progLbl.textContent = done + ' / ' + total + ' discovered';
      if (barFill) barFill.style.width = Math.round((done / Math.max(1, total)) * 100) + '%';
      if (rewardBtn) rewardBtn.hidden = done < total;
      if (listEl) {
        listEl.innerHTML = objectives.map(obj => {
          const isDone = unlockedSet.has(obj.id);
          return '<li class="quest-item' + (isDone ? ' is-done' : '') + '">' +
            '<span class="quest-badge">' + (isDone ? 'VERIFIED' : obj.code) + '</span>' +
            '<div class="quest-info">' +
              '<p class="quest-name">' + esc(obj.title) + '</p>' +
              '<p class="quest-desc">' + esc(obj.desc) + '</p>' +
            '</div>' +
            '<button type="button" class="quest-go" data-quest-go="' + obj.sector + '" data-quest-id="' + esc(obj.id) + '">' +
              esc(obj.sectorName || 'Sector ' + pad(obj.sector)) + ' ↗' +
            '</button>' +
          '</li>';
        }).join('');
      }
    }

    function unlockObjective(id) {
      if (!id || unlockedSet.has(id)) return false;
      const obj = objectives.find(o => o.id === id);
      if (!obj) return false;
      unlockedSet.add(id);
      store.set('objectives', Array.from(unlockedSet));
      emitObjectiveState();
      if (questsOpen) renderQuests();
      if (GK.state.entered) {
        GK.sfx('discover');
        GK.toast('Objective Unlocked · ' + obj.title + ' (' + unlockedSet.size + '/' + objectives.length + ')', { tone: 'ok', duration: 3800 });
        if (GK.cosmos && GK.cosmos.ripple) GK.cosmos.ripple(window.innerWidth / 2, window.innerHeight / 2, 0.9);
      }
      return true;
    }

    function openLog() {
      if (!questsEl) return;
      if (questsOpen) { closeLog(); return; }
      if (secretOpen) closeSecret();
      if (gameOpen) closeGame();
      questsOpen = true;
      renderQuests();
      openOverlay(questsEl, 'quests');
      GK.sfx('open');
      const closeBtn = qs('[data-quests-close]', questsEl);
      if (closeBtn) closeBtn.focus({ preventScroll: true });
    }
    function closeLog() {
      if (!questsOpen) return;
      questsOpen = false;
      GK.sfx('close');
      closeOverlay(questsEl, 'quests');
    }

    if (questsEl) {
      questsEl.addEventListener('click', e => {
        if (e.target.closest('[data-quests-close]')) { closeLog(); return; }
        if (e.target.closest('[data-quests-play]')) { closeLog(); setTimeout(() => openGame('slingshot'), 180); return; }
        if (e.target.closest('[data-quests-reward]')) {
          closeLog();
          if (GK.cosmos) {
            if (GK.cosmos.shower) GK.cosmos.shower(6.0);
            if (GK.cosmos.ripple) GK.cosmos.ripple(window.innerWidth / 2, window.innerHeight / 2, 1.4);
            if (GK.cosmos.flash) GK.cosmos.flash(0.45);
          }
          GK.sfx('discover');
          GK.toast('Master Voyager · Supernova Meteor Shower Engaged!', { tone: 'ok', duration: 4200 });
          return;
        }
        const go = e.target.closest('[data-quest-go]');
        if (go) {
          const id = go.dataset.questId;
          const sec = parseInt(go.dataset.questGo, 10) || 0;
          closeLog();
          if (id === 'ace-pilot') setTimeout(() => openGame('asteroid'), 180);
          else GK.navTo(sec);
        }
      });
      questsEl.addEventListener('keydown', e => trapTab(e, questsEl));
    }

    GK.openLog = openLog;
    GK.unlockObjective = unlockObjective;
    GK.ready(emitObjectiveState);

    /* ═════════════════════════ 2. SECRET PANEL ═════════════════════════ */
    let typeStop = null, secretOpen = false;
    function typeMessage(node, text) {
      if (typeStop) typeStop();
      if (env.reduced) { node.textContent = text; return; }
      node.textContent = '';
      let shown = 0, acc = 0;
      typeStop = GK.ticker.add((st, dt) => {
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
      if (questsOpen) closeLog();
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
      qs('.secret-sr', secretEl).textContent = GK.data.secret.message;
      secretEl.addEventListener('click', e => {
        if (e.target.closest('[data-secret-close]')) closeSecret();
        else if (e.target.closest('[data-secret-play]')) { closeSecret(); setTimeout(() => openGame('asteroid'), 200); }
      });
      secretEl.addEventListener('keydown', e => trapTab(e, secretEl));
    }
    GK.openSecret = openSecret;

    const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let kIdx = 0;
    document.addEventListener('keydown', e => {
      if (GK.util.isTyping(e) || !GK.state.entered) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      kIdx = key === KONAMI[kIdx] ? kIdx + 1 : key === KONAMI[0] ? 1 : 0;
      if (kIdx === KONAMI.length) { kIdx = 0; openSecret(); }
    }, true);

    /* ═════════════════════════ 3. DUAL-CARTRIDGE ARCADE DECK ═════════════════════════ */
    let gameOpen = false, stopLoop = null, activeCartridge = 'asteroid';
    const canvas = gameEl ? qs('canvas', gameEl) : null;
    const ctx = canvas ? canvas.getContext('2d') : null;
    const touchBar = document.getElementById('gameTouchControls');
    const ui = gameEl ? {
      score: qs('[data-g="score"]', gameEl),
      best: qs('[data-g="best"]', gameEl),
      shields: qs('[data-g="shields"]', gameEl),
      emp: qs('[data-g="emp"]', gameEl),
      shieldsWrap: qs('[data-g-wrap="shields"]', gameEl),
      empWrap: qs('[data-g-wrap="emp"]', gameEl),
      kicker: qs('[data-g="kicker"]', gameEl),
      panel: qs('.game-panel', gameEl),
      title: qs('.game-title', gameEl),
      sub: qs('.game-sub', gameEl),
      go: qs('[data-game-start]', gameEl),
      sw: qs('[data-game-switch]', gameEl),
      tabs: qsa('.game-tab', gameEl),
    } : null;

    const COL = { ink: '#F3F1EA', dim: 'rgba(243,241,234,0.5)', violet: '#8F88FF', cyan: '#00E5FF', amber: '#FFB454', green: '#3DDC84', red: '#FF5E7A' };
    let W = 0, H = 0, dpr = 1;
    let mode = 'idle';

    /* ── Cartridge 01 State: Asteroid Run DX ── */
    let ship, rocks, shots, sparks, cells, stars, score, best, shields, time, spawnT, fireT, shake, invuln, keys, pointerX, usePointer;
    let spreadTimer = 0, slowTimer = 0, empCharge = 100, empRings = [], unlockedAce = false;

    /* ── Cartridge 02 State: Orbital Slingshot (Gravity Golf) ── */
    let slLevel = 1, slScore = 0, slBest = 0, slShots = 0;
    let slProbe = null, slGoal = null, slWells = [], slRelays = [], slTrail = [];
    let slAim = { dragging: false, x0: 0, y0: 0, x1: 0, y1: 0 };

    function fit() {
      const f = GK.util.fitCanvas(canvas, 1.5);
      W = f.w; H = f.h; dpr = f.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* ───────────── CARTRIDGE 01: ASTEROID RUN DX ───────────── */
    function resetAsteroid() {
      ship = { x: W / 2, y: H - Math.max(96, H * 0.15), vx: 0, r: 13 };
      rocks = []; shots = []; sparks = []; cells = []; empRings = [];
      score = 0; shields = 3; time = 0; spawnT = 0.6; fireT = 0; shake = 0; invuln = 0;
      spreadTimer = 0; slowTimer = 0; empCharge = 100; unlockedAce = false;
      keys = { left: false, right: false };
      pointerX = W / 2; usePointer = false;
      if (!stars || !stars.length) stars = Array.from({ length: 75 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: rand(0.3, 1) }));
      paintHud();
    }

    function triggerEmpNova() {
      if (activeCartridge !== 'asteroid' || mode !== 'play' || empCharge < 100) return;
      empCharge = 0;
      shake = 0.4;
      empRings.push({ x: ship.x, y: ship.y, r: 16, maxR: Math.hypot(W, H) * 0.65, a: 1 });
      GK.sfx('emp', { x: ship.x });
      for (let i = rocks.length - 1; i >= 0; i--) {
        const rk = rocks[i];
        if (Math.hypot(rk.x - ship.x, rk.y - ship.y) < Math.hypot(W, H) * 0.6) {
          score += Math.round(rk.r) * 2;
          burst(rk.x, rk.y, 12, COL.cyan, 210);
          rocks.splice(i, 1);
        }
      }
      paintHud();
    }

    function makeRock(x, y, r, vx, vy, isBoss) {
      const n = isBoss ? 10 : 7 + ((Math.random() * 4) | 0), pts = [];
      for (let i = 0; i < n; i++) pts.push(isBoss ? (i % 2 === 0 ? 1.12 : 0.82) : rand(0.72, 1.12));
      return { x, y, r, vx, vy, a: rand(6.28), spin: rand(-1.2, 1.2), pts, isBoss: !!isBoss, hp: isBoss ? 10 : r > 34 ? 3 : r > 22 ? 2 : 1, maxHp: isBoss ? 10 : 3 };
    }
    function spawnRock() {
      const level = 1 + time / 20;
      if (score > 250 && Math.random() < 0.08 && !rocks.some(r => r.isBoss)) {
        rocks.push(makeRock(W / 2, -55, 48, rand(-35, 35), 48, true));
        return;
      }
      const r = rand(14, clamp(26 + level * 5, 30, 50));
      rocks.push(makeRock(rand(r, W - r), -r - 10, r, rand(-28, 28) * level * 0.6, rand(70, 120) + level * 24, false));
    }
    function burst(x, y, n, color, speed) {
      for (let i = 0; i < n && sparks.length < 240; i++) {
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

    function stepAsteroid(dt) {
      time += dt;
      spreadTimer = Math.max(0, spreadTimer - dt);
      slowTimer = Math.max(0, slowTimer - dt);
      empCharge = Math.min(100, empCharge + dt * 7.5);
      const timeScale = slowTimer > 0 ? 0.48 : 1;

      const accel = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (accel !== 0) usePointer = false;
      if (usePointer) ship.vx = (pointerX - ship.x) * 9;
      else ship.vx = GK.util.damp(ship.vx, accel * 540, 9, dt);
      ship.x = clamp(ship.x + ship.vx * dt, 18, W - 18);
      invuln = Math.max(0, invuln - dt);
      shake = Math.max(0, shake - dt);

      fireT -= dt;
      if (fireT <= 0) {
        fireT = spreadTimer > 0 ? 0.15 : 0.19;
        shots.push({ x: ship.x, y: ship.y - 16, vx: 0, vy: -780, color: spreadTimer > 0 ? COL.cyan : COL.violet });
        if (spreadTimer > 0) {
          shots.push({ x: ship.x - 8, y: ship.y - 12, vx: -150, vy: -750, color: COL.cyan });
          shots.push({ x: ship.x + 8, y: ship.y - 12, vx: 150, vy: -750, color: COL.cyan });
        }
        GK.sfx('shoot', { x: (ship.x / W) * window.innerWidth });
      }

      spawnT -= dt * timeScale;
      if (spawnT <= 0) { spawnRock(); spawnT = clamp(0.95 - time * 0.012, 0.28, 0.95) * rand(0.7, 1.3); }

      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.x += (s.vx || 0) * dt; s.y += s.vy * dt;
        if (s.y < -20 || s.x < -20 || s.x > W + 20) shots.splice(i, 1);
      }

      for (let i = empRings.length - 1; i >= 0; i--) {
        const er = empRings[i];
        er.r += 780 * dt; er.a -= dt * 1.4;
        if (er.a <= 0) empRings.splice(i, 1);
      }

      for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        r.x += r.vx * dt * timeScale; r.y += r.vy * dt * timeScale; r.a += r.spin * dt * timeScale;
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
          score += r.isBoss ? 250 : Math.round(r.r) * 2;
          empCharge = Math.min(100, empCharge + (r.isBoss ? 45 : 10));
          burst(r.x, r.y, r.isBoss ? 38 : 14, r.isBoss ? COL.amber : COL.violet, 220);
          GK.sfx('explode', { x: (r.x / W) * window.innerWidth });
          if (!r.isBoss && r.r > 26 && rocks.length < 40) {
            for (let k = 0; k < 2; k++) rocks.push(makeRock(r.x + (k ? 10 : -10), r.y, r.r * 0.55, (k ? 1 : -1) * rand(50, 110), r.vy * rand(0.8, 1.1), false));
          }
          if ((r.isBoss || Math.random() < 0.18) && cells.length < 4) {
            const types = ['shield', 'spread', 'chrono'];
            const kind = types[Math.floor(Math.random() * types.length)];
            cells.push({ x: r.x, y: r.y, vy: 115, t: 0, kind });
          }
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
        if (dx * dx + dy * dy < 30 * 30) {
          cells.splice(i, 1);
          if (c.kind === 'spread') { spreadTimer = 8.0; score += 80; }
          else if (c.kind === 'chrono') { slowTimer = 6.0; score += 80; }
          else { if (shields < 3) shields++; else score += 150; }
          burst(c.x, c.y, 14, c.kind === 'spread' ? COL.cyan : c.kind === 'chrono' ? COL.violet : COL.amber, 160);
          GK.sfx('pickup');
          paintHud();
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.vy *= 0.985;
        if (p.t >= p.life) sparks.splice(i, 1);
      }

      if (mode === 'play') {
        score += dt * 10;
        if (!unlockedAce && score >= 400) {
          unlockedAce = true;
          if (GK.unlockObjective) GK.unlockObjective('ace-pilot');
        }
        if ((time * 4 | 0) !== ((time - dt) * 4 | 0)) paintHud();
      }
    }

    function drawAsteroid(dt) {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (shake > 0 && !env.reduced) ctx.translate(rand(-1, 1) * shake * 14, rand(-1, 1) * shake * 14);

      /* speed lines */
      ctx.strokeStyle = slowTimer > 0 ? 'rgba(143,136,255,0.32)' : 'rgba(243,241,234,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const fall = (mode === 'play' ? 240 : 60) * (slowTimer > 0 ? 0.45 : 1);
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.y += fall * s.z * dt;
        if (s.y > H) { s.y = -10; s.x = Math.random() * W; }
        ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + 3 + 10 * s.z * (fall / 240));
      }
      ctx.stroke();

      /* EMP Nova rings */
      for (let i = 0; i < empRings.length; i++) {
        const er = empRings[i];
        ctx.strokeStyle = 'rgba(0,229,255,' + clamp(er.a, 0, 1).toFixed(2) + ')';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(er.x, er.y, er.r, 0, 6.2832); ctx.stroke();
      }

      /* shots */
      ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (let i = 0; i < shots.length; i++) {
        const s = shots[i];
        ctx.strokeStyle = s.color || COL.violet;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - (s.vx || 0) * 0.015, s.y + 12); ctx.stroke();
      }

      /* rocks & bosses */
      ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
      for (let i = 0; i < rocks.length; i++) {
        const r = rocks[i], n = r.pts.length;
        ctx.strokeStyle = r.isBoss ? COL.amber : r.hp > 1 ? COL.ink : COL.dim;
        ctx.fillStyle = r.isBoss ? 'rgba(30,18,8,0.9)' : 'rgba(8,10,16,0.85)';
        ctx.beginPath();
        for (let k = 0; k <= n; k++) {
          const a = r.a + (k % n) / n * 6.2832, rr = r.r * r.pts[k % n];
          const x = r.x + Math.cos(a) * rr, y = r.y + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.fill(); ctx.stroke();
        if (r.isBoss) {
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(r.x - 28, r.y - r.r - 14, 56, 5);
          ctx.fillStyle = COL.amber;
          ctx.fillRect(r.x - 28, r.y - r.r - 14, 56 * (r.hp / r.maxHp), 5);
        }
      }

      /* powerup cells */
      ctx.lineWidth = 1.6;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i], s = 8 + Math.sin(c.t * 6) * 1.5;
        ctx.strokeStyle = c.kind === 'spread' ? COL.cyan : c.kind === 'chrono' ? COL.violet : COL.amber;
        ctx.beginPath(); ctx.moveTo(c.x, c.y - s); ctx.lineTo(c.x + s, c.y); ctx.lineTo(c.x, c.y + s); ctx.lineTo(c.x - s, c.y); ctx.closePath(); ctx.stroke();
      }

      /* sparks */
      for (let i = 0; i < sparks.length; i++) {
        const p = sparks[i];
        ctx.globalAlpha = 1 - p.t / p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;

      /* ship */
      if (mode !== 'over' && (invuln <= 0 || Math.floor(invuln * 12) % 2 === 0)) {
        const lean = clamp(ship.vx / 520, -1, 1) * 0.35;
        ctx.save();
        ctx.translate(ship.x, ship.y); ctx.rotate(lean);
        if (spreadTimer > 0) {
          ctx.strokeStyle = 'rgba(0,229,255,0.45)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, 22, 0, 6.2832); ctx.stroke();
        }
        ctx.strokeStyle = COL.ink; ctx.fillStyle = 'rgba(8,10,16,0.9)'; ctx.lineWidth = 1.75;
        ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(12, 12); ctx.lineTo(0, 6); ctx.lineTo(-12, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = COL.cyan; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-4, 11); ctx.lineTo(0, 17 + Math.random() * 10); ctx.lineTo(4, 11); ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    /* ───────────── CARTRIDGE 02: ORBITAL SLINGSHOT (GRAVITY GOLF) ───────────── */
    function buildSlingshotLevel(lvl) {
      slLevel = lvl;
      const startX = Math.max(70, W * 0.16);
      const startY = H * 0.55;
      const goalX = Math.min(W - 80, W * 0.84);
      const goalY = H * (0.28 + ((lvl * 0.19) % 0.44));
      slProbe = { x: startX, y: startY, x0: startX, y0: startY, vx: 0, vy: 0, r: 8, flying: false };
      slGoal = { x: goalX, y: goalY, r: 22, t: 0 };
      slTrail = [];
      sparks = [];
      slWells = [];
      const cx = W * 0.5, cy = H * 0.5;
      if (lvl % 2 === 1) {
        slWells.push({ x: cx, y: cy + (lvl === 1 ? 10 : -35), r: 26, mass: 170000, col: COL.violet });
        if (lvl >= 3) slWells.push({ x: cx + W * 0.15, y: cy + 95, r: 20, mass: 115000, col: COL.amber });
      } else {
        slWells.push({ x: cx - W * 0.11, y: cy - 55, r: 24, mass: 145000, col: COL.cyan });
        slWells.push({ x: cx + W * 0.11, y: cy + 65, r: 24, mass: 145000, col: COL.amber });
      }
      slRelays = [
        { x: cx - W * 0.16, y: cy - 85, r: 10, got: false, t: 0 },
        { x: cx, y: cy - (lvl % 2 ? 95 : -5), r: 10, got: false, t: 1.5 },
        { x: cx + W * 0.17, y: cy - 45, r: 10, got: false, t: 3.0 },
      ];
      paintHud();
    }

    function resetProbeOnly() {
      if (!slProbe) return;
      slProbe.x = slProbe.x0; slProbe.y = slProbe.y0;
      slProbe.vx = 0; slProbe.vy = 0; slProbe.flying = false;
      slAim.dragging = false;
      slTrail = [];
      slRelays.forEach(r => { r.got = false; });
    }

    function computeGravityAccel(px, py) {
      let ax = 0, ay = 0;
      for (let i = 0; i < slWells.length; i++) {
        const w = slWells[i];
        const dx = w.x - px, dy = w.y - py;
        const d2 = Math.max(900, dx * dx + dy * dy);
        const d = Math.sqrt(d2);
        const f = w.mass / d2;
        ax += (dx / d) * f;
        ay += (dy / d) * f;
      }
      return { ax, ay };
    }

    function stepSlingshot(dt) {
      time += dt;
      if (slGoal) slGoal.t += dt;
      slRelays.forEach(r => { r.t += dt; });

      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.t >= p.life) sparks.splice(i, 1);
      }

      if (!slProbe || !slProbe.flying) return;

      const subSteps = 3;
      const sdt = dt / subSteps;
      for (let s = 0; s < subSteps; s++) {
        const g = computeGravityAccel(slProbe.x, slProbe.y);
        slProbe.vx += g.ax * sdt;
        slProbe.vy += g.ay * sdt;
        slProbe.x += slProbe.vx * sdt;
        slProbe.y += slProbe.vy * sdt;
      }
      if ((state.frame & 1) === 0) {
        slTrail.push({ x: slProbe.x, y: slProbe.y });
        if (slTrail.length > 95) slTrail.shift();
      }

      /* check relays */
      slRelays.forEach((rel, idx) => {
        if (!rel.got && Math.hypot(slProbe.x - rel.x, slProbe.y - rel.y) < slProbe.r + rel.r + 6) {
          rel.got = true;
          slScore += 150;
          if (slScore > slBest) { slBest = slScore; store.set('slingshot.best', slBest); }
          burst(rel.x, rel.y, 16, COL.amber, 160);
          GK.sfx('relay', { i: idx, x: rel.x });
          paintHud();
        }
      });

      /* check planet collision */
      for (let i = 0; i < slWells.length; i++) {
        const w = slWells[i];
        if (Math.hypot(slProbe.x - w.x, slProbe.y - w.y) < w.r + slProbe.r - 2) {
          burst(slProbe.x, slProbe.y, 24, COL.red, 200);
          GK.sfx('explode', { x: slProbe.x });
          resetProbeOnly();
          return;
        }
      }

      /* check out of bounds */
      if (slProbe.x < -80 || slProbe.x > W + 80 || slProbe.y < -80 || slProbe.y > H + 80) {
        GK.sfx('close');
        resetProbeOnly();
        return;
      }

      /* check warp gate goal */
      if (Math.hypot(slProbe.x - slGoal.x, slProbe.y - slGoal.y) < slGoal.r + slProbe.r) {
        slScore += 300;
        if (slScore > slBest) { slBest = slScore; store.set('slingshot.best', slBest); }
        burst(slGoal.x, slGoal.y, 34, COL.cyan, 240);
        GK.sfx('discover');
        if (GK.unlockObjective) GK.unlockObjective('ace-pilot');
        buildSlingshotLevel(slLevel + 1);
      }
    }

    function drawSlingshot() {
      ctx.clearRect(0, 0, W, H);

      /* background stars */
      if (stars) {
        ctx.fillStyle = 'rgba(243,241,234,0.35)';
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          ctx.fillRect(s.x, s.y, 1.5, 1.5);
        }
      }

      if (!slProbe) return;

      /* gravity wells */
      for (let i = 0; i < slWells.length; i++) {
        const w = slWells[i];
        for (let k = 1; k <= 3; k++) {
          ctx.strokeStyle = 'rgba(143,136,255,' + (0.22 - k * 0.05).toFixed(2) + ')';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 6]);
          ctx.beginPath(); ctx.arc(w.x, w.y, w.r + k * 24, 0, 6.2832); ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(8,10,16,0.95)';
        ctx.strokeStyle = w.col;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 6.2832); ctx.fill(); ctx.stroke();
      }

      /* warp gate goal */
      if (slGoal) {
        ctx.strokeStyle = COL.cyan;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(slGoal.x, slGoal.y, slGoal.r + Math.sin(slGoal.t * 4) * 3, 0, 6.2832); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,229,255,0.4)';
        ctx.beginPath(); ctx.arc(slGoal.x, slGoal.y, slGoal.r * 0.55, 0, 6.2832); ctx.stroke();
      }

      /* telemetry relays */
      slRelays.forEach(r => {
        if (r.got) return;
        const s = 8 + Math.sin(r.t * 5) * 2;
        ctx.strokeStyle = COL.amber; ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y - s); ctx.lineTo(r.x + s, r.y); ctx.lineTo(r.x, r.y + s); ctx.lineTo(r.x - s, r.y);
        ctx.closePath(); ctx.stroke();
      });

      /* trajectory prediction curve + taut vector band while aiming */
      if (slAim.dragging && !slProbe.flying) {
        const dx = slProbe.x - slAim.x1, dy = slProbe.y - slAim.y1;
        const dist = Math.min(180, Math.hypot(dx, dy));
        const ang = Math.atan2(dy, dx);
        let px = slProbe.x, py = slProbe.y;
        let vx = Math.cos(ang) * dist * 3.1, vy = Math.sin(ang) * dist * 3.1;

        /* elastic slingshot tether */
        ctx.strokeStyle = COL.amber;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(slProbe.x, slProbe.y);
        ctx.lineTo(slAim.x1, slAim.y1);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(slAim.x1, slAim.y1, 5, 0, 6.2832);
        ctx.stroke();

        /* Δv telemetry label */
        ctx.font = '500 11px monospace';
        ctx.fillStyle = COL.amber;
        ctx.fillText('Δv ' + Math.round(dist * 3.1) + ' m/s', slProbe.x - 32, slProbe.y - 18);

        /* predicted N-body trajectory */
        ctx.strokeStyle = 'rgba(0,229,255,0.72)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let step = 0; step < 65; step++) {
          const g = computeGravityAccel(px, py);
          vx += g.ax * 0.016; vy += g.ay * 0.016;
          px += vx * 0.016; py += vy * 0.016;
          ctx.lineTo(px, py);
          let hitPlanet = false;
          for (let w = 0; w < slWells.length; w++) {
            if (Math.hypot(px - slWells[w].x, py - slWells[w].y) < slWells[w].r) { hitPlanet = true; break; }
          }
          if (hitPlanet) break;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      /* flight trail */
      if (slTrail.length > 1) {
        ctx.strokeStyle = 'rgba(0,229,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < slTrail.length; i++) {
          if (i === 0) ctx.moveTo(slTrail[i].x, slTrail[i].y);
          else ctx.lineTo(slTrail[i].x, slTrail[i].y);
        }
        ctx.stroke();
      }

      /* probe */
      ctx.fillStyle = COL.ink;
      ctx.strokeStyle = COL.cyan;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(slProbe.x, slProbe.y, slProbe.r, 0, 6.2832); ctx.fill(); ctx.stroke();

      /* sparks */
      for (let i = 0; i < sparks.length; i++) {
        const p = sparks[i];
        ctx.globalAlpha = 1 - p.t / p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;
    }

    function paintHud() {
      if (!ui) return;
      if (activeCartridge === 'asteroid') {
        ui.score.textContent = String(Math.floor(score || 0)).padStart(5, '0');
        ui.best.textContent = String(Math.floor(best || 0)).padStart(5, '0');
        if (ui.shieldsWrap) ui.shieldsWrap.hidden = false;
        if (ui.empWrap) ui.empWrap.hidden = false;
        ui.shields.textContent = '◆'.repeat(Math.max(0, shields)) + '◇'.repeat(Math.max(0, 3 - shields));
        if (ui.emp) ui.emp.textContent = empCharge >= 100 ? 'READY [SPACE]' : Math.floor(empCharge) + '%';
      } else {
        ui.score.textContent = String(Math.floor(slScore || 0)).padStart(5, '0');
        ui.best.textContent = String(Math.floor(slBest || 0)).padStart(5, '0');
        if (ui.shieldsWrap) ui.shieldsWrap.hidden = false;
        if (ui.empWrap) ui.empWrap.hidden = true;
        ui.shields.textContent = 'SECTOR ' + pad(slLevel);
      }
    }

    function endGame() {
      mode = 'over';
      if (score > best) { best = Math.floor(score); store.set('game.best', best); }
      paintHud();
      GK.sfx('gameover');
      ui.title.textContent = 'Signal lost';
      ui.sub.textContent = 'Score ' + Math.floor(score) + ' · Best ' + best;
      ui.go.textContent = 'Fly again';
      ui.panel.hidden = false;
      ui.go.focus({ preventScroll: true });
    }

    function setCartridge(cart) {
      activeCartridge = cart === 'slingshot' ? 'slingshot' : 'asteroid';
      mode = 'idle';
      if (ui && ui.tabs) {
        ui.tabs.forEach(t => {
          const on = t.dataset.gameMode === activeCartridge;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', String(on));
        });
      }
      if (touchBar) touchBar.classList.toggle('is-hidden', activeCartridge !== 'asteroid');
      fit();
      if (activeCartridge === 'asteroid') {
        best = store.get('game.best', 0) || 0;
        resetAsteroid();
        if (ui.kicker) ui.kicker.textContent = 'Arcade · Cartridge 01';
        ui.title.textContent = 'Asteroid Run DX';
        ui.sub.textContent = 'Collect Cyan Spread & Violet Chrono cores · Press Space or EMP button for Nova shockwave';
        ui.go.textContent = 'Launch Fighter';
        if (ui.sw) ui.sw.textContent = 'Switch to Orbital Slingshot';
      } else {
        slBest = store.get('slingshot.best', 0) || 0;
        slScore = 0;
        buildSlingshotLevel(1);
        if (ui.kicker) ui.kicker.textContent = 'Arcade · Cartridge 02';
        ui.title.textContent = 'Orbital Slingshot';
        ui.sub.textContent = 'Drag back from the probe to curve around planetary gravity wells and hit the cyan Warp Gate';
        ui.go.textContent = 'Enter Orbit';
        if (ui.sw) ui.sw.textContent = 'Switch to Asteroid Run DX';
      }
      ui.panel.hidden = false;
    }

    function startGame() {
      fit();
      if (activeCartridge === 'asteroid') resetAsteroid();
      else buildSlingshotLevel(slLevel || 1);
      mode = 'play';
      ui.panel.hidden = true;
      canvas.focus({ preventScroll: true });
      GK.sfx('whoosh');
    }

    function loop(st, dt) {
      if (!gameOpen) return;
      if (activeCartridge === 'asteroid') {
        if (mode === 'play') stepAsteroid(dt);
        drawAsteroid(dt);
      } else {
        if (mode === 'play') stepSlingshot(dt);
        drawSlingshot(dt);
      }
    }

    function openGame(initialCartridge) {
      if (!gameEl || !ctx) return;
      if (secretOpen) closeSecret();
      if (questsOpen) closeLog();
      if (!gameOpen) {
        gameOpen = true;
        openOverlay(gameEl, 'game');
        GK.state.paused = true;
        stopLoop = GK.ticker.add(loop, 40);
        GK.sfx('open');
      }
      setCartridge(initialCartridge || activeCartridge || 'asteroid');
      ui.go.focus({ preventScroll: true });
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
        if (e.target.closest('[data-game-close]')) { closeGame(); return; }
        if (e.target.closest('[data-game-start]')) { startGame(); return; }
        if (e.target.closest('[data-game-switch]')) {
          GK.sfx('toggle');
          setCartridge(activeCartridge === 'asteroid' ? 'slingshot' : 'asteroid');
          return;
        }
        const tab = e.target.closest('[data-game-mode]');
        if (tab) {
          GK.sfx('toggle');
          setCartridge(tab.dataset.gameMode);
        }
      });

      if (touchBar) {
        const bindHold = (sel, keyName) => {
          const b = qs(sel, touchBar);
          if (!b) return;
          b.addEventListener('pointerdown', e => { e.preventDefault(); if (keys) keys[keyName] = true; usePointer = false; });
          ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, () => { if (keys) keys[keyName] = false; }));
        };
        bindHold('[data-gt="left"]', 'left');
        bindHold('[data-gt="right"]', 'right');
        const empBtn = qs('[data-gt="emp"]', touchBar);
        if (empBtn) empBtn.addEventListener('click', e => { e.preventDefault(); triggerEmpNova(); });
      }

      gameEl.addEventListener('keydown', e => trapTab(e, gameEl));
      canvas.addEventListener('pointerdown', e => {
        const r = canvas.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        if (activeCartridge === 'slingshot' && mode === 'play' && slProbe) {
          if (slProbe.flying) { resetProbeOnly(); return; }
          slAim.dragging = true;
          slAim.x0 = slProbe.x; slAim.y0 = slProbe.y;
          slAim.x1 = px; slAim.y1 = py;
          try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
        } else {
          pointerX = px; usePointer = true;
        }
      });
      canvas.addEventListener('pointermove', e => {
        const r = canvas.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        if (activeCartridge === 'slingshot') {
          if (slAim.dragging) { slAim.x1 = px; slAim.y1 = py; }
        } else {
          pointerX = px;
          if (e.pointerType !== 'mouse' || mode === 'play') usePointer = true;
        }
      });
      const finishSlingshotDrag = e => {
        if (activeCartridge === 'slingshot' && slAim.dragging && slProbe && !slProbe.flying) {
          slAim.dragging = false;
          try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
          const dx = slProbe.x - slAim.x1, dy = slProbe.y - slAim.y1;
          const dist = Math.min(180, Math.hypot(dx, dy));
          if (dist > 8) {
            const ang = Math.atan2(dy, dx);
            slProbe.vx = Math.cos(ang) * dist * 3.1;
            slProbe.vy = Math.sin(ang) * dist * 3.1;
            slProbe.flying = true;
            slShots++;
            GK.sfx('slingshot', { x: slProbe.x });
          }
        }
      };
      canvas.addEventListener('pointerup', finishSlingshotDrag);
      canvas.addEventListener('pointercancel', () => { slAim.dragging = false; });
      bus.on('resize', () => {
        if (!gameOpen) return;
        fit();
        if (activeCartridge === 'asteroid' && ship) {
          ship.y = H - Math.max(96, H * 0.15);
          ship.x = clamp(ship.x, 18, W - 18);
        } else if (activeCartridge === 'slingshot') {
          buildSlingshotLevel(slLevel || 1);
        }
      });
      bus.on('visibility', v => { if (v.hidden && gameOpen && keys) keys.left = keys.right = false; });
    }

    document.addEventListener('keydown', e => {
      if (questsOpen) {
        if (e.key === 'Escape' || e.key === 'q' || e.key === 'Q') { e.preventDefault(); e.stopPropagation(); closeLog(); }
        return;
      }
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
        if ((k === ' ' || k === 'Enter') && document.activeElement !== ui.go && document.activeElement !== ui.sw) { e.preventDefault(); startGame(); }
        return;
      }
      if (activeCartridge === 'asteroid') {
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.left = true; e.preventDefault(); }
        else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = true; e.preventDefault(); }
        else if (k === ' ') { e.preventDefault(); triggerEmpNova(); }
        else if (k === 'ArrowUp' || k === 'ArrowDown') e.preventDefault();
      } else if (k === 'r' || k === 'R' || k === ' ') {
        e.preventDefault();
        resetProbeOnly();
      }
    }, true);
    document.addEventListener('keyup', e => {
      if (!gameOpen || !keys) return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
    }, true);
  });
})();
