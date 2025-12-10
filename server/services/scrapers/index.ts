/**
 * County Scrapers Module
 *
 * This module provides a dynamic, config-driven scraping system for county recorder websites.
 *
 * Architecture:
 * - BaseScraper: Abstract base class with common functionality (browser, PDF download, etc.)
 * - Platform scrapers: Concrete implementations for specific platforms (MaricopaLegacy, LandmarkWeb)
 * - ScraperFactory: Creates the right scraper based on county.scraperPlatformId
 *
 * Usage:
 * ```typescript
 * import { createScraper } from './scrapers';
 *
 * const county = await storage.getCounty(countyId);
 * const scraper = await createScraper(county);
 * const liens = await scraper.scrapeCountyLiens(fromDate, toDate);
 * await scraper.cleanup();
 * ```
 */

// Base scraper and types
export { BaseScraper, mergeConfigs, deepMerge, getPublicBaseUrl } from './base-scraper';
export type { MergedScraperConfig, ScrapedLien } from './base-scraper';

// Platform-specific scrapers
export { MaricopaLegacyScraper } from './maricopa-legacy';
export { LandmarkWebScraper } from './landmark-web';

// Factory
export {
  createScraper,
  createScrapersForActiveCounties,
  getAvailablePlatforms,
  isPlatformSupported,
  PLATFORM_IDS,
  type PlatformId
} from './scraper-factory';
