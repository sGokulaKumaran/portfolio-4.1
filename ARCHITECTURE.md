# VOYAGER — portfolio architecture & module contract

The site lives in `main files/` and is plain HTML/CSS/JS: no framework, no build step, no ES modules,
no `fetch()` of local files. It must work when `index.html` is opened by double-click (`file://`) and
on any static host. The original single-file version is preserved at `legacy/index.original.html`.

Concept: **a portfolio you fly through.** A loader boot sequence ends in an ENGAGE button (the gesture
that unlocks audio). Ten sections are "sectors" of a journey; a wormhole after the last one loops back
to the first. One WebGL shader ("cosmos") is the permanent backdrop. Music and sound are synthesised
live with the Web Audio API.

## Files and owners

| File | Owner | Contents |
|---|---|---|
| `index.html` | shared | Markup. Each owner edits ONLY inside its `@…BEGIN/END` markers. |
| `css/core.css` | foundation | Tokens, reset, layout, component kit, fx primitives. **Do not edit** — ask for additions. |
| `js/core.js` | foundation | `GK` namespace, env, bus, ticker, scroll/sector tracking, warp, utilities. **Do not edit.** |
| `js/data.js` | foundation | All portfolio content (`GK.data`). **Do not edit.** |
| `js/fx.js` | foundation | Declarative interaction primitives (`data-reveal`, `data-tilt`, …). **Do not edit.** |
| `js/boot.js` | foundation | Starts modules; loader fail-safe. **Do not edit.** |
| `js/cosmos.js` | cosmos | Full-screen backdrop shader on `<canvas id="cosmos">`. |
| `js/audio.js` | audio | Generative space music + SFX engine. |
| `js/hud.js`, `css/hud.css` | hud | Ship chrome: loader + ENGAGE, reticle cursor, header/nav/mobile menu, audio toggles, HUD readouts, orbit map, scroll progress, toasts. `@hud` region. |
| `js/flow.js`, `css/flow.css` | flow | Travel + overlays: `GK.navTo`, keyboard/swipe/anchor navigation, hyperspace jumps, mission-briefing modal, command palette, wormhole loop + footer, global shortcuts, protections. `@flow` and `@wormhole` regions. |
| `js/voyage-a.js`, `css/voyage-a.css` | voyage-a | Sectors 0–1: hero, role. |
| `js/voyage-b.js`, `css/voyage-b.css` | voyage-b | Sectors 2–3: about, education. |
| `js/voyage-c.js`, `css/voyage-c.css` | voyage-c | Sectors 4–6: work, stats, internships. |
| `js/voyage-d.js`, `css/voyage-d.css` | voyage-d | Sectors 7–9: stack, certs, contact. |
| `js/extras.js`, `css/extras.css` | extras | Secret panel + "Asteroid Run" mini-game. `@extras` region. |

Scripts load in this order: core → data → fx → audio → cosmos → hud → flow → voyage-a → voyage-b → voyage-c →
voyage-d → extras → boot. Every module file is an IIFE that calls `GK.register('name', function init(GK) { … })`.
`init` runs once the DOM is ready; a module that throws is logged and skipped without breaking the rest,
so **never** assume another module initialised — use the `GK.*` proxies below, which are always callable.

## The ten sectors (`GK.SECTORS`)

| # | element id | key | in-fiction name | nav label |
|---|---|---|---|---|
| 0 | `p0` | origin | Origin | Hero |
| 1 | `p1` | signal | Signal | Role |
| 2 | `p2` | crew | Crew | About |
| 3 | `p2-edu` | trajectory | Trajectory | Education |
| 4 | `p3` | missions | Missions | Work |
| 5 | `p3-5` | telemetry | Telemetry | Stats |
| 6 | `p3-intern` | deployments | Deployments | Internships |
| 7 | `p4` | systems | Systems | Stack |
| 8 | `p5` | constellations | Constellations | Certs |
| 9 | `p6` | transmission | Transmission | Contact |

Each sector element is `<section class="panel …" id="…" data-sector="N">`. Keep the id, `data-sector`
and the `panel` class. Each `GK.SECTORS[i]` has `{ index, id, key, name, label, a, b (hex), rgbA, rgbB
([r,g,b] 0..1), dim }`. `#wormhole` follows sector 9 and is not a sector.

## Runtime API (`window.GK`)

