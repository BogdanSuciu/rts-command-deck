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
      // Multiple clips per key (added later; tables created before this get the columns here).
      q`ALTER TABLE deck_keys ADD COLUMN IF NOT EXISTS clips jsonb NOT NULL DEFAULT '[]'::jsonb`,
      q`ALTER TABLE deck_keys ADD COLUMN IF NOT EXISTS play_mode text NOT NULL DEFAULT 'order'`,
      // Mission tracker state (current game, mission setup, saved missions), stored with the board.
      q`ALTER TABLE deck_settings ADD COLUMN IF NOT EXISTS tracker jsonb`,
      // Catalogue of uploaded audio files (the files themselves live in Blob storage under clips/).
      q`CREATE TABLE IF NOT EXISTS deck_clips (
          path text PRIMARY KEY, name text NOT NULL, content_type text NOT NULL DEFAULT '',
          size integer NOT NULL DEFAULT 0, uploaded_at timestamptz NOT NULL DEFAULT now())`,
    ]).catch(err => { ready = null; throw err; });
  }
  return ready;
}

const FACTIONS = new Set(['terran', 'protoss', 'zerg']);
const KINDS = new Set(['synth', 'voice', 'file']);
const CLIP_PATH = /^clips\/[\w.\- ]+$/;
const MAX_CLIPS = 20;

// A key's clips in play order: [{ fileId, name, path }]. Accepts the older single-clip fields too.
function cleanClips(p) {
  const list = Array.isArray(p.clips) ? p.clips : p.fileId ? [{ fileId: p.fileId, name: p.fileName, path: p.cloudPath }] : [];
  return list.filter(c => c && c.fileId).slice(0, MAX_CLIPS).map(c => ({
    fileId: str(c.fileId, 64), name: str(c.name || 'clip', 120), path: CLIP_PATH.test(c.path || '') ? c.path : '',
  }));
}
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
    clips: JSON.stringify(cleanClips(p)), play_mode: p.playMode === 'random' ? 'random' : 'order',
    // Single-clip columns from before multi-clip support; kept empty on new writes.
    file_id: '', file_name: '', clip_path: '', prev_kind: '',
  };
}

// A row → the page's key object.
export function toPad(r) {
  let clips = typeof r.clips === 'string' ? JSON.parse(r.clips) : r.clips || [];
  if (!clips.length && r.file_id) clips = [{ fileId: r.file_id, name: r.file_name, path: r.clip_path }]; // row from before multi-clip
  return {
    id: r.id, name: r.name, faction: r.faction, kind: r.kind, preset: r.preset, text: r.line, key: r.hotkey,
    vol: r.volume, pitch: r.pitch, color: r.color, fav: r.favorite, clips, playMode: r.play_mode || 'order',
  };
}

export async function readBoard() {
  const q = db();
  const [keys, settings] = await q.transaction([
    q`SELECT * FROM deck_keys ORDER BY position, id`,
    q`SELECT master, saved_at, tracker FROM deck_settings WHERE id = 1`,
  ], { readOnly: true });
  if (!settings.length) return null; // never saved
  const t = settings[0].tracker;
  return {
    pads: keys.map(toPad), master: settings[0].master, savedAt: new Date(settings[0].saved_at).toISOString(),
    tracker: typeof t === 'string' ? JSON.parse(t) : t || null,
  };
}

