// Keeps the deck_clips table in step with Blob storage. Not a route: Vercel skips files starting with "_".
import { list } from '@vercel/blob';
import { hasBlob, hasDb } from './_lib.js';
import { ensureSchema, syncClipRows } from './_db.js';

export async function listBlobClips() {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: 'clips/', cursor });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

export async function syncCatalog() {
  await ensureSchema();
  await syncClipRows(await listBlobClips());
}

// Once per function instance, fill the catalogue from Blob storage (covers clips uploaded before it existed).
// Never fails the request that triggered it.
let synced = null;
export function syncCatalogOnce() {
  if (!synced && hasDb() && hasBlob()) synced = syncCatalog().catch(err => { synced = null; console.error('Clip catalogue sync failed', err); });
  return synced || Promise.resolve();
}
