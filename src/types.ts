export type MediaFormat = 'mp3' | 'mp4' | 'wav' | 'm4a';

export type AudioQuality = '320k' | '256k' | '192k' | '128k' | '96k' | '64k';
export type VideoQuality = '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p' | '240p';

export interface VideoMetadata {
  type: 'youtube' | 'direct';
  id: string;
  url: string;
  embedUrl?: string;
  title: string;
  sanitizedTitle: string;
  author: string;
  authorUrl?: string;
  durationSec: number;
  formattedDuration: string;
  thumbnails: {
    maxres: string;
    hq: string;
    sd: string;
    mq: string;
  };
  audioSizes: Record<string, string>;
  videoSizes: Record<string, string>;
}

export interface ConversionOptions {
  format: MediaFormat;
  quality: string;
  trimStart: number;
  trimEnd: number;
  volume: number;
  channels: '1' | '2';
  sampleRate: '48000' | '44100' | '32000';
  fps: '60' | '30' | '24';
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  muteVideo?: boolean;
}

export interface DownloadHistoryItem {
  id: string;
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
  format: MediaFormat;
  quality: string;
  size: string;
  date: string;
  url: string;
}
