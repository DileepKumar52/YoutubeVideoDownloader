import type { APIRoute } from 'astro';
import { extractYouTubeVideoId } from '../../lib/validation';
import { fetchVideoDetails } from '../../lib/youtube';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const rawInput = url.searchParams.get('url') || url.searchParams.get('id') || '';

  if (!rawInput.trim()) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Please enter a valid YouTube video URL or ID.',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const videoId = extractYouTubeVideoId(rawInput);
  if (!videoId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Invalid YouTube URL. Please provide a standard watch link, shorts link, or youtu.be URL.',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const videoDetails = await fetchVideoDetails(videoId);
    return new Response(
      JSON.stringify({
        success: true,
        data: videoDetails,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300', // cache 5 mins
        },
      }
    );
  } catch (err: any) {
    console.error('Error fetching video details:', err);
    const message = err?.message?.includes('private')
      ? 'This video is private, restricted, or unavailable.'
      : 'Failed to process YouTube video. Please verify the URL and try again.';

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

