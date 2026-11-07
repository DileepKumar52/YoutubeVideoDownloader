import type { SupportedLocale } from '../locales';
import type { SiteTranslations } from '../types';
import { en } from './en';
import { es } from './es';
import { ja } from './ja';
import { fr } from './fr';
import { de } from './de';
import { pt } from './pt';
import { ko } from './ko';
import { it } from './it';

export const translations: Record<SupportedLocale, SiteTranslations> = {
  en,
  es,
  ja,
  fr,
  de,
  pt,
  ko,
  it,
};

export function getTranslations(locale?: string | null): SiteTranslations {
  if (locale && locale in translations) {
    return translations[locale as SupportedLocale];
  }
  return translations.en;
}

export { en, es, ja, fr, de, pt, ko, it };

