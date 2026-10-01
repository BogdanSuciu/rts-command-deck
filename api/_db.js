// Postgres (Neon) access for the board's keys. Not a route: Vercel skips files starting with "_".
import { neon } from '@neondatabase/serverless';

export const dbUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

let sql = null;
export function db() {
  if (!sql) sql = neon(dbUrl());
  return sql;
}

// Create the tables on first use in each function instance. Same statements as db/schema.sql.
let ready = null;
export function ensureSchema() {
  if (!ready) {
    const q = db();
    ready = q.transaction([
      q`CREATE TABLE IF NOT EXISTS deck_keys (
          id text PRIMARY KEY, position integer NOT NULL, name text NOT NULL, faction text NOT NULL, kind text NOT NULL,
          preset text NOT NULL DEFAULT '', line text NOT NULL DEFAULT '', hotkey text NOT NULL DEFAULT '',
          volume real NOT NULL DEFAULT 1, pitch real NOT NULL DEFAULT 1, color text NOT NULL DEFAULT '',
          favorite boolean NOT NULL DEFAULT false, file_id text NOT NULL DEFAULT '', file_name text NOT NULL DEFAULT '',
          clip_path text NOT NULL DEFAULT '', prev_kind text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now())`,
      q`CREATE TABLE IF NOT EXISTS deck_settings (
          id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), master real NOT NULL DEFAULT 0.8, saved_at timestamptz NOT NULL DEFAULT now())`,
    ]).catch(err => { ready = null; throw err; });
  }
  return ready;
}

const FACTIONS = new Set(['terran', 'protoss', 'zerg']);
const KINDS = new Set(['synth', 'voice', 'file']);
const str = (v, max) => String(v ?? '').slice(0, max);
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

// The page's key object → a clean row, or null if it can't be stored.
export function toRow(p, position) {
  if (!p || typeof p !== 'object' || !p.id || !p.name) return null;
  return {
    id: str(p.id, 64), position, name: str(p.name, 40),
    faction: FACTIONS.has(p.faction) ? p.faction : 'terran',
    kind: KINDS.has(p.kind) ? p.kind : 'synth',
    preset: str(p.preset, 32), line: str(p.text, 160), hotkey: str(p.key, 12).toLowerCase(),
    volume: num(p.vol, 0, 1.5, 1), pitch: num(p.pitch, 0.5, 2, 1),
    color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '', favorite: !!p.fav,
    file_id: str(p.fileId, 64), file_name: str(p.fileName, 120),
    clip_path: /^clips\/[\w.\- ]+$/.test(p.cloudPath || '') ? p.cloudPath : '',
    prev_kind: p.prevKind === 'synth' || p.prevKind === 'voice' ? p.prevKind : '',
  };
}

// A row → the page's key object.
export const toPad = r => ({
  id: r.id, name: r.name, faction: r.faction, kind: r.kind, preset: r.preset, text: r.line, key: r.hotkey,
  vol: r.volume, pitch: r.pitch, color: r.color, fav: r.favorite,
  fileId: r.file_id, fileName: r.file_name, cloudPath: r.clip_path, prevKind: r.prev_kind,
});

export async function readBoard() {
  const q = db();
  const [keys, settings] = await q.transaction([
    q`SELECT * FROM deck_keys ORDER BY position, id`,
    q`SELECT master, saved_at FROM deck_settings WHERE id = 1`,
  ], { readOnly: true });
  if (!settings.length) return null; // never saved
  return { pads: keys.map(toPad), master: settings[0].master, savedAt: new Date(settings[0].saved_at).toISOString() };
}

// Replace the whole board in one transaction: upsert every key, delete keys that are gone.
export async function writeBoard(pads, master) {
  const rows = [];
  const seen = new Set();
  pads.forEach(p => {
    const r = toRow(p, rows.length);
    if (r && !seen.has(r.id)) { seen.add(r.id); rows.push(r); }
  });
  const col = k => rows.map(r => r[k]);
  const q = db();
  const results = await q.transaction([
    q`DELETE FROM deck_keys WHERE NOT (id = ANY(${col('id')}::text[]))`,
    q`INSERT INTO deck_keys (id, position, name, faction, kind, preset, line, hotkey, volume, pitch, color, favorite, file_id, file_name, clip_path, prev_kind)
      SELECT * FROM unnest(
        ${col('id')}::text[], ${col('position')}::int[], ${col('name')}::text[], ${col('faction')}::text[], ${col('kind')}::text[],
        ${col('preset')}::text[], ${col('line')}::text[], ${col('hotkey')}::text[], ${col('volume')}::real[], ${col('pitch')}::real[],
        ${col('color')}::text[], ${col('favorite')}::boolean[], ${col('file_id')}::text[], ${col('file_name')}::text[],
        ${col('clip_path')}::text[], ${col('prev_kind')}::text[])
      ON CONFLICT (id) DO UPDATE SET
        position = EXCLUDED.position, name = EXCLUDED.name, faction = EXCLUDED.faction, kind = EXCLUDED.kind,
        preset = EXCLUDED.preset, line = EXCLUDED.line, hotkey = EXCLUDED.hotkey, volume = EXCLUDED.volume,
        pitch = EXCLUDED.pitch, color = EXCLUDED.color, favorite = EXCLUDED.favorite, file_id = EXCLUDED.file_id,
        file_name = EXCLUDED.file_name, clip_path = EXCLUDED.clip_path, prev_kind = EXCLUDED.prev_kind, updated_at = now()
      WHERE (deck_keys.position, deck_keys.name, deck_keys.faction, deck_keys.kind, deck_keys.preset, deck_keys.line,
             deck_keys.hotkey, deck_keys.volume, deck_keys.pitch, deck_keys.color, deck_keys.favorite, deck_keys.file_id,
             deck_keys.file_name, deck_keys.clip_path, deck_keys.prev_kind)
        IS DISTINCT FROM (EXCLUDED.position, EXCLUDED.name, EXCLUDED.faction, EXCLUDED.kind, EXCLUDED.preset, EXCLUDED.line,
             EXCLUDED.hotkey, EXCLUDED.volume, EXCLUDED.pitch, EXCLUDED.color, EXCLUDED.favorite, EXCLUDED.file_id,
             EXCLUDED.file_name, EXCLUDED.clip_path, EXCLUDED.prev_kind)`,
    q`INSERT INTO deck_settings (id, master, saved_at) VALUES (1, ${num(master, 0, 1, 0.8)}, now())
      ON CONFLICT (id) DO UPDATE SET master = EXCLUDED.master, saved_at = EXCLUDED.saved_at
      RETURNING saved_at`,
  ]);
  return { savedAt: new Date(results[2][0].saved_at).toISOString(), keys: rows.length };
}