```
GK.env      { fine, touch, reduced, mobile, webgl, lowPower, dpr, w, h }
GK.state    { time, dt, frame, scrollY, scrollMax, progress, velocity (px/s), speed 0..1,
              warp 0..1, flow 0..1 (= max(speed, warp), 0 when reduced motion),
              sector 0..9, sectorT 0..1, sectorF (continuous), wormhole 0..1,
              palette { a:[r,g,b], b:[r,g,b], dim }   ← already cross-faded per frame,
              pointer { x, y (px), nx, ny (-1..1, y down), sx, sy (smoothed), down, active },
              audio { level, bass, mid, high } 0..1   ← written by audio.js,
              quality 0|1|2, entered, modalOpen, paused }
GK.bus      .on(evt, fn) → off()   .once(evt, fn)   .off(evt, fn)   .emit(evt, data)
GK.ticker   .add(fn(state, dt), order = 10) → remove()      // the ONLY requestAnimationFrame loop
GK.scroll   .measure()  .teleport(y)  .topOf(indexOrId)  .indexOf(idOrKey)  .panels()
GK.warp(strength 0..1, durationMs)      // drives state.warp, html.is-warping, warp:start / warp:end
GK.util     clamp lerp damp(a,b,lambda,dt) map smoothstep rand pick qs qsa pad esc el(tag, attrs, kids)
            debounce throttle onVisible(el, cb(visible)) fitCanvas(canvas, maxDpr, scale) isTyping(evt)
            hexToRgb easeOutCubic easeInOutCubic easeOutExpo
GK.store    .get(key, fallback)  .set(key, value)           // localStorage, never throws
GK.data     person, social, roles, tags, education[], projects[], metrics[], internships[],
            disciplines[], foundations[], certs[], contact, secret, find(id), mailto(subject, body)
GK.fx       .decode(el, text?)  .count(el)  .split(el)  .reveal(el)
GK.scan(root)                           // re-run fx primitives on injected markup
GK.register(name, init)   GK.ready(fn)
```

Proxies — always safe to call, implemented by the named owner:

```
GK.sfx(name, opts)            audio   play a sound effect (no-op when muted / not ready)
GK.audio  { play(name, opts), setMusic(bool), setSfx(bool), toggleMusic(), toggleSfx(), isMusicOn(), isSfxOn(),
            spectrum() → Uint8Array|null (frequency bins for visualisers), wave() → Uint8Array|null (time domain),
            ready }             audio   (may be undefined if audio.js failed — guard with `GK.audio && …`)
GK.cosmos { setQuality(0|1|2), flash(amount 0..1), shower(seconds), stats() }   cosmos  (guard likewise)
GK.flow   { busy (true during a hyperspace jump), overlayOpen() → bool }   flow
GK.navTo(indexOrId, opts)     flow    travel to a sector (hyperspace jump for 2+ sectors)
GK.modal.open(item, { from: Element, collection: Array }) / .close() / .isOpen
                              flow    "mission briefing" detail modal for a GK.data item; `from` = the element
                                      that opened it (focus returns there), `collection` = list for prev/next
GK.palette.open() / .close() / .toggle() / .isOpen   flow  command palette (ship console)
GK.toast(message, opts)       hud     small HUD notification; opts { tone: 'info'|'ok'|'warn', duration ms }
GK.openGame()                 extras  launch the mini-game
GK.openSecret(source)         extras  open the secret panel
```

### Events on `GK.bus`

| Event | Payload | Emitted by |
|---|---|---|
| `boot` | — | core, after all modules initialised |
| `enter` | `{ sound: bool, auto?: bool }` | hud, when the visitor presses ENGAGE (first user gesture) |
| `sector` | `{ index, prev, sector, id }` | core, when the active sector changes (also once at start, `prev: -1`) |
| `warp:start` / `warp:end` | `{ strength, duration }` / — | core (`GK.warp`) |
| `nav` | `{ from, to, jump: bool }` | flow, when programmatic travel begins |
| `loop` | — | flow, when the wormhole returns the visitor to Origin |
| `modal:open` / `modal:close` | `{ item }` / — | flow |
| `overlay:open` / `overlay:close` | `{ name }` | whoever opens a full-screen overlay (palette, secret, game) |
| `audio:state` | `{ music: bool, sfx: bool }` | audio, whenever a toggle changes |
| `measure`, `resize`, `visibility` | —, `{ w, h }`, `{ hidden }` | core |
| `cosmos:ready` | `{ webgl, tier }` | cosmos, after its first real frame (also `GK.cosmos.ready`) |
| `media:play` / `media:stop` | — | flow, while a briefing video plays with sound (music ducks) |
| `reveal` | element | fx |

