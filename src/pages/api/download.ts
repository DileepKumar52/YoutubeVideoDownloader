import type { APIRoute } from 'astro';
import { extractYouTubeVideoId } from '../../lib/validation';
import { streamVideoDownload } from '../../lib/youtube';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const rawInput = url.searchParams.get('url') || url.searchParams.get('id') || '';
  const itagParam = url.searchParams.get('itag');
  const typeParam = url.searchParams.get('type') === 'audio' ? 'audio' : 'video';

  if (!rawInput.trim()) {
    return new Response('Missing YouTube URL or video ID parameter', { status: 400 });
  }

  const videoId = extractYouTubeVideoId(rawInput);
  if (!videoId) {
    return new Response('Invalid YouTube URL or ID', { status: 400 });
  }

  const itag = itagParam ? parseInt(itagParam, 10) : undefined;

  try {
    const { stream, filename, mimeType } = await streamVideoDownload(videoId, itag, typeParam);

    // ASCII safe fallback filename + UTF-8 RFC 5987 filename
    const safeAsciiFilename = filename.replace(/[^\x20-\x7E]/g, '_');
    const encodedFilename = encodeURIComponent(filename);

    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    headers.set(
      'Content-Disposition',
      `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodedFilename}`
    );
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    return new Response(stream as any, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    console.error('Download stream error:', err);
    return new Response(
      `Download error: ${err?.message || 'Unable to stream requested format from YouTube'}`,
      { status: 500 }
    );
  }
};

