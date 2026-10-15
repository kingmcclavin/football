# Gridiron Legends

A retro pixel-art American football career game that runs in the browser: iPhone and iPad Safari, plus desktop browsers. You play every snap on offense, call the defense, and kick with a two-tap meter. Between games you run the franchise: roster, depth chart, contracts, salary cap, draft, free agency, trades, staff, facilities, finances and job security. One career can run for as many seasons as you like.

All teams, players, art, sound and text are original. The pixel sprites are drawn in code (`src/render/sprites.ts`), and the sound effects and music are synthesized at runtime (`src/audio/sfx.ts`). No external art or audio files are used.

## Run it

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173 (add --host to open it from a phone on the same Wi-Fi)
```

Other scripts:

```bash
npm test           # rules engine, league, save system and full-game simulations
npm run typecheck
npm run build      # production build in dist/
npm run preview    # serve the production build
npm run icons      # regenerate the PWA icons
```

## Deploy (static hosting)

`npm run build` writes a fully static site to `dist/`. Asset paths are relative (`base: './'`), so it works from a domain root or a sub-path.

- **GitHub Pages:** the included workflow (`.github/workflows/deploy.yml`) tests, builds and publishes on every push to `main`. In the repository settings, set Pages, then Source, to "GitHub Actions".
- **Netlify:** build command `npm run build`, publish directory `dist`.
- **Vercel:** framework preset "Vite" (build `npm run build`, output `dist`).

### Install on iPhone or iPad

Open the site in Safari, tap Share, then **Add to Home Screen**. It launches full screen, and the service worker caches the game so it works offline after the first visit.

## How to play

- **Offense:** pick a play card (routes are drawn before the snap), then tap the field or SNAP. To pass, drag back like a slingshot and release (Settings has a "point at target" option). Lead your receivers. RUN tucks the ball; once you have it, drag anywhere to steer, and use JUKE, BURST (sprint) and DIVE/SLIDE.
- **Defense:** choose a defensive call each snap (or let the coordinator call it). The play is simulated on the field using every player's ratings. You can watch drives at normal speed, fast, or results only.
- **Kicking:** first tap sets the aim, second tap sets the power. Wind matters.
- **Keyboard:** Space/Enter (snap, throw, juke, kick, continue), arrows (aim reticle or runner), 1-6 (jump the reticle to a receiver), WASD (move), Shift (burst), X (dive), E (tuck), F (fair catch), K (kneel), T (timeout), P/Esc (pause).

The in-game Help screen explains every system.

## Architecture

```
src/
  core/      types, seeded RNG
  data/      team definitions (32 original franchises), name pools
  game/      football engine, no rendering
    rules.ts     authoritative game state: downs, clock, scoring, overtime (pure)
    sim.ts       real-time play physics + AI: routes, blocking, coverage, pursuit, tackling, passing, returns
    playbook.ts  formations, routes, 29 offensive plays, 10 defensive calls
    ai.ts        situational play calling, 4th-down / PAT / onside decisions
    match.ts     orchestrates one playable game (rules + physics + kicking + box score)
  league/    career mode
    career.ts    career state, staff, finances types
    schedule.ts  NFL-style 16-game rotation (every week a perfect matching)
    standings.ts tiebreakers, seeding
    season.ts    weekly flow, injuries, playoffs
    quicksim.ts  statistical play-by-play sim for CPU games (same rules engine)
    offseason.ts awards, aging, progression, retirement, Hall of Fame, draft, free agency
    transactions.ts contracts, signings, releases, trades
    frontoffice.ts  facilities, staff, finances, job security
    events.ts    between-game decisions with measurable effects
  render/    canvas renderer (low-res buffer, nearest-neighbour scaling), procedural sprites
  audio/     Web Audio sound effects and music
  save/      IndexedDB saves (3 slots, automatic backup copy, JSON export/import), settings
  ui/        React screens
```

The rules engine is deterministic and has no rendering dependencies. The physics simulation produces each play's result (and the box score stats), and the rules engine applies it. CPU-vs-CPU games run through the same rules engine with a faster statistical model, so standings and league stats come from actual simulated games.

Saves go to IndexedDB after every game and important decision. Each save keeps the previous version as a backup, and a damaged save falls back to it automatically. A game in progress is checkpointed at play boundaries, so closing Safari mid-game lets you resume.
