# RTS Command Deck

A StarCraft-inspired sound effects board. Chunky console keys press down and light up as they play. It has hotkeys and quick filters, every key can play your own sound file, and your board and clips can sync across devices through Vercel Blob.

## Run it locally

```bash
npm install
npm run dev          # vercel dev: the page plus the /api storage routes
npm run dev:static   # the page only, no cloud sync, at http://localhost:3000
```

`npm run dev` needs the Vercel CLI linked to the project (`npx vercel link`) and the environment variables below (`npx vercel env pull`).

## Deploy to Vercel

At vercel.com/new, import this GitHub repo. Leave Framework Preset on **Other** with no build command and no output directory. Every push to `main` redeploys. From the command line, `npm run deploy` runs `vercel --prod`.

`vercel.json` sets security headers, keeps `sw.js` and the manifest uncached so updates reach users, and caches icons for a week.

## Set up cloud storage

Without these steps the board still works; clips just stay in each browser.

1. **Create a Blob store.** In the Vercel project, open **Storage → Create Database → Blob**. Choose **Private** access and connect it to the project for all environments. This adds the store credentials automatically (`BLOB_STORE_ID`, or `BLOB_READ_WRITE_TOKEN` on older connections).
2. **Set a passcode.** Under **Settings → Environment Variables**, add `DECK_PASSWORD` with a passcode of your choice, for all environments.
3. **Redeploy** so the functions pick up both variables (Deployments → ⋯ → Redeploy).
4. **Connect.** On the site, click **Cloud**, enter the passcode and click **Connect**. Repeat on each device.

If you created the Blob store with **Public** access instead, also set `DECK_BLOB_ACCESS=public`. Private is recommended: clips are only served through the app, to someone who has the passcode.

### How sync works

- The whole board (keys, hotkeys, colours, volumes and which clip each key uses) is one `layout.json` in the store. Every change saves it, and the last save wins.
- Each uploaded clip is stored once under `clips/`. Replacing, reverting or deleting a key removes its clip from the store when no other key uses it.
- Clips are also cached in the browser (IndexedDB), so playback is instant and works offline. A new device downloads them in the background after connecting.
- The cloud limit is **4 MB per clip**, set by Vercel's 4.5 MB request size for functions. Larger files still work but stay in the browser that added them.
- When a browser connects with unsaved changes, those changes are saved to the cloud. Otherwise the cloud board replaces the browser's board. A tab that comes back into view picks up changes made on another device.
- The passcode is remembered in the browser after connecting. **Disconnect** forgets it without deleting anything.

### API

All routes require the passcode in an `x-deck-pass` header.

| Route | Purpose |
|-------|---------|
| `GET /api/layout` | Saved board: `{ layout: { pads, master } \| null, savedAt }` |
| `PUT /api/layout` | Save the board (JSON body `{ pads, master }`) |
| `POST /api/clips` | Upload one clip: raw audio body, `Content-Type: audio/*`, `X-File-Name` header → `{ path }` |
| `GET /api/clips?path=clips/…` | Stream one clip |
| `GET /api/clips` | List stored clips |
| `DELETE /api/clips?path=clips/…` | Delete one clip |

## Install as an app

The site is a Progressive Web App. In Chrome or Edge, use the install icon in the address bar. On iPhone or iPad, use Share → Add to Home Screen. Once installed it opens in its own window and works offline. Fonts are cached after the first online visit.

When you change `index.html` or the icons, bump `VERSION` in `sw.js` so installed copies fetch the new files.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The app: markup, styles and script |
| `api/layout.js` | Load and save the board in Blob storage |
| `api/clips.js` | Upload, stream, list and delete clips in Blob storage |
| `api/_lib.js` | Passcode check and shared helpers (not a route) |
| `sw.js` | Service worker for offline use |
| `manifest.webmanifest` | App name, colours and icons for install |
| `icons/` | App icon (SVG source plus 192 and 512 px PNGs) |
| `vercel.json` | Headers and URL settings for Vercel |
| `package.json` | `@vercel/blob` dependency and dev/deploy scripts |

## Features

- **27 keys across Terran, Protoss and Zerg:** 11 Terran and 5 Protoss units each speak their line ("You want a piece of me, boy?", "My life for Aiur!"), 4 Zerg units use creature sounds since Zerg units don't talk, and 7 advisor alerts sit with their race ("Nuclear launch detected.", "You must construct additional pylons.", "Spawn more overlords.").
- **Stand-in audio:** unit lines are spoken by the browser's text-to-speech and Zerg sounds are synthesized with the Web Audio API. Upload the original clip on any key to replace them.
- Boards saved before the unit set are migrated automatically on load: the old effect keys are replaced, and keys you added or gave an uploaded clip are kept.
- **Quick filters** by faction (Terran, Protoss, Zerg), plus search, ★ Favorites and My clips.
- **Hotkeys:** each key shows its letter. `Space` stops all sounds, `/` focuses search, `Esc` clears filters.
- **Custom sounds per key:** click **⇪ Upload** under a key, or drop an audio file onto it. **↺** goes back to the built-in sound.
- **Load clips** assigns many files at once. A file whose name matches a key's label or spoken line (for example `nuclear-launch-detected.mp3`) replaces that key's sound. Any other file becomes a new key.
- **Edit mode** changes a key's label, faction, light colour, hotkey, volume and pitch, and adds or deletes keys.
- **Layout** copies the board setup as JSON, pastes one back in, or resets to defaults.
- **Cloud** syncs the board and clips across devices (see above).

## Where your data lives

- **In the browser:** clips in IndexedDB (database `rtsdeck`, store `clips`); the board in localStorage (`rtsdeck.v1`); the cloud passcode in localStorage (`rtsdeck.cloud`).
- **In the cloud (when connected):** `layout.json` and `clips/…` in this project's Blob store.

## About the sounds

This repo ships no game audio. The built-in effects are original synthesized imitations. To use the real game sounds, extract them from your own StarCraft install (for example with CascView) and load them with **⇪ Upload** or **Load clips**. Keep those files out of this repo, since the game audio is Blizzard's copyrighted material. A private Blob store keeps them behind your passcode.

Fan-made project, not affiliated with Blizzard Entertainment.
