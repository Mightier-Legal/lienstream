import { storage } from '../../storage';
import { County, ScraperPlatform } from '../../../shared/schema';
import { Logger } from '../logger';
import { BaseScraper, MergedScraperConfig, mergeConfigs } from './base-scraper';
import { MaricopaLegacyScraper } from './maricopa-legacy';
import { LandmarkWebScraper } from './landmark-web';

/**
 * Platform ID constants
 */
export const PLATFORM_IDS = {
  MARICOPA_LEGACY: 'maricopa-legacy',
  LANDMARK_WEB: 'landmark-web',
} as const;

export type PlatformId = typeof PLATFORM_IDS[keyof typeof PLATFORM_IDS];

/**
 * Create a scraper instance for a county
 *
 * This factory:
 * 1. Fetches the platform associated with the county
 * 2. Merges platform defaults with county-specific config
 * 3. Returns the appropriate scraper class based on platform ID
 *
 * @param county - The county to create a scraper for
 * @returns A scraper instance ready to use
 */
export async function createScraper(county: County): Promise<BaseScraper> {
  await Logger.info(`Creating scraper for ${county.name} (platform: ${county.scraperPlatformId || 'none'})`, 'scraper-factory');

  // Fetch the platform if the county has one assigned
  let platform: ScraperPlatform | null = null;
  if (county.scraperPlatformId) {
    platform = await storage.getScraperPlatform(county.scraperPlatformId) || null;
    if (platform) {
      await Logger.info(`Found platform: ${platform.name}`, 'scraper-factory');
    } else {
      await Logger.warning(`Platform ${county.scraperPlatformId} not found, using county config only`, 'scraper-factory');
    }
  }

  // Merge platform defaults with county config
  const platformConfig = platform?.defaultConfig as Record<string, any> | null;
  const countyConfig = county.config as Record<string, any>;
  const mergedConfig = mergeConfigs(platformConfig, countyConfig);

  await Logger.info(`Merged config: baseUrl=${mergedConfig.baseUrl}, dateFormat=${mergedConfig.dateFormat}`, 'scraper-factory');

  // Determine which scraper class to use
  const platformId = county.scraperPlatformId || detectPlatformFromConfig(mergedConfig);

  switch (platformId) {
    case PLATFORM_IDS.MARICOPA_LEGACY:
      await Logger.info('Using MaricopaLegacyScraper', 'scraper-factory');
      return new MaricopaLegacyScraper(county, platform, mergedConfig);

    case PLATFORM_IDS.LANDMARK_WEB:
      await Logger.info('Using LandmarkWebScraper', 'scraper-factory');
      return new LandmarkWebScraper(county, platform, mergedConfig);

    default:
      // Default to Maricopa Legacy for backwards compatibility
      await Logger.warning(`Unknown platform "${platformId}", defaulting to MaricopaLegacyScraper`, 'scraper-factory');
      return new MaricopaLegacyScraper(county, platform, mergedConfig);
  }
}

/**
 * Try to detect platform from config if no platformId is set
 * This is for backwards compatibility with counties that don't have a platform assigned
 */
function detectPlatformFromConfig(config: MergedScraperConfig): string {
  const baseUrl = config.baseUrl?.toLowerCase() || '';

  // Check for known platform patterns
  if (baseUrl.includes('maricopa') || baseUrl.includes('legacy.recorder')) {
    return PLATFORM_IDS.MARICOPA_LEGACY;
  }

  if (baseUrl.includes('landmarkweb') || baseUrl.includes('tylerhost')) {
    return PLATFORM_IDS.LANDMARK_WEB;
  }

  // Check for iframe requirement (Maricopa-style)
  if (config.requiresIframe || config.selectors?.searchFormIframe) {
    return PLATFORM_IDS.MARICOPA_LEGACY;
  }

  // Default
  return PLATFORM_IDS.MARICOPA_LEGACY;
}

/**
 * Get all available platform IDs
 */
export function getAvailablePlatforms(): string[] {
  return Object.values(PLATFORM_IDS);
}

/**
 * Check if a platform is supported
 */
export function isPlatformSupported(platformId: string): boolean {
  return Object.values(PLATFORM_IDS).includes(platformId as PlatformId);
}

/**
 * Create scrapers for all active counties
 * Useful for batch operations
 */
export async function createScrapersForActiveCounties(): Promise<Map<string, BaseScraper>> {
  const scrapers = new Map<string, BaseScraper>();

  const activeCounties = await storage.getActiveCounties();
  await Logger.info(`Creating scrapers for ${activeCounties.length} active counties`, 'scraper-factory');

  for (const county of activeCounties) {
    try {
      const scraper = await createScraper(county);
      scrapers.set(county.id, scraper);
    } catch (error) {
      await Logger.error(`Failed to create scraper for ${county.name}: ${error}`, 'scraper-factory');
    }
  }

  return scrapers;
}