### Sound names (`GK.sfx(name)`)

`hover click tick toggle lock open close whoosh warp arrive success error type boot engage ping scan
transmit chime` and, for the game, `shoot hit explode pickup gameover`. Optional `opts`:
`{ x: clientX (stereo pan), i: integer step (pitch index — e.g. `chime` i=0..5 plays an ascending scale
note, `boot` i = line number), dir: +1|-1 (whoosh direction), p: 0..1 (generic intensity) }`. Unknown names
are ignored silently. Sounds are always in the current sector's key. Clicks and hovers on links/buttons
play automatically (fx.js); override per element with `data-sfx="name|none"` / `data-sfx-hover="…"`.

## Declarative primitives (fx.js + core.css)

| Attribute | Effect |
|---|---|
| `data-reveal[="up\|fade\|left\|right\|scale\|blur"]`, `data-delay="ms"` | Animate in when scrolled into view (adds `.is-in`). |
| `data-reveal-group[="staggerMs"]` | Direct children reveal in sequence. |
| `data-split="chars\|words"` | Masked rise per character/word (accessible text is preserved). |
| `data-decode` | Text scrambles then resolves when revealed. |
| `data-count="42"` + `data-suffix` / `data-prefix` / `data-decimals` | Count-up when revealed. |
| `data-tilt[="deg"]` | Smoothed 3D tilt (owns `transform`), sets `--mx`/`--my` px. |
| `data-magnetic[="0.28"]` | Pointer attraction (owns `transform`). |
| `data-spot` | Sets `--mx`/`--my` px + `.is-spot` for spotlight glows. |
| `data-parallax="0.15"` | Scroll drift (owns `translate`). |
| `data-cursor="LABEL"`, `data-cursor-lock` | (hud) cursor label / reticle lock-on brackets around the element. |
| `a[href="#p3"]` (any in-page hash link to a sector id) | (flow) travels with `GK.navTo`. |
| `data-action="palette|music|sfx|game|secret|top"` | (flow) click runs that global action from anywhere. |

Rules: reveals do not start until `enter`. `data-tilt` and `data-magnetic` both own `transform`, so don't
put both on one element and don't set `transform` on those elements yourself — use the individual
`translate` / `scale` / `rotate` properties for hover states. Reveal animations leave no residue.

## Shared CSS (core.css)

Tokens: colours `--bg --ink --ink-2 --ink-3 --ink-4 --violet --amber --cyan --green --red --line --line-2
--surface --surface-2 --surface-solid`; live sector accents `--sector-a --sector-b --sector-a-rgb
--sector-b-rgb` (animate automatically between sectors); type `--font-display --font-body --font-mono
--fs-hero --fs-h2 --fs-h3 --fs-lead --fs-body --fs-sm --fs-xs --fs-micro`; space `--gutter --max
--header-h --radius --radius-sm --radius-pill`; motion `--ease-out --ease-in-out --ease-spring
--ease-drift --t-1…--t-4`; layers `--z-cosmos 0, --z-veil 1, --z-content 10, --z-hud 50, --z-header 100,
--z-overlay 1000 (modal 1000, palette 1100, secret/game 1200), --z-warp 5000, --z-loader 9000,
--z-cursor 10000`.

Components: `.panel`, `.panel-inner`, `.grid-2`, `.sec-head / .sec-kicker / .sec-num / .sec-title /
.sec-meta / .sec-lede`, `.glass`, `.brackets`, `.btn / .btn-primary`, `.chip / .chips`, `.link`, `.dot`,
`.hud-label`, `.lead`, `.legible`, `.text-glow`, `.sr-only`.

`<html>` state classes: `js is-fine|is-coarse is-touch is-reduced no-webgl is-mobile is-loading
is-booted is-entered is-warping has-reveal`, plus `data-at="<sector key>"` (e.g. `html[data-at="missions"]`).

## Ground rules for every module

1. **One animation loop.** Use `GK.ticker.add`; never call `requestAnimationFrame` in a loop of your own.
   Gate canvas work with `GK.util.onVisible` so off-screen sectors cost nothing.
