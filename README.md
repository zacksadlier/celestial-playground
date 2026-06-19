# ✦ Celestial Playground

A gravitational sandbox in the browser. Drop stars, planets, and black holes onto
the canvas and watch them pull on each other under real Newtonian gravity - across
scales ranging from a single solar system to a pair of colliding galaxies.

Built with [SolidJS](https://www.solidjs.com/), TypeScript, and Vite. The physics
engine renders to a plain 2D canvas and runs entirely client-side; there is no
backend.

## Features

- **Interactive N-body gravity** - exact O(n²) pairwise forces with a small
  softening term, integrated with semi-implicit Euler and adaptive substepping so
  the simulation stays stable as you change the time scale.
- **Drag to launch** - click empty space to drop a body at rest, or click-and-drag
  to launch it; the drag direction and length set the initial velocity.
- **Body types** - terrestrial and gas-giant planets, main-sequence stars (O–M),
  evolved/compact stars (white dwarf, red giant, neutron star), and black holes
  (optionally with a dark-matter halo). subType and rendering follow from mass.
- **Collisions** - bodies can **merge** (conserving mass and momentum) or bounce
  **elastically**, toggleable in the panel.
- **Self-consistent physical units** - pick a length scale (metres per pixel) and
  playback speed (simulated time per real second). Hover any body to inspect its
  real mass, type, and velocity; use the **📏 Measure** tool to read true distances.
- **Scene presets** - each with its own tunable options:
    - **Binary** - two stars orbiting their barycentre (choose each star's class).
    - **Solar** - our real solar system to scale, the nearby Alpha Centauri triple
      system, or a randomly generated system.
    - **Cluster** - a swarm of bodies with random velocities.
    - **Collision** - two galaxies on a gentle, bound approach that merge over time.
- **Pan, zoom, trails**, live stats (body count, total energy, FPS), and an
  in-app info modal.

## Controls

| Action              | Input                                  |
| ------------------- | -------------------------------------- |
| Add / launch a body | Click or click-and-drag on empty space |
| Zoom                | Scroll toward the cursor               |
| Pan                 | Right-drag or Shift-drag               |
| Inspect a body      | Hover it                               |
| Play / pause        | `Space`                                |
| Step one frame      | `S`                                    |
| Clear the canvas    | `C`                                    |

Set the body **type**, **subType**, and **mass** in the New Body panel before
adding. Presets open their options first, then **Start** builds the scene.

## Getting started

Requires Node.js 18+.

```bash
npm install     # install dependencies
npm run dev     # start the Vite dev server
```

Then open the printed local URL (default <http://localhost:5173>).

## Scripts

| Script              | Description                               |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start the Vite dev server with hot reload |
| `npm run build`     | Type-check and produce a production build |
| `npm run preview`   | Preview the production build locally      |
| `npm run typecheck` | Run `tsc --noEmit`                        |
| `npm run format`    | Format `src` with Prettier                |

## Project structure

```
src/
  App.tsx              # Top-level component: state, sim/render loop, input handling
  physics.ts           # Framework-agnostic N-body engine (forces, collisions, merges)
  render.ts            # Canvas drawing (bodies, trails, drag/measure overlays)
  presets.ts           # Scene factories (binary, solar, cluster, collision)
  units.ts             # Unit system, scaling, and formatting helpers
  types.ts             # Shared type definitions
  components/          # Panel, Toolbar, PresetConfig, InfoModal
  styles.css           # App styling
```

