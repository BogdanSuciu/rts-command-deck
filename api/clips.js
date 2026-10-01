// /api/clips
//   POST                 upload one audio file (raw body, Content-Type audio/*, X-File-Name header) → { path }
//   GET   ?path=clips/…  stream one stored clip
//   GET                  list stored clips
//   DELETE ?path=clips/… delete one clip
import { Readable } from 'node:stream';
import { put, get, list, del } from '@vercel/blob';
import { ACCESS, MAX_CLIP_BYTES, authorize, send, readBody, fail } from './_lib.js';

const AUDIO_EXT = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', webm: 'audio/webm' };

function clipPath(raw) {
  const p = String(raw || '');
  return /^clips\/[\w.\- ]+$/.test(p) ? p : null;
}

function safeName(raw) {
  let name = 'clip';
  try { name = decodeURIComponent(String(raw || 'clip')); } catch { /* keep default */ }
  return name.replace(/[^\w.\- ]+/g, '_').replace(/^[.\s]+/, '').slice(0, 80) || 'clip';
}

export default async function handler(req, res) {
  if (!authorize(req, res, { blob: true })) return;
  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'POST') {
      const name = safeName(req.headers['x-file-name']);
      const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
      let type = String(req.headers['content-type'] || '').split(';')[0].trim();
      if (!/^audio\//.test(type)) type = AUDIO_EXT[ext] || '';
      if (!type) return send(res, 415, { error: 'Only audio files can be stored (mp3, wav, ogg, m4a, flac).' });

      const body = await readBody(req, MAX_CLIP_BYTES);
      if (!body.length) return send(res, 400, { error: 'The file is empty.' });
      const blob = await put(`clips/${name}`, body, { access: ACCESS, contentType: type, addRandomSuffix: true });
      return send(res, 201, { path: blob.pathname, size: body.length });
    }

    if (req.method === 'GET' && url.searchParams.has('path')) {
      const path = clipPath(url.searchParams.get('path'));
      if (!path) return send(res, 400, { error: 'Not a clip path.' });
      const result = await get(path, { access: ACCESS });
      if (!result || result.statusCode !== 200) return send(res, 404, { error: 'Clip not found. It may have been deleted.' });
      res.statusCode = 200;
      res.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream');
      res.setHeader('Content-Length', String(result.blob.size));
      // Stored clip paths carry a random suffix and never change, so the browser may keep them.
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      Readable.fromWeb(result.stream).pipe(res);
      return;
    }

    if (req.method === 'GET') {
      const clips = [];
      let cursor;
      do {
        const page = await list({ prefix: 'clips/', cursor });
        for (const b of page.blobs) clips.push({ path: b.pathname, size: b.size, uploadedAt: b.uploadedAt });
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return send(res, 200, { clips });
    }

    if (req.method === 'DELETE') {
      const path = clipPath(url.searchParams.get('path'));
      if (!path) return send(res, 400, { error: 'Not a clip path.' });
      await del(path);
      return send(res, 204);
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    return fail(res, err);
  }
}
