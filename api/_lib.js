// Shared helpers for the API routes. Vercel does not expose files starting with "_" as routes.
import { createHash, timingSafeEqual } from 'node:crypto';

// Blob access must match how the store was created in Vercel (private is recommended).
export const ACCESS = process.env.DECK_BLOB_ACCESS === 'public' ? 'public' : 'private';
export const MAX_CLIP_BYTES = 4 * 1024 * 1024; // Vercel Functions accept request bodies up to 4.5 MB
export const MAX_LAYOUT_BYTES = 512 * 1024;

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  if (data === undefined) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

const digest = s => createHash('sha256').update(String(s)).digest();

// Every route needs the passcode in the x-deck-pass header. Returns false after replying when it is missing or wrong.
export function authorize(req, res) {
  const expected = process.env.DECK_PASSWORD;
  if (!expected) {
    send(res, 503, { error: 'Cloud storage is not set up yet. Add DECK_PASSWORD under Settings → Environment Variables in Vercel, then redeploy.' });
    return false;
  }
  // Older store connections add BLOB_READ_WRITE_TOKEN; newer ones add BLOB_STORE_ID and authenticate with Vercel's OIDC token.
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    send(res, 503, { error: 'Cloud storage is not set up yet. Connect a Blob store to this project under Storage in Vercel (all environments), then redeploy.' });
    return false;
  }
  if (!timingSafeEqual(digest(req.headers['x-deck-pass'] || ''), digest(expected))) {
    send(res, 401, { error: 'Wrong passcode.' });
    return false;
  }
  return true;
}

export async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const err = new Error('Request body too large');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function streamToText(stream) {
  return new Response(stream).text();
}

export function fail(res, err) {
  if (err && err.status === 413) return send(res, 413, { error: 'That file is over 4 MB. Trim it or export a smaller mp3.' });
  console.error(err);
  const name = err && err.name ? err.name : 'Error';
  if (name === 'BlobStoreNotFoundError' || name === 'BlobAccessError' || /credentials|OIDC/i.test(String(err && err.message))) {
    return send(res, 503, { error: `Blob storage rejected the request: ${err.message} Check that the Blob store is connected to this project for all environments, that its access type matches DECK_BLOB_ACCESS (private by default), and redeploy.` });
  }
  return send(res, 500, { error: `Storage error: ${err && err.message ? err.message : 'unknown'}` });
}
