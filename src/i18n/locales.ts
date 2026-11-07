export const SUPPORTED_LOCALES = ['en', 'es', 'ja', 'fr', 'de', 'pt', 'ko', 'it'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

export interface LocaleMeta {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  ogLocale: string;
}

export const LOCALES: Record<SupportedLocale, LocaleMeta> = {
  en: { code: 'en', name: 'English', nativeName: 'English', ogLocale: 'en_US' },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español', ogLocale: 'es_ES' },
  ja: { code: 'ja', name: 'Japanese', nativeName: '日本語', ogLocale: 'ja_JP' },
  fr: { code: 'fr', name: 'French', nativeName: 'Français', ogLocale: 'fr_FR' },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch', ogLocale: 'de_DE' },
  pt: { code: 'pt', name: 'Portuguese', nativeName: 'Português', ogLocale: 'pt_BR' },
  ko: { code: 'ko', name: 'Korean', nativeName: '한국어', ogLocale: 'ko_KR' },
  it: { code: 'it', name: 'Italian', nativeName: 'Italiano', ogLocale: 'it_IT' },
};

/**
 * Normalizes a pathname by stripping any existing supported locale prefix.
 * e.g. '/es/about' -> '/about', '/ja' -> '/', '/about' -> '/about'
 */
export function getCleanPath(pathname: string): string {
  const normalized = pathname.replace(/\/$/, '') || '/';
  if (normalized === '/') return '/';

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length > 0 && SUPPORTED_LOCALES.includes(segments[0] as SupportedLocale)) {
    segments.shift();
  }

  const clean = '/' + segments.join('/');
  return clean === '/' ? '/' : clean.replace(/\/$/, '');
}

/**
 * Generates the localized path for a given clean path and target locale.
 * e.g. cleanPath '/about', target 'es' -> '/es/about'
 *      cleanPath '/', target 'en' -> '/'
 *      cleanPath '/', target 'es' -> '/es/'
 */
export function getLocalizedPath(cleanPath: string, targetLocale: SupportedLocale): string {
  const norm = cleanPath === '' ? '/' : cleanPath;
  if (targetLocale === DEFAULT_LOCALE) {
    return norm;
  }
  if (norm === '/') {
    return `/${targetLocale}/`;
  }
  return `/${targetLocale}${norm.startsWith('/') ? norm : '/' + norm}`;
}

/**
 * Takes the current pathname (with or without locale prefix) and computes
 * the equivalent destination URL for a newly selected language.
 */
export function getEquivalentPath(currentPathname: string, targetLocale: SupportedLocale): string {
  const cleanPath = getCleanPath(currentPathname);
  return getLocalizedPath(cleanPath, targetLocale);
}

export interface HreflangLink {
  rel: 'alternate';
  hreflang: string;
  href: string;
}

/**
 * Builds reciprocal hreflang links for all 8 supported languages + x-default.
 */
export function getHreflangTags(currentPathname: string, siteUrl = 'https://youtubevideodownloader.app'): HreflangLink[] {
  const cleanPath = getCleanPath(currentPathname);
  const links: HreflangLink[] = [];

  for (const locale of SUPPORTED_LOCALES) {
    const locPath = getLocalizedPath(cleanPath, locale);
    links.push({
      rel: 'alternate',
      hreflang: locale,
      href: `${siteUrl}${locPath}`,
    });
  }

  // x-default points to default English version
  const defaultPath = getLocalizedPath(cleanPath, DEFAULT_LOCALE);
  links.push({
    rel: 'alternate',
    hreflang: 'x-default',
    href: `${siteUrl}${defaultPath}`,
  });

  return links;
}

