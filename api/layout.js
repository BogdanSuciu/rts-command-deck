// /api/layout — the board, stored as one row per key in Postgres (see api/_db.js, db/schema.sql)
//   GET  → { layout: { pads, master } | null, savedAt }
//   PUT  body { pads, master } → { savedAt, keys }
// The page always sends the whole board; the server upserts changed keys and deletes removed ones in one
// transaction. The last save wins.
import { get } from '@vercel/blob';
import { ACCESS, MAX_LAYOUT_BYTES, authorize, hasBlob, send, readBody, streamToText, fail } from './_lib.js';
import { ensureSchema, readBoard, writeBoard } from './_db.js';

// Boards saved before the database existed live in Blob storage as layout.json. Import that once,
// the first time the database is read while still empty.
async function importLegacyBoard() {
  if (!hasBlob()) return null;
  try {
    const result = await get('layout.json', { access: ACCESS, useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const doc = JSON.parse(await streamToText(result.stream));
    if (!doc || !Array.isArray(doc.pads) || !doc.pads.length) return null;
    await writeBoard(doc.pads, doc.master);
    return readBoard();
  } catch (err) {
    console.error('Legacy layout import failed', err);
    return null;
  }
}

export default async function handler(req, res) {
  if (!authorize(req, res, { db: true })) return;

  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const board = (await readBoard()) || (await importLegacyBoard());
      if (!board) return send(res, 200, { layout: null, savedAt: null });
      return send(res, 200, { layout: { pads: board.pads, master: board.master }, savedAt: board.savedAt });
    }

    if (req.method === 'PUT') {
      let doc;
      try { doc = JSON.parse((await readBody(req, MAX_LAYOUT_BYTES)).toString('utf8')); } catch (err) {
        if (err.status === 413) return send(res, 413, { error: 'The board is too large to save.' });
        return send(res, 400, { error: 'The board is not valid JSON.' });
      }
      if (!doc || !Array.isArray(doc.pads)) return send(res, 400, { error: 'The board needs a pads list.' });
      if (doc.pads.length > 500) return send(res, 400, { error: 'A board can have at most 500 keys.' });
      const { savedAt, keys } = await writeBoard(doc.pads, doc.master);
      return send(res, 200, { savedAt, keys });
    }

    res.setHeader('Allow', 'GET, PUT');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    return fail(res, err);
  }
}
