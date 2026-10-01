// /api/layout
//   GET  → { layout: { pads, master } | null, savedAt }
//   PUT  body { pads, master } → { savedAt }
// The whole board is one JSON document; the last save wins.
import { put, get } from '@vercel/blob';
import { ACCESS, MAX_LAYOUT_BYTES, authorize, send, readBody, streamToText, fail } from './_lib.js';

const PATH = 'layout.json';

export default async function handler(req, res) {
  if (!authorize(req, res)) return;

  try {
    if (req.method === 'GET') {
      const result = await get(PATH, { access: ACCESS, useCache: false });
      if (!result || result.statusCode !== 200) return send(res, 200, { layout: null, savedAt: null });
      const doc = JSON.parse(await streamToText(result.stream));
      return send(res, 200, { layout: { pads: doc.pads, master: doc.master }, savedAt: doc.savedAt || null });
    }

    if (req.method === 'PUT') {
      let doc;
      try { doc = JSON.parse((await readBody(req, MAX_LAYOUT_BYTES)).toString('utf8')); } catch (err) {
        if (err.status === 413) return send(res, 413, { error: 'The layout is too large to save.' });
        return send(res, 400, { error: 'The layout is not valid JSON.' });
      }
      if (!doc || !Array.isArray(doc.pads)) return send(res, 400, { error: 'The layout needs a pads list.' });
      const savedAt = new Date().toISOString();
      const body = JSON.stringify({ savedAt, master: typeof doc.master === 'number' ? doc.master : 0.8, pads: doc.pads });
      await put(PATH, body, { access: ACCESS, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 });
      return send(res, 200, { savedAt });
    }

    res.setHeader('Allow', 'GET, PUT');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    return fail(res, err);
  }
}
