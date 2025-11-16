/**
 * i18n utility for Electron main process
 * Provides translation functionality without react-i18next dependency
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';

// ES module equivalent of __dirname (required for ES modules / .mjs files)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache for loaded translations
const translationsCache: Record<string, any> = {};

/**
 * Load translation file for a given language
 */
function loadTranslations(language: string): any {
  // Return cached if already loaded
  if (translationsCache[language]) {
    return translationsCache[language];
  }

  try {
    // Determine the path to the locales directory
    // In development: electron-app/src/locales
    // In production: resources/app.asar/dist-electron/locales or similar
    const isDevelopment = process.env.NODE_ENV !== 'production';

    let localesPath: string;
    if (isDevelopment) {
      // Development: src/locales relative to main process file
      localesPath = join(__dirname, '../../src/locales');
    } else {
      // Production: locales should be in app resources
      localesPath = join(app.getAppPath(), 'dist-electron/locales');
    }

    const filePath = join(localesPath, language, 'reports.json');
    const fileContent = readFileSync(filePath, 'utf-8');
    const translations = JSON.parse(fileContent);

    // Cache the loaded translations
    translationsCache[language] = translations;

    return translations;
  } catch (error) {
    console.error(`Failed to load translations for language "${language}":`, error);

    // Fallback to English if requested language fails
    if (language !== 'en') {
      return loadTranslations('en');
    }

    // If even English fails, return empty object
    return {};
  }
}

/**
 * Get nested value from object using dot notation
 * Example: get(obj, 'metadata.totalCost') returns obj.metadata.totalCost
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Replace placeholders in template string with values
 * Example: interpolate("Hello {{name}}", { name: "World" }) returns "Hello World"
 */
function interpolate(template: string, params: Record<string, any> = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

/**
 * Translate function (similar to i18next's t() function)
 * @param key - Translation key in dot notation (e.g., 'metadata.totalCost')
 * @param language - Language code ('en' or 'ja')
 * @param params - Optional parameters for interpolation
 * @returns Translated string
 */
export function t(
  key: string,
  language: string = 'en',
  params?: Record<string, any>
): string {
  // Load translations for the language
  const translations = loadTranslations(language);

  // Get the translation using dot notation
  let translation = getNestedValue(translations, key);

  // If translation not found, return the key itself (debugging aid)
  if (translation === undefined) {
    console.warn(`Translation key "${key}" not found for language "${language}"`);
    return key;
  }

  // Handle plural forms (basic implementation)
  // If params.count exists and there's a plural key, use it
  if (params?.count !== undefined && typeof translation === 'string') {
    const pluralKey = `${key}_plural`;
    const pluralTranslation = getNestedValue(translations, pluralKey);

    if (pluralTranslation && params.count !== 1) {
      translation = pluralTranslation;
    }
  }

  // Interpolate parameters if provided
  if (params && typeof translation === 'string') {
    translation = interpolate(translation, params);
  }

  return translation;
}

/**
 * Clear the translations cache (useful for testing or language switching)
 */
export function clearTranslationsCache(): void {
  Object.keys(translationsCache).forEach(key => {
    delete translationsCache[key];
  });
}
