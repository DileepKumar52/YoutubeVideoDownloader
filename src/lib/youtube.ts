import { Innertube, Platform, Log, ClientType } from 'youtubei.js';
import type { VideoMetadata, VideoFormatOption } from './types';
import { formatDuration, formatViews, sanitizeFilename } from './validation';

let innertubeInstance: Innertube | null = null;
let initPromise: Promise<Innertube> | null = null;

// Initialize Innertube with mobile web client and safe deciphering
export async function getInnertube(): Promise<Innertube> {
  if (innertubeInstance) return innertubeInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Silence internal parser noise
    Log.setLevel(Log.Level.NONE);

    // Provide safe deciphering evaluator
    Platform.shim.eval = (data: any, env: any) => {
      const code = typeof data === 'string' ? data : data.output;
      const fn = new Function(...Object.keys(env), code);
      return fn(...Object.values(env));
    };

    // ClientType.MWEB reliably bypasses datacenter bot checks and provides direct audio/video streams
    const yt = await Innertube.create({
      client_type: ClientType.MWEB,
      generate_session_locally: true,
    });

    innertubeInstance = yt;
    return yt;
  })();

  return initPromise;
}

export async function fetchVideoDetails(videoId: string): Promise<VideoMetadata> {
  const yt = await getInnertube();
  const info = await yt.getBasicInfo(videoId);

  const basic = info.basic_info;
  const streaming = info.streaming_data;

  if (!basic.title) {
    throw new Error('Video details could not be retrieved. The video may be private or unavailable.');
  }

  const durationSec = basic.duration || 0;
  const rawProgressive = streaming?.formats || [];
  const rawAdaptive = streaming?.adaptive_formats || [];

  // Parse Progressive Formats (Video + Audio combined)
  const videoFormats: VideoFormatOption[] = [];
  const seenVideoQualities = new Set<string>();

  for (const fmt of rawProgressive) {
    const qualityLabel = fmt.quality_label || (fmt.height ? `${fmt.height}p` : 'Standard');
    if (seenVideoQualities.has(qualityLabel)) continue;
    seenVideoQualities.add(qualityLabel);

    const isMp4 = (fmt.mime_type || '').includes('mp4');
    const container = isMp4 ? 'mp4' : (fmt.mime_type || '').split('/')[1]?.split(';')[0] || 'mp4';
    
    // Estimate size in MB
    let sizeMb: number | null = null;
    if (fmt.content_length) {
      sizeMb = Math.round((Number(fmt.content_length) / (1024 * 1024)) * 10) / 10;
    } else if (fmt.bitrate && durationSec > 0) {
      sizeMb = Math.round(((fmt.bitrate * durationSec) / 8 / (1024 * 1024)) * 10) / 10;
    }

    videoFormats.push({
      itag: fmt.itag,
      type: 'video',
      quality: qualityLabel,
      container,
      mimeType: fmt.mime_type || 'video/mp4',
      hasAudio: true,
      hasVideo: true,
      approxSizeMb: sizeMb,
      bitrate: fmt.bitrate,
    });
  }

  // Sort video formats descending by resolution/bitrate
  videoFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  // Parse Audio Formats (Audio only)
  const audioFormats: VideoFormatOption[] = [];
  const seenAudioItags = new Set<number>();

  const rawAudio = rawAdaptive.filter((f: any) => f.has_audio && !f.has_video);
  for (const fmt of rawAudio) {
    if (seenAudioItags.has(fmt.itag)) continue;
    seenAudioItags.add(fmt.itag);

    const isMp4 = (fmt.mime_type || '').includes('mp4');
    const container = isMp4 ? 'm4a' : 'webm';
    const kbps = fmt.bitrate ? Math.round(fmt.bitrate / 1000) : 128;
    const qualityLabel = `${kbps} kbps (${container.toUpperCase()})`;

    let sizeMb: number | null = null;
    if (fmt.content_length) {
      sizeMb = Math.round((Number(fmt.content_length) / (1024 * 1024)) * 10) / 10;
    } else if (fmt.bitrate && durationSec > 0) {
      sizeMb = Math.round(((fmt.bitrate * durationSec) / 8 / (1024 * 1024)) * 10) / 10;
    }

    audioFormats.push({
      itag: fmt.itag,
      type: 'audio',
      quality: qualityLabel,
      container,
      mimeType: fmt.mime_type || (isMp4 ? 'audio/mp4' : 'audio/webm'),
      hasAudio: true,
      hasVideo: false,
      approxSizeMb: sizeMb,
      bitrate: fmt.bitrate,
    });
  }

  // Sort audio formats descending by bitrate
  audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  // Pick best available thumbnail
  const thumbnails = basic.thumbnail || [];
  const bestThumbnail = thumbnails.length > 0
    ? thumbnails[thumbnails.length - 1].url
    : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    id: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: basic.title,
    author: basic.author || 'Unknown Artist',
    authorUrl: basic.channel_id ? `https://www.youtube.com/channel/${basic.channel_id}` : undefined,
    durationSeconds: durationSec,
    durationFormatted: formatDuration(durationSec),
    viewCount: basic.view_count || 0,
    viewCountFormatted: formatViews(basic.view_count || 0),
    thumbnailUrl: bestThumbnail,
    formats: {
      video: videoFormats,
      audio: audioFormats,
    },
  };
}

export async function streamVideoDownload(videoId: string, itag?: number, type: 'video' | 'audio' = 'video') {
  const yt = await getInnertube();
  const info = await yt.getBasicInfo(videoId);
  const title = sanitizeFilename(info.basic_info.title || `youtube_${videoId}`);

  let stream: ReadableStream;
  let filename = `${title}.mp4`;
  let mimeType = 'video/mp4';

  if (itag) {
    const allFormats = [
      ...(info.streaming_data?.formats || []),
      ...(info.streaming_data?.adaptive_formats || []),
    ];
    const targetFormat = allFormats.find((f: any) => f.itag === itag);

    if (targetFormat) {
      const isAudioOnly = targetFormat.has_audio && !targetFormat.has_video;
      const isMp4 = (targetFormat.mime_type || '').includes('mp4');
      const ext = isAudioOnly ? (isMp4 ? 'm4a' : 'webm') : (isMp4 ? 'mp4' : 'webm');
      const label = targetFormat.quality_label || (isAudioOnly ? `${Math.round((targetFormat.bitrate || 128000) / 1000)}k` : 'video');

      filename = `${title}_${label}.${ext}`;
      mimeType = targetFormat.mime_type?.split(';')[0] || (isAudioOnly ? 'audio/mp4' : 'video/mp4');
    }

    stream = await info.download({ itag });
  } else {
    // Default best progressive stream or audio
    if (type === 'audio') {
      stream = await info.download({ type: 'audio', quality: 'best' });
      filename = `${title}_audio.m4a`;
      mimeType = 'audio/mp4';
    } else {
      stream = await info.download({ type: 'video+audio', quality: 'best' });
      filename = `${title}_720p.mp4`;
      mimeType = 'video/mp4';
    }
  }

  return {
    stream,
    filename,
    mimeType,
  };
}

