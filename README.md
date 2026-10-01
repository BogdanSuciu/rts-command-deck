# RTS Command Deck

A StarCraft-inspired sound effects board in a single HTML file. Chunky console keys press down and light up as they play. It has hotkeys and quick filters, and every key can play your own sound file.

## Run it

Open `index.html` in a browser. There is no build step and nothing to install. To host it, put `index.html` on any static host (GitHub Pages, Netlify, Vercel).

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
