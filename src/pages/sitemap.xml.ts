import type { APIRoute } from 'astro';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, getLocalizedPath } from '../i18n/locales';

export const prerender = false;

export const GET: APIRoute = async () => {
  const baseUrl = 'https://youtubevideodownloader.app';
  const currentDate = new Date().toISOString().split('T')[0];

  const baseRoutes = [
    { cleanPath: '/', changefreq: 'daily', priority: '1.0' },
    { cleanPath: '/about', changefreq: 'monthly', priority: '0.8' },
    { cleanPath: '/faq', changefreq: 'weekly', priority: '0.8' },
    { cleanPath: '/contact', changefreq: 'monthly', priority: '0.7' },
    { cleanPath: '/privacy', changefreq: 'yearly', priority: '0.5' },
    { cleanPath: '/terms', changefreq: 'yearly', priority: '0.5' },
    { cleanPath: '/disclaimer', changefreq: 'yearly', priority: '0.5' },
  ];

  const urlEntries: string[] = [];

  for (const route of baseRoutes) {
    for (const locale of SUPPORTED_LOCALES) {
      const locPath = getLocalizedPath(route.cleanPath, locale);
      const fullUrl = `${baseUrl}${locPath}`;

      const alternates = SUPPORTED_LOCALES.map((altLoc) => {
        const altPath = getLocalizedPath(route.cleanPath, altLoc);
        return `    <xhtml:link rel="alternate" hreflang="${altLoc}" href="${baseUrl}${altPath}"/>`;
      });

      // x-default points to default English route
      const defaultPath = getLocalizedPath(route.cleanPath, DEFAULT_LOCALE);
      alternates.push(
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${baseUrl}${defaultPath}"/>`
      );

      urlEntries.push(`  <url>
    <loc>${fullUrl}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${locale === DEFAULT_LOCALE ? route.priority : (parseFloat(route.priority) * 0.9).toFixed(1)}</priority>
${alternates.join('\n')}
  </url>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlEntries.join('\n')}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};
