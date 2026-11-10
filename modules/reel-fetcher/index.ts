import { requireNativeModule } from 'expo';

export type ReelInfo = {
  title: string | null;
  /** The Instagram caption. */
  description: string | null;
  uploader: string | null;
  thumbnail: string | null;
  /** Seconds; Instagram usually reports 0 here. Use DownloadedVideo.durationSec instead. */
  duration: number;
};

export type DownloadedVideo = {
  /** Absolute file path (no file:// prefix). */
  path: string;
  bytes: number;
  durationSec: number | null;
};

type Native = {
  init(update: boolean): Promise<{ version: string; update: string | null }>;
  getInfo(url: string): Promise<ReelInfo>;
  downloadVideo(url: string, outDir: string, format: string): Promise<DownloadedVideo>;
  splitVideo(path: string, parts: number): Promise<string[]>;
};

export default requireNativeModule<Native>('ReelFetcher');
