# RTS Command Deck

A StarCraft-inspired sound effects board in a single HTML file. Chunky console keys press down and light up as they play. It has hotkeys and quick filters, and every key can play your own sound file.

## Run it locally

```bash
npm run dev      # serves the folder at http://localhost:3000
```

There is no build step and no dependencies. You can also open `index.html` directly, though offline support and app install only work over http(s).

## Deploy to Vercel

The repo is a static site; Vercel serves it as is.

- **From the dashboard:** at vercel.com/new, import this GitHub repo. Leave Framework Preset on **Other** with no build command and no output directory, then deploy. Every push to `main` redeploys.
- **From the command line:** `npm run deploy` (runs `vercel --prod` and asks you to log in the first time).

`vercel.json` sets security headers, keeps `sw.js` and the manifest uncached so updates reach users, and caches icons for a week.

## Install as an app

The site is a Progressive Web App. In Chrome or Edge, use the install icon in the address bar. On iPhone or iPad, use Share → Add to Home Screen. Once installed it opens in its own window and works offline. Fonts are cached after the first online visit.

When you change `index.html` or the icons, bump `VERSION` in `sw.js` so installed copies fetch the new files.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The whole app: markup, styles and script |
| `sw.js` | Service worker for offline use |
| `manifest.webmanifest` | App name, colours and icons for install |
| `icons/` | App icon (SVG source plus 192 and 512 px PNGs) |
| `vercel.json` | Headers and URL settings for Vercel |
| `package.json` | `dev` and `deploy` scripts only |

## Features

- **31 keys** across Terran, Protoss, Zerg and Neutral: weapons, abilities, units and structures, alerts and voice lines.
- **Built-in sounds** are synthesized live with the Web Audio API. Voice lines use the browser's text-to-speech.
- **Quick filters** by faction and type, plus search, ★ Favorites and My clips.
- **Hotkeys:** each key shows its letter. `Space` stops all sounds, `/` focuses search, `Esc` clears filters.
- **Custom sounds per key:** click **⇪ Upload** under a key, or drop an audio file onto it. **↺** goes back to the built-in sound.
- **Load clips** assigns many files at once. A file whose name matches a key's label or spoken line (for example `nuclear-launch-detected.mp3`) replaces that key's sound. Any other file becomes a new key.
- **Edit mode** changes a key's label, faction, type, light colour, hotkey, volume and pitch, and adds or deletes keys.
- **Layout** copies the board setup as JSON, pastes one back in, or resets to defaults.

## Where your data lives

Everything stays in the browser you use:

- Uploaded audio files are stored in IndexedDB (database `rtsdeck`, store `clips`).
- The key layout is stored in localStorage (`rtsdeck.v1`).

Nothing is uploaded to a server. Clearing site data removes it, and other browsers or devices won't see it.

## About the sounds

This repo ships no game audio. The built-in effects are original synthesized imitations. To use the real game sounds, extract them from your own StarCraft install (for example with CascView) and load them with **⇪ Upload** or **Load clips**. Keep those files out of this repo, since the game audio is Blizzard's copyrighted material.

Fan-made project, not affiliated with Blizzard Entertainment.
