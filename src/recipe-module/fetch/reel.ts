import { Directory, File, Paths } from 'expo-file-system';

import ReelFetcher from '../../../modules/reel-fetcher';
import { MAX_INLINE_BYTES, planParts } from '../extraction/gemini';

/**
 * "Medium quality". Instagram's DASH ladder runs 693 kbps to 8.9 Mbps (720p to 1440p). Reels are
 * portrait, so height filters would match nothing; width and bitrate are used instead.
 *  1. the single-file H.264+AAC stream (720x1280, about 2.1 Mbps): no merge step, and Android can cut it;
 *  2. a mid-bitrate 720-wide DASH video (900-1800 kbps) merged with audio;
 *  3. any 720-wide DASH video merged with audio, then whatever yt-dlp finds.
 */
export const MEDIUM_FORMAT = 'b[ext=mp4]/bv[width<=720][tbr<=1800][tbr>=900]+ba/bv[width<=720]+ba/b';

export class ReelError extends Error {
  constructor(
    readonly code: 'BAD_URL' | 'PRIVATE' | 'FETCH_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'ReelError';
  }
}

export type ReelMeta = {
  url: string;
  caption: string;
  author: string | null;
  title: string | null;
  thumbnailUrl: string | null;
};

/** Keeps https://www.instagram.com/<reel|p|tv>/<id>/ and drops tracking params. */
export function normalizeReelUrl(input: string): string {
  const m = input.trim().match(/^https?:\/\/(?:www\.)?instagram\.com\/(reels?|p|tv)\/([A-Za-z0-9_-]+)/i);
  if (!m) throw new ReelError('BAD_URL', 'That is not an Instagram reel or post link');
  const kind = m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase();
  return `https://www.instagram.com/${kind}/${m[2]}/`;
}

function explain(e: unknown): ReelError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/login|log in|private|not available|empty media|restricted|rate-limit/i.test(msg)) {
    return new ReelError('PRIVATE', 'This post is private or needs a login, so it cannot be imported. Paste its caption instead.');
  }
  return new ReelError('FETCH_FAILED', `Could not read this link: ${msg.split('\n').pop()?.slice(0, 200)}`);
}

let ready: Promise<unknown> | null = null;
let updatedThisSession = false;

/**
 * The yt-dlp bundled in the library is old (2025.11.12 in library 0.18.1) and cannot read Instagram.
 * A null version means it was never self-updated, so update once on first use.
 */
const ensureReady = () =>
  (ready ??= (async () => {
    const { version } = await ReelFetcher.init(false);
    if (version === null) {
      await ReelFetcher.init(true);
      updatedThisSession = true;
    }
  })().catch((e) => ((ready = null), Promise.reject(e))));

/** Caption, author and thumbnail URL. A failure earns one yt-dlp self-update and one retry per session. */
export async function fetchReel(rawUrl: string): Promise<ReelMeta> {
  const url = normalizeReelUrl(rawUrl);
  await ensureReady();
  let info;
  try {
    info = await ReelFetcher.getInfo(url);
  } catch (first) {
    // "Login required" is also what an outdated extractor says, so only call a post private after updating.
    if (updatedThisSession) throw explain(first);
    try {
      await ReelFetcher.init(true);
      updatedThisSession = true;
      info = await ReelFetcher.getInfo(url);
    } catch (second) {
      throw explain(second);
    }
  }
  return {
    url,
    caption: info.description ?? '',
    author: info.uploader,
    title: info.title,
    thumbnailUrl: info.thumbnail,
  };
}

/** Saves the thumbnail permanently and returns its file:// URI. */
export async function saveThumbnail(thumbnailUrl: string, id: string): Promise<string> {
  const dir = new Directory(Paths.document, 'thumbs');
  dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, `${id}.jpg`);
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(thumbnailUrl, dest);
  return file.uri;
}

export type VideoClips = {
  /** file:// URIs, in order. One entry when the video fits; otherwise the cut clips. */
  uris: string[];
  totalBytes: number;
  durationSec: number | null;
};

/** Downloads at medium quality; cuts into clips that each fit Gemini's inline limit. */
export async function downloadReelClips(rawUrl: string): Promise<VideoClips> {
  const url = normalizeReelUrl(rawUrl);
  await ensureReady();
  const dir = new Directory(Paths.cache, 'reel');
  dir.create({ intermediates: true, idempotent: true });
  const dl = await ReelFetcher.downloadVideo(url, dir.uri.replace(/^file:\/\//, ''), MEDIUM_FORMAT).catch((e) => {
    throw explain(e);
  });
  const parts = planParts(dl.bytes);
  const paths = parts === 1 ? [dl.path] : await ReelFetcher.splitVideo(dl.path, parts);
  return { uris: paths.map((p) => `file://${p}`), totalBytes: dl.bytes, durationSec: dl.durationSec };
}

export async function readClipBase64(uri: string): Promise<{ mimeType: string; base64: string }> {
  const f = new File(uri);
  if (f.size > MAX_INLINE_BYTES) throw new ReelError('FETCH_FAILED', 'A video clip is still too large to send');
  return { mimeType: 'video/mp4', base64: await f.base64() };
}