// Replace the whole board in one transaction: upsert every key, delete keys that are gone.
export async function writeBoard(pads, master, tracker) {
  const rows = [];
  const seen = new Set();
  pads.forEach(p => {
    const r = toRow(p, rows.length);
    if (r && !seen.has(r.id)) { seen.add(r.id); rows.push(r); }
  });
  const col = k => rows.map(r => r[k]);
  const trackerJson = tracker && typeof tracker === 'object' ? JSON.stringify(tracker) : null;
  const q = db();
  const results = await q.transaction([
    q`DELETE FROM deck_keys WHERE NOT (id = ANY(${col('id')}::text[]))`,
    q`INSERT INTO deck_keys (id, position, name, faction, kind, preset, line, hotkey, volume, pitch, color, favorite, file_id, file_name, clip_path, prev_kind, clips, play_mode)
      SELECT u.id, u.position, u.name, u.faction, u.kind, u.preset, u.line, u.hotkey, u.volume, u.pitch, u.color, u.favorite,
             u.file_id, u.file_name, u.clip_path, u.prev_kind, u.clips::jsonb, u.play_mode
      FROM unnest(
        ${col('id')}::text[], ${col('position')}::int[], ${col('name')}::text[], ${col('faction')}::text[], ${col('kind')}::text[],
        ${col('preset')}::text[], ${col('line')}::text[], ${col('hotkey')}::text[], ${col('volume')}::real[], ${col('pitch')}::real[],
        ${col('color')}::text[], ${col('favorite')}::boolean[], ${col('file_id')}::text[], ${col('file_name')}::text[],
        ${col('clip_path')}::text[], ${col('prev_kind')}::text[], ${col('clips')}::text[], ${col('play_mode')}::text[])
        AS u(id, position, name, faction, kind, preset, line, hotkey, volume, pitch, color, favorite, file_id, file_name, clip_path, prev_kind, clips, play_mode)
      ON CONFLICT (id) DO UPDATE SET
        position = EXCLUDED.position, name = EXCLUDED.name, faction = EXCLUDED.faction, kind = EXCLUDED.kind,
        preset = EXCLUDED.preset, line = EXCLUDED.line, hotkey = EXCLUDED.hotkey, volume = EXCLUDED.volume,
        pitch = EXCLUDED.pitch, color = EXCLUDED.color, favorite = EXCLUDED.favorite, file_id = EXCLUDED.file_id,
        file_name = EXCLUDED.file_name, clip_path = EXCLUDED.clip_path, prev_kind = EXCLUDED.prev_kind,
        clips = EXCLUDED.clips, play_mode = EXCLUDED.play_mode, updated_at = now()
      WHERE (deck_keys.position, deck_keys.name, deck_keys.faction, deck_keys.kind, deck_keys.preset, deck_keys.line,
             deck_keys.hotkey, deck_keys.volume, deck_keys.pitch, deck_keys.color, deck_keys.favorite, deck_keys.file_id,
             deck_keys.file_name, deck_keys.clip_path, deck_keys.prev_kind, deck_keys.clips, deck_keys.play_mode)
        IS DISTINCT FROM (EXCLUDED.position, EXCLUDED.name, EXCLUDED.faction, EXCLUDED.kind, EXCLUDED.preset, EXCLUDED.line,
             EXCLUDED.hotkey, EXCLUDED.volume, EXCLUDED.pitch, EXCLUDED.color, EXCLUDED.favorite, EXCLUDED.file_id,
             EXCLUDED.file_name, EXCLUDED.clip_path, EXCLUDED.prev_kind, EXCLUDED.clips, EXCLUDED.play_mode)`,
    // A save without tracker data (older page) keeps the stored tracker.
    q`INSERT INTO deck_settings (id, master, saved_at, tracker) VALUES (1, ${num(master, 0, 1, 0.8)}, now(), ${trackerJson}::jsonb)
      ON CONFLICT (id) DO UPDATE SET master = EXCLUDED.master, saved_at = EXCLUDED.saved_at,
        tracker = COALESCE(EXCLUDED.tracker, deck_settings.tracker)
      RETURNING saved_at`,
  ]);
  return { savedAt: new Date(results[2][0].saved_at).toISOString(), keys: rows.length };
}

/* ---------- uploaded clip catalogue ---------- */

export async function recordClip({ path, name, type, size }) {
  const q = db();
  await q`INSERT INTO deck_clips (path, name, content_type, size) VALUES (${path}, ${str(name, 120)}, ${str(type, 64)}, ${size | 0})
          ON CONFLICT (path) DO NOTHING`;
}

export async function forgetClip(path) {
  const q = db();
  await q`DELETE FROM deck_clips WHERE path = ${path}`;
}

// Make the catalogue match what is actually in Blob storage: add files it doesn't know, drop rows for files that are gone.
export async function syncClipRows(blobs) {
  const q = db();
  const paths = blobs.map(b => b.pathname);
  await q.transaction([
    q`INSERT INTO deck_clips (path, name, content_type, size, uploaded_at)
      SELECT u.path, regexp_replace(u.path, '^clips/', ''), '', u.size, u.uploaded_at
      FROM unnest(${paths}::text[], ${blobs.map(b => b.size | 0)}::int[], ${blobs.map(b => new Date(b.uploadedAt).toISOString())}::timestamptz[])
        AS u(path, size, uploaded_at)
      ON CONFLICT (path) DO NOTHING`,
    q`DELETE FROM deck_clips WHERE NOT (path = ANY(${paths}::text[]))`,
  ]);
}

// Every stored clip, oldest first, with whether any key still uses it.
export async function listClipRows() {
  const q = db();
  const rows = await q`
    SELECT c.path, c.name, c.content_type, c.size, c.uploaded_at,
           EXISTS (SELECT 1 FROM deck_keys k WHERE k.clips @> jsonb_build_array(jsonb_build_object('path', c.path))) AS in_use
    FROM deck_clips c ORDER BY c.uploaded_at, c.path`;
  return rows.map(r => ({ path: r.path, name: r.name, type: r.content_type, size: r.size, uploadedAt: new Date(r.uploaded_at).toISOString(), inUse: r.in_use }));
}
