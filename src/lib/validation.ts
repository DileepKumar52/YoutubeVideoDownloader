/**
 * Extracts and validates a YouTube video ID from a user-supplied string or URL.
 * Prevents SSRF by strictly permitting only valid YouTube video ID patterns (11 alphanumeric, _, - chars).
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // If already an 11-character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsedUrl = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');

    // Allow only official YouTube hostnames
    const validHosts = ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];
    if (!validHosts.includes(hostname)) {
      return null;
    }

    // youtu.be/ID
    if (hostname === 'youtu.be') {
      const id = parsedUrl.pathname.slice(1).split('/')[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    // youtube.com/watch?v=ID
    if (parsedUrl.pathname === '/watch') {
      const v = parsedUrl.searchParams.get('v');
      return v && /^[a-zA-Z0-9_-]{11}$/.test(v) ? v : null;
    }

    // youtube.com/shorts/ID or /embed/ID or /v/ID
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'v'].includes(pathParts[0]) && pathParts[1]) {
      const id = pathParts[1];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
  } catch {
    // Malformed URL, try fallback regex
    const regex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i;
    const match = trimmed.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const formattedSecs = secs.toString().padStart(2, '0');
  if (hrs > 0) {
    const formattedMins = mins.toString().padStart(2, '0');
    return `${hrs}:${formattedMins}:${formattedSecs}`;
  }
  return `${mins}:${formattedSecs}`;
}

export function formatViews(views: number): string {
  if (!views || isNaN(views)) return '0 views';
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(views) + ' views';
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

