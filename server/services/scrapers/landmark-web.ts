import { Page } from 'puppeteer';
import { BaseScraper, ScrapedLien, MergedScraperConfig } from './base-scraper';
import { Logger } from '../logger';
import { County, ScraperPlatform } from '../../../shared/schema';

/**
 * LandmarkWeb Scraper (Skeleton)
 *
 * Handles counties using the Tyler Technologies LandmarkWeb platform.
 * Key differences from Maricopa Legacy:
 * - No iframes - direct page navigation
 * - Different form structure
 * - Different results table format
 *
 * Counties using LandmarkWeb:
 * - Jefferson County, AL (https://landmarkweb.jccal.org)
 * - Others TBD
 *
 * NOTE: This is a skeleton implementation. The actual selectors need to be
 * captured by inspecting the LandmarkWeb site for each county.
 */
export class LandmarkWebScraper extends BaseScraper {
  constructor(county: County, platform: ScraperPlatform | null, config: MergedScraperConfig) {
    super(county, platform, config);
  }

  /**
   * Main scraping method for LandmarkWeb platform
   */
  async scrapeCountyLiens(fromDate?: string, toDate?: string, limit?: number): Promise<ScrapedLien[]> {
    // Ensure browser is initialized
    if (!this.browser) {
      let initAttempts = 0;
      const maxInitAttempts = 3;

      while (!this.browser && initAttempts < maxInitAttempts) {
        initAttempts++;
        try {
          await Logger.info(`Browser initialization attempt ${initAttempts}/${maxInitAttempts}`, 'landmark-web');
          await this.initialize();
        } catch (initError) {
          await Logger.error(`Browser init attempt ${initAttempts} failed: ${initError}`, 'landmark-web');
          if (initAttempts >= maxInitAttempts) {
            await Logger.error('Could not initialize browser after 3 attempts - returning empty results', 'landmark-web');
            return [];
          }
          await new Promise(resolve => setTimeout(resolve, 5000 * initAttempts));
        }
      }
    }

    if (!this.browser) {
      await Logger.error('Browser not available - returning empty results', 'landmark-web');
      return [];
    }

    let page: Page | undefined;
    const liens: ScrapedLien[] = [];

    try {
      // Create page
      page = await this.browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      await Logger.info(`Starting lien scraping for ${this.county.name} (LandmarkWeb)`, 'landmark-web');

      // Parse dates
      let startDate: string, endDate: string;

      if (fromDate) {
        const parts = this.parseDateString(fromDate);
        startDate = this.formatDateForCounty(parts.year, parts.month, parts.day);
      } else {
        const now = new Date();
        startDate = this.formatDateForCounty(now.getFullYear(), now.getMonth() + 1, now.getDate());
      }

      if (toDate) {
        const parts = this.parseDateString(toDate);
        endDate = this.formatDateForCounty(parts.year, parts.month, parts.day);
      } else {
        endDate = startDate;
      }

      // Get search URL from config
      const searchUrl = this.config.searchFormUrl || `${this.config.baseUrl}/LandmarkWeb/search/index`;

      await Logger.info(`Navigating to search page: ${searchUrl}`, 'landmark-web');
      await Logger.info(`Search date range: ${startDate} to ${endDate}`, 'landmark-web');

      // Navigate to search page
      const navigationSuccess = await this.navigateWithRetry(page, searchUrl);
      if (!navigationSuccess) {
        await Logger.error('Navigation failed - returning empty results', 'landmark-web');
        return liens;
      }

      // Handle disclaimer if required
      if (this.config.requiresDisclaimer) {
        await this.handleDisclaimer(page);
      }

      // Fill and submit search form
      const formSubmitted = await this.fillAndSubmitSearchForm(page, startDate, endDate);
      if (!formSubmitted) {
        await Logger.error('Form submission failed - returning empty results', 'landmark-web');
        return liens;
      }

      // Collect recording numbers from results
      const allRecordingNumbers = await this.collectRecordingNumbers(page);

      await Logger.success(`Collected ${allRecordingNumbers.length} recording numbers`, 'landmark-web');

      // Process each recording
      const recordingsToProcess = limit && limit > 0
        ? allRecordingNumbers.slice(0, limit)
        : allRecordingNumbers;

      await Logger.info(`Processing ${recordingsToProcess.length} recording numbers`, 'landmark-web');

      for (let i = 0; i < recordingsToProcess.length; i++) {
        const recordingNumber = recordingsToProcess[i];

        try {
          await Logger.info(`Processing recording ${i + 1}/${recordingsToProcess.length}: ${recordingNumber}`, 'landmark-web');

          // Navigate to document detail
          const lienData = await this.processRecording(page, recordingNumber);

          if (lienData) {
            liens.push(lienData);
            await Logger.success(`Processed lien ${recordingNumber}`, 'landmark-web');
          }

          // Delay between requests
          if (i < recordingsToProcess.length - 1) {
            await new Promise(resolve => setTimeout(resolve, this.getDelay('betweenRequests')));
          }
        } catch (error) {
          await Logger.error(`Failed to process recording ${recordingNumber}: ${error}`, 'landmark-web');
        }
      }

      await Logger.success(`Found ${liens.length} liens in ${this.county.name}`, 'landmark-web');
      this.liens = liens;

    } catch (error) {
      await Logger.error(`Error in ${this.county.name}: ${error}`, 'landmark-web');
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (e) {
          // Ignore
        }
      }
    }

