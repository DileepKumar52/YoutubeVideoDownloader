export interface VideoFormatOption {
  itag: number;
  type: 'video' | 'audio';
  quality: string;           // e.g. "720p HD", "360p SD", "128 kbps"
  container: string;         // e.g. "mp4", "m4a", "webm"
  mimeType: string;
  hasAudio: boolean;
  hasVideo: boolean;
  approxSizeMb?: number | null;
  bitrate?: number;
}

export interface VideoMetadata {
  id: string;
  url: string;
  title: string;
  author: string;
  authorUrl?: string;
  durationSeconds: number;
  durationFormatted: string;
  viewCount: number;
  viewCountFormatted: string;
  thumbnailUrl: string;
  formats: {
    video: VideoFormatOption[];
    audio: VideoFormatOption[];
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

