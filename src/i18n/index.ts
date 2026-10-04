export { I18nProvider } from './I18nProvider.tsx';
export { translate, useI18n, useLocale, useT } from './context.ts';
export type { I18n } from './context.ts';
export {
  CATALOGUES,
  CORE_CATALOGUES,
  LAYERS,
  SUPPORTED_LOCALES,
  languageName,
} from './catalogues.ts';
export type { MessageKey } from './catalogues.ts';
export { AUTO_LANGUAGE, normaliseLocale, resolveLocale } from './resolve.ts';
export { BASE_LOCALE, createTranslator, interpolate } from './translate.ts';
export type { Catalogue, Message, MessageArgs, Translate } from './translate.ts';
export { rich } from './rich.tsx';
