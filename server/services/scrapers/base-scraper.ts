import puppeteer, { Browser, Page } from 'puppeteer';
import { execSync } from 'child_process';
import { Logger } from '../logger';
import { storage } from '../../storage';
import { pdfStorage } from '../pdf-storage';
import { County, ScraperPlatform } from '../../../shared/schema';

/**
 * Get the public base URL for serving PDFs
 * Uses Replit environment variables which differ between dev and production:
 * - Development: REPLIT_DEV_DOMAIN (long UUID-style domain)
 * - Production: REPLIT_DOMAINS (comma-separated, use first one)
 */
export async function getPublicBaseUrl(): Promise<string> {
  // First check app settings for PUBLIC_URL (manual override)
  const publicUrlSetting = await storage.getAppSetting('PUBLIC_URL');
  if (publicUrlSetting?.value) {
    return publicUrlSetting.value.replace(/\/$/, '');
  }

  // Check if deployed (production) - REPLIT_DEPLOYMENT is "1" in production
  if (process.env.REPLIT_DEPLOYMENT === '1') {
    // In production, use REPLIT_DOMAINS (first domain in the comma-separated list)
    const domains = process.env.REPLIT_DOMAINS?.split(',') || [];
    if (domains.length > 0) {
      return `https://${domains[0]}`;
    }
  }

  // In development, use REPLIT_DEV_DOMAIN
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }

  // Fallback for local development only
  return 'http://localhost:5000';
}

/**
 * Merged configuration type - platform defaults + county overrides
 */
export interface MergedScraperConfig {
  // Scraper type
  scrapeType: 'puppeteer' | 'api' | 'selenium';

  // URLs
  baseUrl: string;
  searchFormUrl?: string;
  searchResultsUrlPattern?: string;
  documentDetailUrlPattern?: string;
  pdfUrlPatterns?: string[];

  // Document types
  documentTypes?: Array<{
    code: string;
    name: string;
    description?: string;
  }>;
  defaultDocumentType?: string;

  // Date format expected by the county site
  dateFormat?: 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD/MM/YYYY';

  // Selectors
  selectors?: {
    searchFormIframe?: string;
    startDateField?: string;
    endDateField?: string;
    documentTypeDropdown?: string;
    documentTypeInput?: string;
    searchButton?: string;
    resultsIframe?: string;
    resultsTable?: string;
    recordingNumberLinks?: string;
    nextPageButton?: string;
    noResultsIndicator?: string;
    pagesColumnLink?: string;
    backToResultsButton?: string;
  };

  // Parsing patterns
  parsing?: {
    recordingNumberPattern?: string;
    amountPattern?: string;
    debtorPattern?: string;
    creditorPattern?: string;
    addressPattern?: string;
  };

  // Timing
  delays?: {
    pageLoadWait?: number;
    betweenRequests?: number;
    afterFormSubmit?: number;
    pdfLoadWait?: number;
  };

  // Rate limiting
  rateLimit?: {
    maxRequestsPerMinute?: number;
    maxPagesPerRun?: number;
  };

  // Platform-specific flags
  hasCaptcha?: boolean;
  requiresIframe?: boolean;
  requiresDisclaimer?: boolean;

  // Authentication (if needed)
  authentication?: {
    type: 'none' | 'basic' | 'session' | 'cookie';
    credentials?: Record<string, string>;
  };

  // Custom headers
  headers?: Record<string, string>;
}

/**
 * Scraped lien data structure
 */
export interface ScrapedLien {
  recordingNumber: string;
  recordingDate: Date;
  documentUrl: string;
  pdfBuffer?: Buffer;
  grantor?: string;
  grantee?: string;
  address?: string;
  amount?: number;
}

/**
 * Deep merge utility for config objects
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        target[key] !== null &&
        !Array.isArray(target[key])
      ) {
        // Recursively merge nested objects
        result[key] = deepMerge(target[key], source[key] as any);
      } else {
        // Override with source value
        result[key] = source[key] as any;
      }
    }
  }

  return result;
}

/**
 * Merge platform defaults with county overrides
 */
export function mergeConfigs(
  platformConfig: Record<string, any> | null,
  countyConfig: Record<string, any>
): MergedScraperConfig {
  if (!platformConfig) {
    return countyConfig as MergedScraperConfig;
  }
  return deepMerge(platformConfig, countyConfig) as MergedScraperConfig;
}

/**
 * Abstract base class for all county scrapers
 * Contains common functionality: browser management, PDF download, config helpers
 */
export abstract class BaseScraper {
  protected browser: Browser | null = null;
  protected county: County;
  protected platform: ScraperPlatform | null;
  protected config: MergedScraperConfig;
  public liens: ScrapedLien[] = [];

