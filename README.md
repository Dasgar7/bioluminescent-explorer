# Bioluminescent Explorer

A mobile-first **3D first-person exploration game** built with Three.js / WebGL.

Dark, moody atmosphere with glowing green bioluminescent plants, mushrooms, and ancient pillars. Walk freely across procedural terrain with gravity, jumping, and collision.

## Features

- **True first-person camera** (Minecraft-style eyes view)
- **Mobile touch controls**
  - Virtual joystick (bottom-left) → move / strafe
  - Touch-drag on right side → look around
  - Jump button
- Desktop: WASD + mouse (pointer lock) + Space to jump
- Procedural hilly terrain, glowing flora, stone ruins & arches
- Smooth physics: gravity, ground collision, simple object collision
- **PWA** — install to home screen, works offline (after first load)
- Landscape-oriented, optimized for phones
- Ready for **Vercel** one-click deploy

## Quick Start (local)

```bash
npx serve .
# or
python -m http.server 3000
```

Open on your phone (same network) or desktop. Use landscape mode.

## Deploy to Vercel

1. Import the repo at [vercel.com/new](https://vercel.com/new)
2. Framework Preset: **Other**
3. Deploy

Or: `npx vercel`

## Controls

| Action | Mobile | Desktop |
|--------|--------|--------|
| Move | Left joystick | WASD / Arrows |
| Look | Drag right half | Mouse (click to lock) |
| Jump | Jump button (↑) | Space |
| Sprint | — | Shift |

## Tech

- Three.js r160 (ES modules via importmap + unpkg)
- Vanilla JS — no bundler required
- Service Worker + Web App Manifest for PWA
- Performance-tuned for mobile

## License

MIT
