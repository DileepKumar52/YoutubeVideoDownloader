import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async () => {
  const baseUrl = 'https://youtubevideodownloader.app';
  const currentDate = new Date().toISOString().split('T')[0];

  const routes = [
    { path: '', changefreq: 'daily', priority: '1.0' },
    { path: '/about', changefreq: 'monthly', priority: '0.8' },
    { path: '/faq', changefreq: 'weekly', priority: '0.8' },
    { path: '/contact', changefreq: 'monthly', priority: '0.7' },
    { path: '/privacy', changefreq: 'yearly', priority: '0.5' },
    { path: '/terms', changefreq: 'yearly', priority: '0.5' },
    { path: '/disclaimer', changefreq: 'yearly', priority: '0.5' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>${baseUrl}${route.path}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};