  constructor(county: County, platform: ScraperPlatform | null, config: MergedScraperConfig) {
    this.county = county;
    this.platform = platform;
    this.config = config;
  }

  /**
   * Main entry point - must be implemented by each platform scraper
   */
  abstract scrapeCountyLiens(fromDate?: string, toDate?: string, limit?: number): Promise<ScrapedLien[]>;

  /**
   * Initialize the browser with retry logic
   */
  async initialize(): Promise<void> {
    try {
      let executablePath: string | undefined;

      // Try to find Chrome/Chromium executable
      try {
        const possiblePaths = [
          'chromium',
          'chromium-browser',
          'google-chrome',
          'google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable'
        ];

        for (const path of possiblePaths) {
          try {
            const result = execSync(`which ${path}`, { encoding: 'utf8' }).trim();
            if (result) {
              executablePath = result;
              await Logger.info(`Found Chrome/Chromium at: ${executablePath}`, 'scraper');
              break;
            }
          } catch {
            // Continue to next path
          }
        }
      } catch (error) {
        await Logger.warning('Could not find Chrome/Chromium in PATH, will let Puppeteer use its bundled version', 'scraper');
      }

      // Retry logic for browser launch
      let retries = 3;
      let lastError: any;

      while (retries > 0) {
        try {
          await Logger.info(`Launching browser... (attempt ${4 - retries}/3)`, 'scraper');

          const launchOptions: any = {
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--disable-gpu',
              '--disable-blink-features=AutomationControlled',
              '--disable-features=IsolateOrigins,site-per-process',
              '--disable-site-isolation-trials',
              '--disable-web-security',
              '--window-size=1920x1080',
              '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
              '--ignore-certificate-errors',
              '--ignore-certificate-errors-spki-list'
            ],
            timeout: 600000,
            protocolTimeout: 1200000,
            ignoreHTTPSErrors: true,
            defaultViewport: {
              width: 1920,
              height: 1080
            }
          };

          if (executablePath) {
            launchOptions.executablePath = executablePath;
          }

          // For Replit/container environments
          if (process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT) {
            launchOptions.args.push('--single-process');
            launchOptions.args.push('--no-zygote');
            launchOptions.args.push('--disable-dev-tools');
            await Logger.info('Detected Replit environment, added container-specific args', 'scraper');
          }

          this.browser = await puppeteer.launch(launchOptions);
          await Logger.success('Browser launched successfully', 'scraper');
          break;
        } catch (error) {
          lastError = error;
          retries--;
          if (retries > 0) {
            await Logger.warning(`Browser launch failed: ${error}, retrying in 5 seconds... (${retries} attempts left)`, 'scraper');
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      if (!this.browser) {
        throw new Error(`Failed to launch browser after 3 attempts: ${lastError?.message || 'Unknown error'}`);
      }

      await Logger.info(`Puppeteer browser initialized for ${this.county.name}`, 'scraper');
    } catch (error) {
      await Logger.error(`Failed to initialize browser for ${this.county.name}: ${error}`, 'scraper');
      throw error;
    }
  }

  /**
   * Cleanup browser resources
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      await Logger.info(`Browser cleanup completed for ${this.county.name}`, 'scraper');
    }
  }

  /**
   * Format date according to county's expected format
   */
  protected formatDateForCounty(year: number, month: number, day: number): string {
    const mm = month.toString().padStart(2, '0');
    const dd = day.toString().padStart(2, '0');

    switch (this.config.dateFormat) {
      case 'YYYY-MM-DD':
        return `${year}-${mm}-${dd}`;
      case 'DD/MM/YYYY':
        return `${dd}/${mm}/${year}`;
      case 'MM/DD/YYYY':
      default:
        return `${mm}/${dd}/${year}`;
    }
  }

  /**
   * Parse date string (YYYY-MM-DD format from scheduler) into components
   * Avoids timezone issues by not using Date constructor
   */
  protected parseDateString(dateStr: string): { year: number; month: number; day: number } {
    const parts = dateStr.split('-');
    return {
      year: parseInt(parts[0], 10),
      month: parseInt(parts[1], 10),
      day: parseInt(parts[2], 10)
    };
  }

  /**
   * Build URL from pattern with placeholder replacements
   */
  protected buildUrl(pattern: string, replacements: Record<string, string>): string {
    let url = pattern;
    for (const [key, value] of Object.entries(replacements)) {
      url = url.replace(`{${key}}`, encodeURIComponent(value));
    }
    return url;
  }

  /**
   * Get PDF URLs for a recording number from config patterns
   */
  protected getPdfUrls(recordingNumber: string): string[] {
    if (!this.config.pdfUrlPatterns || this.config.pdfUrlPatterns.length === 0) {
      return [];
    }
    return this.config.pdfUrlPatterns.map(pattern =>
      this.buildUrl(pattern, { recordingNumber })
    );
  }

  /**
   * Download PDF with retry logic
   */
  async downloadPdfWithRetry(pdfUrl: string, recordingNumber: string, page?: Page): Promise<Buffer | null> {
    const maxRetries = 3;
    const baseDelay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await Logger.info(`PDF download attempt ${attempt}/${maxRetries} for recording ${recordingNumber}`, 'scraper');

        const result = await this.downloadPdf(pdfUrl, recordingNumber, page);

        if (result) {
          await Logger.success(`PDF downloaded successfully on attempt ${attempt} for ${recordingNumber}`, 'scraper');
          return result;
        }

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await Logger.warning(`PDF download failed for ${recordingNumber}, waiting ${delay / 1000}s before retry...`, 'scraper');
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        await Logger.error(`PDF download attempt ${attempt} failed with error: ${error}`, 'scraper');

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          await Logger.warning(`Waiting ${delay / 1000}s before retry...`, 'scraper');
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    await Logger.error(`All ${maxRetries} PDF download attempts failed for ${recordingNumber}`, 'scraper');
    return null;
  }

  /**
   * Download PDF from URL - tries multiple patterns if available
   */
  async downloadPdf(pdfUrl: string, recordingNumber: string, page?: Page): Promise<Buffer | null> {
    try {
      await Logger.info(`Attempting to download PDF for recording ${recordingNumber}`, 'scraper');

      // Get all PDF URL patterns for this recording
      const pdfUrls = this.getPdfUrls(recordingNumber);

      // If we have patterns, try them in order
      if (pdfUrls.length > 0) {
        for (const url of pdfUrls) {
          const buffer = await this.tryFetchPdf(url);
          if (buffer) {
            await Logger.success(`Downloaded PDF (${buffer.length} bytes) from: ${url}`, 'scraper');
            return buffer;
          }
        }
      }

      // Fallback: try the provided URL directly
      if (pdfUrl) {
        const buffer = await this.tryFetchPdf(pdfUrl);
        if (buffer) {
          await Logger.success(`Downloaded PDF (${buffer.length} bytes) from provided URL: ${pdfUrl}`, 'scraper');
          return buffer;
        }
      }

      // If we have a browser and the URL looks like a viewer page, try extracting
      if (this.browser && pdfUrl && pdfUrl.includes('pdfdocs')) {
        const buffer = await this.extractPdfFromViewerPage(pdfUrl);
        if (buffer) {
          return buffer;
        }
      }

      return null;
    } catch (error) {
      await Logger.error(`Failed to download PDF: ${error}`, 'scraper');
      return null;
    }
  }

  /**
   * Try to fetch PDF from a direct URL
   */
  protected async tryFetchPdf(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,*/*',
          'Referer': this.config.baseUrl || ''
        },
        redirect: 'follow'
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Verify it's actually a PDF
        if (buffer.length > 10000) {
          const header = buffer.toString('utf8', 0, 5);
          if (header.startsWith('%PDF') || header.startsWith('<<')) {
            return buffer;
          }
        }
      }
    } catch (error) {
      await Logger.info(`Fetch failed for ${url}: ${error}`, 'scraper');
    }
    return null;
  }

  /**
   * Extract PDF from a viewer page (for sites that wrap PDFs in viewers)
   */
  protected async extractPdfFromViewerPage(viewerUrl: string): Promise<Buffer | null> {
    if (!this.browser) return null;

    let newPage: Page | null = null;
    try {
      await Logger.info(`Extracting actual PDF URL from viewer page: ${viewerUrl}`, 'scraper');

      newPage = await this.browser.newPage();
      await newPage.setViewport({ width: 1920, height: 1080 });

      let capturedPdfBuffer: Buffer | null = null;
      let detectedPdfUrl: string | null = null;

      // Listen for PDF responses during navigation
      const responseListener = async (response: any) => {
        try {
          const contentType = response.headers()['content-type'] || '';
          const responseUrl = response.url();

          if (contentType.includes('application/pdf') ||
              responseUrl.toLowerCase().endsWith('.pdf') ||
              responseUrl.includes('PrintDoc.aspx') ||
              responseUrl.includes('ShowPDF.aspx')) {

            await Logger.info(`Detected PDF response from: ${responseUrl}`, 'scraper');

            if (responseUrl.endsWith('.pdf')) {
              detectedPdfUrl = responseUrl;
            }

            try {
              const buffer = await Promise.race([
                response.buffer().catch(() => null),
                new Promise<Buffer | null>(resolve => setTimeout(() => resolve(null), 100))
              ]);

              if (buffer && buffer.length > 0) {
                const header = buffer.toString('utf8', 0, 5);
                if (header.startsWith('%PDF')) {
                  capturedPdfBuffer = buffer;
                  await Logger.success(`Captured PDF from network (${buffer.length} bytes)`, 'scraper');
                }
              }
            } catch (bufferError) {
              // Try fetching URL directly if buffer fails
              if (!capturedPdfBuffer && responseUrl.endsWith('.pdf')) {
                const directBuffer = await this.tryFetchPdf(responseUrl);
                if (directBuffer) {
                  capturedPdfBuffer = directBuffer;
                }
              }
            }
          }
        } catch (responseError) {
          // Ignore response handling errors
        }
      };

      newPage.on('response', responseListener);

      try {
        await newPage.goto(viewerUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (navError: any) {
        if (!capturedPdfBuffer) {
          await Logger.info(`Navigation error: ${navError.message}`, 'scraper');
        }
      }

      if (capturedPdfBuffer) {
        return capturedPdfBuffer;
      }

      // Try fetching detected URL directly
      if (detectedPdfUrl) {
        const buffer = await this.tryFetchPdf(detectedPdfUrl);
        if (buffer) {
          return buffer;
        }
      }

      // Try DOM-based extraction
      const actualPdfUrl = await newPage.evaluate(() => {
        const viewerIframe = document.querySelector('iframe#viewer') as HTMLIFrameElement;
        if (viewerIframe && viewerIframe.src) return viewerIframe.src;

        const iframe = document.querySelector('iframe') as HTMLIFrameElement;
        if (iframe && iframe.src) return iframe.src;

        const embed = document.querySelector('embed') as HTMLEmbedElement;
        if (embed && embed.src) return embed.src;

        const object = document.querySelector('object') as HTMLObjectElement;
        if (object && object.data) return object.data;

        const pdfLinks = Array.from(document.querySelectorAll('a')).filter(a =>
          a.href && a.href.toLowerCase().includes('.pdf')
        );
        if (pdfLinks.length > 0) return pdfLinks[0].href;

        return null;
      });

      if (actualPdfUrl) {
        let fullPdfUrl = actualPdfUrl;
        if (actualPdfUrl.startsWith('/')) {
          fullPdfUrl = `${this.config.baseUrl}${actualPdfUrl}`;
        } else if (!actualPdfUrl.startsWith('http')) {
          fullPdfUrl = `${this.config.baseUrl}/${actualPdfUrl}`;
        }

        const buffer = await this.tryFetchPdf(fullPdfUrl);
        if (buffer) {
          await Logger.success(`Downloaded PDF (${buffer.length} bytes) from extracted URL`, 'scraper');
          return buffer;
        }
      }

      return null;
    } catch (error) {
      await Logger.info(`Failed to extract PDF from viewer page: ${error}`, 'scraper');
      return null;
    } finally {
      if (newPage) {
        try {
          await newPage.close();
        } catch (e) {
          // Ignore close errors
        }
      }
    }
  }

  /**
   * Store PDF locally and save lien to database
   * Returns the local PDF URL for updating the lien object
   */
  protected async saveLienWithPdf(lienData: ScrapedLien, pdfBuffer: Buffer): Promise<string> {
    // Store PDF locally
    const pdfId = pdfStorage.storePdf(pdfBuffer, lienData.recordingNumber);
    const baseUrl = await getPublicBaseUrl();
    const localPdfUrl = `${baseUrl}/api/pdf/${pdfId}`;

    await Logger.info(`Stored PDF locally: ${localPdfUrl}`, 'scraper');

    // Save to database
    try {
      await storage.createLien({
        recordingNumber: lienData.recordingNumber,
        recordDate: lienData.recordingDate,
        countyId: this.county.id,
        debtorName: lienData.grantor || 'To be extracted',
        debtorAddress: lienData.address || '',
        amount: (lienData.amount || 0).toString(),
        creditorName: lienData.grantee || 'Medical Provider',
        creditorAddress: '',
        documentUrl: localPdfUrl,
        pdfUrl: localPdfUrl,
        status: 'pending'
      });
      await Logger.info(`Saved lien ${lienData.recordingNumber} to database with local PDF URL`, 'scraper');
    } catch (saveError) {
      await Logger.error(`Failed to save lien ${lienData.recordingNumber}: ${saveError}`, 'scraper');
    }

    return localPdfUrl;
  }

  /**
   * Get delay values with defaults
   */
  protected getDelay(key: keyof NonNullable<MergedScraperConfig['delays']>): number {
    const defaults = {
      pageLoadWait: 3000,
      betweenRequests: 300,
      afterFormSubmit: 3000,
      pdfLoadWait: 2000
    };
    return this.config.delays?.[key] ?? defaults[key];
  }

  /**
   * Get selector with fallback
   */
  protected getSelector(key: keyof NonNullable<MergedScraperConfig['selectors']>): string | undefined {
    return this.config.selectors?.[key];
  }
}
