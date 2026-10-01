# RTS Command Deck

A StarCraft-inspired sound effects board. Chunky console keys press down and light up as they play. It has hotkeys and quick filters, every key can play your own sound file, and your keys (stored in a Postgres database) and clips (stored in Vercel Blob) can sync across devices.

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

Without these steps the board still works; keys and clips just stay in each browser.

1. **Create a database for the keys.** In the Vercel project, open **Storage → Create Database → Neon** (Postgres) and connect it to the project for all environments. This adds `DATABASE_URL` automatically (`POSTGRES_URL` also works). The tables are created on first use; `db/schema.sql` documents them.
2. **Create a Blob store for the clips.** In the Vercel project, open **Storage → Create Database → Blob**. Choose **Private** access and connect it to the project for all environments. This adds the store credentials automatically (`BLOB_STORE_ID`, or `BLOB_READ_WRITE_TOKEN` on older connections).
3. **Set a passcode.** Under **Settings → Environment Variables**, add `DECK_PASSWORD` with a passcode of your choice, for all environments.
4. **Redeploy** so the functions pick up the new variables (Deployments → ⋯ → Redeploy).
5. **Connect.** On the site, click **Cloud**, enter the passcode and click **Connect**. Repeat on each device.

If you created the Blob store with **Public** access instead, also set `DECK_BLOB_ACCESS=public`. Private is recommended: clips are only served through the app, to someone who has the passcode.

### How sync works

- Each key is a row in the `deck_keys` table: label, faction, sound (synth preset, spoken line or clips), hotkey, colour, volume, pitch, favourite, its clips in play order (`clips`, a JSON list) and whether they play in order or at random (`play_mode`), in board order. The master volume and last-saved time are in `deck_settings`. Rows saved before multi-clip keys (single `file_id` / `clip_path`) are read as a one-clip list.
- Every change sends the board; the server updates changed keys, adds new ones and deletes removed ones in one transaction. Keys that didn't change are left alone. The last save wins.
- A board saved before the database existed (`layout.json` in Blob storage) is imported automatically the first time the database is read while empty.
- Each uploaded clip is stored once under `clips/`. Removing or replacing a clip in the editor, switching the key to a built-in sound, or removing the key deletes the clip from the store when no other key uses it.
- Clips are also cached in the browser (IndexedDB), so playback is instant and works offline. A new device downloads them in the background after connecting.
- The cloud limit is **4 MB per clip**, set by Vercel's 4.5 MB request size for functions. Larger files still work but stay in the browser that added them.
- When a browser connects with unsaved changes, those changes are saved to the cloud. Otherwise the cloud board replaces the browser's board. A tab that comes back into view picks up changes made on another device.
- The passcode is remembered in the browser after connecting. **Disconnect** forgets it without deleting anything.

### API

All routes require the passcode in an `x-deck-pass` header.

| Route | Purpose |
|-------|---------|
| `GET /api/layout` | Saved board from the database: `{ layout: { pads, master } \| null, savedAt }` |
| `PUT /api/layout` | Save the board to the database (JSON body `{ pads, master }`, up to 500 keys) |
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
| `api/layout.js` | Load and save the board's keys in Postgres |
| `api/_db.js` | Database connection, table setup and key ↔ row mapping (not a route) |
| `db/schema.sql` | Table definitions for reference |
| `api/clips.js` | Upload, stream, list and delete clips in Blob storage |
| `api/_lib.js` | Passcode check and shared helpers (not a route) |
| `sw.js` | Service worker for offline use |
| `manifest.webmanifest` | App name, colours and icons for install |
| `icons/` | App icon (SVG source plus 192 and 512 px PNGs) |
| `vercel.json` | Headers and URL settings for Vercel |
| `package.json` | `@vercel/blob` and `@neondatabase/serverless` dependencies, dev/deploy scripts |

## Features

