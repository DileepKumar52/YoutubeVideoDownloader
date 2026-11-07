import { Ytdl } from '@distube/ytdl-core';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import type { VideoMetadata, VideoFormatOption } from './types';
import { formatDuration, formatViews, sanitizeFilename } from './validation';

let ytdlInstance: Ytdl | null = null;

export function getYtdl(): Ytdl {
  if (!ytdlInstance) {
    ytdlInstance = new Ytdl();
  }
  return ytdlInstance;
}

export async function fetchVideoDetails(videoId: string): Promise<VideoMetadata> {
  const ytdl = getYtdl();
  const info = await ytdl.getInfo(videoId);

  const basic = info.videoDetails;
  if (!basic || !basic.title) {
    throw new Error('Video details could not be retrieved. The video may be private or unavailable.');
  }

  const durationSec = parseInt(basic.lengthSeconds, 10) || 0;
  const rawFormats = info.formats || [];

  // Determine if video is vertical (Shorts / portrait) or standard horizontal (16:9)
  const firstVideo = rawFormats.find((f: any) => f.hasVideo && f.width && f.height);
  const isVertical = firstVideo ? firstVideo.height > firstVideo.width : false;

  // Best audio track for estimating combined size of adaptive streams
  const bestAudio = rawFormats.find((f: any) => f.itag === 140) ||
                    rawFormats.find((f: any) => f.hasAudio && !f.hasVideo);
  const audioBitrate = bestAudio?.bitrate || 128000;
  const audioSizeBytes = bestAudio?.contentLength
    ? parseInt(bestAudio.contentLength, 10)
    : (audioBitrate * durationSec) / 8;

  // 1. Process Video Formats using the 7 standard resolution tiers in ascending order:
  // 1. 140p, 2. 360p, 3. 480p, 4. 720p HD, 5. 1080p Full HD, 6. 1280p, 7. 1920p
  const standardTiers = [
    {
      order: 1,
      quality: '140p',
      match: (f: any) =>
        Math.min(f.width || 0, f.height || 0) === 144 ||
        f.height === 144 ||
        f.qualityLabel?.startsWith('144p'),
    },
    {
      order: 2,
      quality: '360p',
      match: (f: any) =>
        Math.min(f.width || 0, f.height || 0) === 360 ||
        f.height === 360 ||
        f.qualityLabel?.startsWith('360p'),
    },
    {
      order: 3,
      quality: '480p',
      match: (f: any) =>
        Math.min(f.width || 0, f.height || 0) === 480 ||
        f.height === 480 ||
        f.qualityLabel?.startsWith('480p'),
    },
    {
      order: 4,
      quality: '720p HD',
      match: (f: any) =>
        !isVertical &&
        ((f.width === 1280 && f.height === 720) ||
          (f.height === 720 && (f.width || 0) >= 720) ||
          f.qualityLabel?.startsWith('720p')),
    },
    {
      order: 5,
      quality: '1080p Full HD',
      match: (f: any) =>
        !isVertical &&
        ((f.width === 1920 && f.height === 1080) ||
          (f.height === 1080 && (f.width || 0) >= 1080) ||
          f.qualityLabel?.startsWith('1080p')),
    },
    {
      order: 6,
      quality: '1280p',
      match: (f: any) =>
        isVertical &&
        ((f.width === 720 && f.height === 1280) ||
          f.height === 1280 ||
          f.qualityLabel?.startsWith('720p')),
    },
    {
      order: 7,
      quality: '1920p',
      match: (f: any) =>
        isVertical &&
        ((f.width === 1080 && f.height === 1920) ||
          f.height === 1920 ||
          f.qualityLabel?.startsWith('1080p')),
    },
  ];

  const videoFormats: VideoFormatOption[] = [];

  for (const tier of standardTiers) {
    const candidates = rawFormats
      .filter((f: any) => f.hasVideo && tier.match(f))
      .sort((a: any, b: any) => {
        // Prioritize standard MP4 container
        const aIsMp4 = a.container === 'mp4' ? 1 : 0;
        const bIsMp4 = b.container === 'mp4' ? 1 : 0;
        if (bIsMp4 !== aIsMp4) return bIsMp4 - aIsMp4;

        // Prefer higher frame rate
        const fpsA = a.fps || 0;
        const fpsB = b.fps || 0;
        if (fpsB !== fpsA) return fpsB - fpsA;

        return (b.bitrate || 0) - (a.bitrate || 0);
      });

    if (candidates.length > 0) {
      const best = candidates[0];

      let totalBytes = 0;
      if (best.contentLength) {
        totalBytes = parseInt(best.contentLength, 10);
      } else if (best.bitrate && durationSec > 0) {
        totalBytes = (best.bitrate * durationSec) / 8;
      }

      if (!best.hasAudio && totalBytes > 0) {
        totalBytes += audioSizeBytes;
      }

      const sizeMb = totalBytes > 0
        ? Math.round((totalBytes / (1024 * 1024)) * 10) / 10
        : null;

      videoFormats.push({
        itag: best.itag,
        type: 'video',
        quality: tier.quality,
        container: best.container || 'mp4',
        mimeType: best.mimeType || 'video/mp4',
        hasAudio: true, // Losslessly remuxed with audio when downloaded
        hasVideo: true,
        fps: best.fps,
        approxSizeMb: sizeMb,
        bitrate: best.bitrate,
        isAdaptive: !best.hasAudio,
        requiresMuxing: !best.hasAudio,
      });
    }
  }

  // 2. Process Audio Formats (Audio only) sorted ascending by bitrate
  const audioFormats: VideoFormatOption[] = [];
  const seenAudioBitrates = new Set<number>();

  const candidateAudio = rawFormats
    .filter((f: any) => f.hasAudio && !f.hasVideo)
    .sort((a: any, b: any) => (a.bitrate || 0) - (b.bitrate || 0));

  for (const fmt of candidateAudio) {
    const kbps = fmt.audioBitrate || (fmt.bitrate ? Math.round(fmt.bitrate / 1000) : 128);
    if (seenAudioBitrates.has(kbps)) continue;
    seenAudioBitrates.add(kbps);

    const isMp4 = (fmt.container === 'm4a' || (fmt.mimeType || '').includes('mp4'));
    const container = isMp4 ? 'm4a' : (fmt.container || 'webm');
    const qualityLabel = `${kbps} kbps (${container.toUpperCase()})`;

    let totalBytes = 0;
    if (fmt.contentLength) {
      totalBytes = parseInt(fmt.contentLength, 10);
    } else if (fmt.bitrate && durationSec > 0) {
      totalBytes = (fmt.bitrate * durationSec) / 8;
    }

    const sizeMb = totalBytes > 0
      ? Math.round((totalBytes / (1024 * 1024)) * 10) / 10
      : null;

    audioFormats.push({
      itag: fmt.itag,
      type: 'audio',
      quality: qualityLabel,
      container,
      mimeType: isMp4 ? 'audio/mp4' : 'audio/webm',
      hasAudio: true,
      hasVideo: false,
      approxSizeMb: sizeMb,
      bitrate: fmt.bitrate,
      isAdaptive: true,
      requiresMuxing: false,
    });
  }

  // Pick best available thumbnail
  const thumbnails = basic.thumbnails || [];
  const bestThumbnail = thumbnails.length > 0
    ? thumbnails[thumbnails.length - 1].url
    : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return {
    id: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: basic.title,
    author: basic.author?.name || 'YouTube Creator',
    authorUrl: basic.author?.channel_url || undefined,
    durationSeconds: durationSec,
    durationFormatted: formatDuration(durationSec),
    viewCount: parseInt(basic.viewCount, 10) || 0,
    viewCountFormatted: formatViews(parseInt(basic.viewCount, 10) || 0),
    thumbnailUrl: bestThumbnail,
    formats: {
      video: videoFormats,
      audio: audioFormats,
    },
  };
}