2. **No layout thrash.** Never read layout (`getBoundingClientRect`, `offset*`) per frame for elements you
   can measure once and cache; re-measure on the `measure`/`resize` events.
3. **No `backdrop-filter` on in-flow content** (the backdrop is an always-animating canvas). It is allowed
   only on fixed chrome: header, overlays, modal.
4. **Legibility first.** Body text ≥ 4.5:1 contrast over the backdrop; use `--surface` cards or `.legible`.
   Smallest text is `--fs-micro` (11px).
5. **Palette discipline.** Only the tokens above. Sector accent = `var(--sector-a)`; no new hues.
6. **Reduced motion** (`GK.env.reduced` / `html.is-reduced`): no parallax, no warp, no auto-moving canvases
   (render a single static frame), instant reveals.
7. **Touch / small screens** (`GK.env.fine === false`): no hover-only affordances; everything reachable by
   tap. Layouts must work from 360px wide.
8. **Keyboard + screen readers.** Every interactive thing is a real `<a>`/`<button>` (or has `role`,
   `tabindex="0"` and Enter/Space handling). Decorative canvases are `aria-hidden`.
9. **Content is real.** Only content from `GK.data` / the legacy file. Never invent projects, employers,
   numbers or skill ratings.
10. **Clean up.** Remove listeners/tasks you no longer need; cap any pool or particle count.

## Decisions already made (do not relitigate)

- **Naming** follows `index.html` and this document (`.panel`, `.hero-…`, `data-reveal`, `data-cursor`,
  `GK.sfx`, `GK.navTo`), not the names used in the specialist design specs.
- **Colour semantics:** violet = interactive (`--accent`, small text `--accent-ink`), cyan = focus ring +
  data/media (`--focus`), green = status, amber = at most one focal highlight per viewport.
  `--sector-a/b` and `--sector-ink` are *atmosphere* (kickers, hairlines, glows, canvas art) — never the
  meaning of a control. At least 85% of interface pixels stay neutral.
- **No emoji in the interface.** Icons are inline SVG (1.5px stroke, `currentColor`). The `icon` fields
  in `GK.data` are legacy and are not rendered (the secret panel's `favs` are the owner's own text, keep them).
- **Banned looks:** gradient-clipped text, RGB glitch, glowing text-shadows, confetti, scanline/hex-grid
  overlays, lens flares, `mix-blend-mode` or full-viewport DOM layers above the canvas, `transition: all`.
- **Native scroll is sacred:** no wheel hijack, no scroll-snap, no swipe-to-jump. `↑`/`↓` (and `j`/`k`)
  hop one sector, but when the current sector is taller than the viewport they first scroll inside it.
  PageUp/PageDown/Space/Home/End stay native.
- **Keys:** `M` music (no modifier), `Ctrl/⌘+K` or `/` console, `G` game, `Esc` closes the top layer —
  single keys only when no field is focused and no modifier is held.
- **Video** never autoplays and never loads before the visitor presses play in the briefing: poster +
  play button labelled with `item.videoLength · item.videoSize`. On close: pause, drop `src`, `load()`.
- **Images:** lists, cards and hover previews use `item.thumb`; only the briefing loads `item.image`.
  Always set `width`/`height` (or an aspect-ratio box), `loading="lazy"`, `decoding="async"`.
- **Audio** starts only from ENGAGE or a later explicit toggle. hud emits `enter`; audio.js reacts
  (unlock, engage hit, music fade-in). Nobody else plays `engage`. Loudness is conservative: music sits
  under the content, hover is the quietest sound, nothing harsh.
- **Protections** (owner's feature) are kept but de-fanged behind one `PROTECT` config object in flow.js:
  context menu + dev-tool shortcuts stay blocked; the old devtools-size "detector" overlay is gone (it
  fired on browser zoom) and email, phone and body text are selectable.
- **Honest instruments:** every HUD number is real (sector index, scroll velocity, local time, time
  since ENGAGE, audio state, render tier). No random hex, no fake coordinates.
- **Motion budget:** reveals travel ≤ 34px, once; overshoot only on tiny UI (reticle); one pointer effect
  per element (button = magnetic, card = tilt + spotlight, row = preview).
- **Metrics** keep the owner's wording (`6+`, `100%`).