    return liens;
  }

  /**
   * Navigate with retry logic
   */
  private async navigateWithRetry(page: Page, url: string): Promise<boolean> {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        await Logger.info(`Navigation attempt ${attempts}/${maxAttempts}...`, 'landmark-web');

        await page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: 60000
        });

        await Logger.success('Navigation successful', 'landmark-web');
        return true;
      } catch (error: any) {
        await Logger.error(`Navigation attempt ${attempts} failed: ${error.message}`, 'landmark-web');

        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000 * attempts));
        }
      }
    }

    return false;
  }

  /**
   * Handle disclaimer/terms acceptance if required
   */
  private async handleDisclaimer(page: Page): Promise<void> {
    try {
      // Look for common disclaimer buttons
      const disclaimerSelectors = [
        'button:contains("Accept")',
        'button:contains("I Agree")',
        'input[type="submit"][value*="Accept"]',
        '#acceptDisclaimer',
        '.disclaimer-accept'
      ];

      for (const selector of disclaimerSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            await button.click();
            await Logger.info('Accepted disclaimer', 'landmark-web');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return;
          }
        } catch (e) {
          // Try next selector
        }
      }
    } catch (error) {
      await Logger.info('No disclaimer found or already accepted', 'landmark-web');
    }
  }

  /**
   * Fill and submit the search form
   * NOTE: Selectors need to be configured per county
   */
  private async fillAndSubmitSearchForm(page: Page, startDate: string, endDate: string): Promise<boolean> {
    try {
      await Logger.info('Filling search form...', 'landmark-web');

      // Wait for form to be ready
      await new Promise(resolve => setTimeout(resolve, this.getDelay('pageLoadWait')));

      // Get selectors from config
      const docTypeSelector = this.getSelector('documentTypeInput') || '#documentType-DocumentType';
      const beginDateSelector = this.getSelector('startDateField') || '#beginDate-DocumentType';
      const endDateSelector = this.getSelector('endDateField') || '#endDate-DocumentType';
      const searchButtonSelector = this.getSelector('searchButton') || '#submit-DocumentType';

      // Fill document type
      const docType = this.config.defaultDocumentType || 'PPHL';
      try {
        await page.waitForSelector(docTypeSelector, { timeout: 10000 });
        await page.type(docTypeSelector, docType);
        await Logger.info(`Entered document type: ${docType}`, 'landmark-web');
      } catch (e) {
        await Logger.warning(`Could not fill document type field: ${e}`, 'landmark-web');
      }

      // Fill begin date
      try {
        await page.waitForSelector(beginDateSelector, { timeout: 5000 });
        await page.click(beginDateSelector, { clickCount: 3 }); // Select all
        await page.type(beginDateSelector, startDate);
        await Logger.info(`Entered begin date: ${startDate}`, 'landmark-web');
      } catch (e) {
        await Logger.warning(`Could not fill begin date field: ${e}`, 'landmark-web');
      }

      // Fill end date
      try {
        await page.waitForSelector(endDateSelector, { timeout: 5000 });
        await page.click(endDateSelector, { clickCount: 3 }); // Select all
        await page.type(endDateSelector, endDate);
        await Logger.info(`Entered end date: ${endDate}`, 'landmark-web');
      } catch (e) {
        await Logger.warning(`Could not fill end date field: ${e}`, 'landmark-web');
      }

      // Click search button
      try {
        await page.waitForSelector(searchButtonSelector, { timeout: 5000 });
        await page.click(searchButtonSelector);
        await Logger.info('Clicked search button', 'landmark-web');
      } catch (e) {
        await Logger.error(`Could not click search button: ${e}`, 'landmark-web');
        return false;
      }

      // Wait for results
      await new Promise(resolve => setTimeout(resolve, this.getDelay('afterFormSubmit')));

      await Logger.success('Search form submitted', 'landmark-web');
      return true;
    } catch (error) {
      await Logger.error(`Failed to fill search form: ${error}`, 'landmark-web');
      return false;
    }
  }

  /**
   * Collect recording numbers from results page
   * NOTE: Selectors need to be configured per county
   */
  private async collectRecordingNumbers(page: Page): Promise<string[]> {
    const recordingNumbers: string[] = [];

    try {
      // Get selectors from config
      const resultsTableSelector = this.getSelector('resultsTable') || '.search-results';
      const recordingLinkSelector = this.getSelector('recordingNumberLinks') || 'a[href*="instrument"]';

      // Wait for results table
      try {
        await page.waitForSelector(resultsTableSelector, { timeout: 10000 });
      } catch (e) {
        await Logger.warning('Results table not found - may be no results', 'landmark-web');
        return recordingNumbers;
      }

      // Extract recording numbers
      const numbers = await page.evaluate((linkSelector, pattern) => {
        const links = document.querySelectorAll(linkSelector);
        const nums: string[] = [];
        const regex = new RegExp(pattern || '^\\d+$');

        links.forEach(link => {
          const text = link.textContent?.trim() || '';
          if (text && regex.test(text)) {
            nums.push(text);
          }
        });

        return nums;
      }, recordingLinkSelector, this.config.parsing?.recordingNumberPattern);

      recordingNumbers.push(...numbers);
      await Logger.info(`Found ${recordingNumbers.length} recording numbers`, 'landmark-web');

    } catch (error) {
      await Logger.error(`Failed to collect recording numbers: ${error}`, 'landmark-web');
    }

    return recordingNumbers;
  }

  /**
   * Process a single recording to extract data and PDF
   * NOTE: Implementation depends on county-specific page structure
   */
  private async processRecording(page: Page, recordingNumber: string): Promise<ScrapedLien | null> {
    try {
      // This would navigate to the document detail page and extract data
      // The exact implementation depends on the LandmarkWeb instance

      // For now, return null - this needs to be implemented with actual selectors
      await Logger.warning(`Recording ${recordingNumber} processing not yet implemented - needs site-specific selectors`, 'landmark-web');

      // TODO: Implement the following:
      // 1. Click on recording number link or navigate to detail URL
      // 2. Wait for detail page to load
      // 3. Extract grantor, grantee, amount, address
      // 4. Find and download PDF
      // 5. Return ScrapedLien object

      return null;
    } catch (error) {
      await Logger.error(`Failed to process recording ${recordingNumber}: ${error}`, 'landmark-web');
      return null;
    }
  }
}
