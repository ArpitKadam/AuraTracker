import { extractFromVideoParts } from '../extraction/gemini';
import type { GeminiConfig, RecipeDraft } from '../extraction/types';
import { downloadReelClips, readClipBase64 } from './reel';

/** Tier 3: download the reel (medium quality), cut if oversize, read clips in parallel, merge. */
export async function extractFromReelVideo(
  cfg: GeminiConfig,
  reelUrl: string,
  caption?: string | null,
  onStage?: (id: string, label: string) => void,
): Promise<RecipeDraft> {
  onStage?.('download', 'Downloading the video');
  const clips = await downloadReelClips(reelUrl);
  onStage?.('watch', clips.uris.length > 1 ? `Watching the video (${clips.uris.length} clips)` : 'Watching the video');
  const parts = await Promise.all(clips.uris.map(readClipBase64));
  return extractFromVideoParts(cfg, parts, caption);
}