- **24 keys across Terran, Protoss and Zerg:** 11 Terran and 5 Protoss units each speak their line ("You want a piece of me, boy?", "My life for Aiur!"), 4 Zerg units use creature sounds since Zerg units don't talk, and 4 advisor alerts sit with their race ("Nuclear launch detected.", "You must construct additional pylons.", "Spawn more overlords.").
- **Stand-in audio:** unit lines are spoken by the browser's text-to-speech and Zerg sounds are synthesized with the Web Audio API. Upload the original clip on any key to replace them.
- Boards saved before the unit set are migrated automatically on load: the old effect keys are replaced, and keys you added or gave an uploaded clip are kept.
- **Quick filters** by faction (Terran, Protoss, Zerg), plus search, ★ Favorites and My clips.
- **Hotkeys:** each key shows its letter. `Space` stops all sounds, `/` focuses search, `Esc` clears filters.
- **Several clips per key:** open a key with **✎**, choose **Audio clips** and use **+ Add clips** (several files at once, up to 20 per key). Each clip in the list can be played (▶), moved up or down (↑ ↓), replaced, or removed (✕). With two or more clips, pick **Play in order** (cycles through the list) or **Random** (never the same clip twice in a row). Dropping audio files onto a key adds them to the end of its list.
- To go back to the built-in sound, open the key with **✎** and pick Synth preset or Voice line.
- **Load clips** adds many files at once. A file whose name matches a key's label or spoken line (for example `nuclear-launch-detected.mp3`) is added to that key's clips, so `marine-1.mp3` and `marine-2.mp3` both land on Marine. Any other file becomes a new key.
- **Every key is editable:** **✎** under any key, the built-in ones included, changes its label, faction, sound (voice line text, synth preset or your own clip), light colour, hotkey, volume and pitch.
- **Add and remove keys at will:** **+ Add key** in the header, or the Add key tile at the end of the board, creates a new one. **Remove key** in a key's editor deletes it, with **Undo** for a few seconds afterwards. **Layout → Reset to defaults** brings back the original set.
- **Layout** copies the board setup as JSON, pastes one back in, or resets to defaults.
- **Cloud** syncs the board and clips across devices (see above).

## Mission tracker

Switch to **Mission tracker** with the tab under the header (or open the site with `#mission`). It tracks one tabletop game at a time, for StarCraft: The Miniatures Game or any similar skirmish game:

- **Round and phase:** round counter with a round limit, a phase stepper (**Next phase**), and **End round & score**.
- **Two players:** name, faction, initiative, victory points (±1) and resource counters (±1/±5), such as minerals, gas or supply.
- **Objectives:** set who holds each one (None / player 1 / player 2). **End round & score** gives each objective's VP to its holder. The mission ends after the last round, or as soon as a player reaches the VP target, with a "Mission complete" banner.
- **Battle log:** scoring, captures, VP changes and your own notes, each stamped with round and time.
- **Sound cues:** in **Mission setup**, pick keys from your board to play on a new round, next phase, objective taken and mission complete. Starred keys (★) show under **Quick sounds**, and hotkeys keep working on this screen.
- **Missions you define:** **Mission setup** edits the mission name, rounds, VP target, phases, resources and objectives (name and VP per round). **Save as mission** keeps it for reuse; pick it later from **Start from a saved mission**. The app ships only a generic starter mission, so enter the official mission's details from your rulebook or mission cards.
- **New game** (click twice to confirm) resets scores, resources, objectives and the log, keeping the mission and player names.

The tracker is saved in the browser (`rtsdeck.tracker`) and, when Cloud is connected, with the board in the database (`deck_settings.tracker`), so a phone at the table and a laptop see the same game.

## Where your data lives

- **In the browser:** clips in IndexedDB (database `rtsdeck`, store `clips`); the board in localStorage (`rtsdeck.v1`); the cloud passcode in localStorage (`rtsdeck.cloud`).
- **In the cloud (when connected):** keys and mission tracker in the `deck_keys` and `deck_settings` tables of this project's Neon database; clips under `clips/…` in its Blob store.

## About the sounds

This repo ships no game audio. The built-in effects are original synthesized imitations. To use the real game sounds, extract them from your own StarCraft install (for example with CascView) and load them with **⇪ Upload** or **Load clips**. Keep those files out of this repo, since the game audio is Blizzard's copyrighted material. A private Blob store keeps them behind your passcode.

Fan-made project, not affiliated with Blizzard Entertainment.