export async function streamVideoDownload(
  videoId: string,
  itag?: number,
  type: 'video' | 'audio' = 'video'
) {
  const ytdl = getYtdl();
  const info = await ytdl.getInfo(videoId);
  const title = sanitizeFilename(info.videoDetails.title || `youtube_${videoId}`);
  const rawFormats = info.formats || [];

  // Determine target format
  let targetFormat = itag ? rawFormats.find((f: any) => f.itag === itag) : null;

  if (itag && !targetFormat) {
    throw new Error(`The requested format (itag ${itag}) is no longer available for this video.`);
  }

  // Default selection if no itag supplied
  if (!targetFormat) {
    if (type === 'audio') {
      targetFormat = rawFormats.find((f: any) => f.itag === 140) ||
                     rawFormats.find((f: any) => f.hasAudio && !f.hasVideo);
    } else {
      // Prefer highest available 1080p MP4, then 720p, then best progressive
      targetFormat = rawFormats.find((f: any) => f.qualityLabel?.includes('1080') && f.container === 'mp4') ||
                     rawFormats.find((f: any) => f.qualityLabel?.includes('720') && f.container === 'mp4') ||
                     rawFormats.find((f: any) => f.hasVideo && f.hasAudio) ||
                     rawFormats.find((f: any) => f.hasVideo);
    }
  }

  if (!targetFormat) {
    throw new Error('No compatible stream format found for this video.');
  }

  const isAudioOnly = targetFormat.hasAudio && !targetFormat.hasVideo;
  const isAdaptiveVideo = targetFormat.hasVideo && !targetFormat.hasAudio;

  // Case 1: High-Resolution Adaptive Video (1080p, 720p, etc. without audio track)
  // Needs real-time stream muxing with the audio track via FFmpeg (lossless -c copy)
  if (isAdaptiveVideo) {
    const isMp4 = targetFormat.container === 'mp4';

    // Find compatible audio stream (prefer itag 140 AAC for MP4, or Opus for WebM)
    const audioFormat = isMp4
      ? (rawFormats.find((f: any) => f.itag === 140) || rawFormats.find((f: any) => f.hasAudio && !f.hasVideo))
      : (rawFormats.find((f: any) => f.itag === 251) || rawFormats.find((f: any) => f.hasAudio && !f.hasVideo));

    if (!audioFormat || !audioFormat.url) {
      throw new Error('Unable to find an accompanying audio stream for high-resolution video.');
    }

    const height = targetFormat.height || 1080;
    const fps = targetFormat.fps && targetFormat.fps >= 50 ? `${targetFormat.fps}` : '';
    const container = isMp4 ? 'mp4' : 'webm';
    const filename = `${title}_${height}p${fps}.${container}`;
    const mimeType = isMp4 ? 'video/mp4' : 'video/webm';

    // Build FFmpeg spawn arguments for real-time lossless muxing
    const ffmpegArgs = [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', targetFormat.url,
      '-i', audioFormat.url,
      '-c', 'copy',
    ];

    if (isMp4) {
      ffmpegArgs.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');
    } else {
      ffmpegArgs.push('-f', 'webm', 'pipe:1');
    }

    const ffmpeg = spawn(ffmpegInstaller.path, ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    let closed = false;

    // Convert FFmpeg stdout to Web ReadableStream
    const stream = new ReadableStream({
      start(controller) {
        ffmpeg.stdout.on('data', (chunk: Buffer) => {
          if (!closed) controller.enqueue(chunk);
        });

        ffmpeg.stdout.on('end', () => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        });

        ffmpeg.stdout.on('error', (err) => {
          if (!closed) {
            closed = true;
            controller.error(err);
          }
        });

        ffmpeg.on('error', (err) => {
          if (!closed) {
            closed = true;
            controller.error(err);
          }
        });
      },
      cancel() {
        closed = true;
        try {
          ffmpeg.kill('SIGKILL');
        } catch {}
      },
    });

    return {
      stream,
      filename,
      mimeType,
    };
  }

  // Case 2: Progressive Video Stream (contains both audio and video)
  if (targetFormat.hasVideo && targetFormat.hasAudio) {
    const height = targetFormat.height || 360;
    const filename = `${title}_${height}p.mp4`;
    const mimeType = 'video/mp4';

    const nodeStream = await ytdl.download(videoId, { format: targetFormat });
    const stream = Readable.toWeb(nodeStream);

    return {
      stream,
      filename,
      mimeType,
    };
  }

  // Case 3: Audio Only Stream
  const isMp4Audio = targetFormat.container === 'm4a' || (targetFormat.mimeType || '').includes('mp4');
  const ext = isMp4Audio ? 'm4a' : 'webm';
  const kbps = targetFormat.audioBitrate || Math.round((targetFormat.bitrate || 128000) / 1000);
  const filename = `${title}_${kbps}k.${ext}`;
  const mimeType = isMp4Audio ? 'audio/mp4' : 'audio/webm';

  const nodeStream = await ytdl.download(videoId, { format: targetFormat });
  const stream = Readable.toWeb(nodeStream);

  return {
    stream,
    filename,
    mimeType,
  };
}
