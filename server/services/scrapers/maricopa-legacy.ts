import { Page } from 'puppeteer';
import { BaseScraper, ScrapedLien, MergedScraperConfig } from './base-scraper';
import { Logger } from '../logger';
import { County, ScraperPlatform } from '../../../shared/schema';

/**
 * Maricopa Legacy Scraper
 *
 * Handles the Maricopa County legacy recorder system which uses:
 * - Iframe-based search form
 * - Iframe-based results display
 * - Specific URL patterns for PDFs
 *
 * All URLs and selectors are read from the merged config (platform defaults + county overrides)
 */
export class MaricopaLegacyScraper extends BaseScraper {
  constructor(county: County, platform: ScraperPlatform | null, config: MergedScraperConfig) {
    super(county, platform, config);
  }

  /**
   * Main scraping method for Maricopa Legacy system
   */
  async scrapeCountyLiens(fromDate?: string, toDate?: string, limit?: number): Promise<ScrapedLien[]> {
    // Ensure browser is initialized
    if (!this.browser) {
      let initAttempts = 0;
      const maxInitAttempts = 3;

      while (!this.browser && initAttempts < maxInitAttempts) {
        initAttempts++;
        try {
          await Logger.info(`Browser initialization attempt ${initAttempts}/${maxInitAttempts}`, 'maricopa-legacy');
          await this.initialize();
        } catch (initError) {
          await Logger.error(`Browser init attempt ${initAttempts} failed: ${initError}`, 'maricopa-legacy');
          if (initAttempts >= maxInitAttempts) {
            await Logger.error('Could not initialize browser after 3 attempts - returning empty results', 'maricopa-legacy');
            return [];
          }
          await new Promise(resolve => setTimeout(resolve, 5000 * initAttempts));
        }
      }
    }

    if (!this.browser) {
      await Logger.error('Browser not available - returning empty results', 'maricopa-legacy');
      return [];
    }

    let page: Page | undefined;
    const liens: ScrapedLien[] = [];

    try {
      // Create page with timeout protection
      page = await Promise.race([
        this.browser.newPage(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Page creation timeout after 30 seconds')), 30000)
        )
      ]);
      await page.setViewport({ width: 1920, height: 1080 });
    } catch (pageError) {
      await Logger.error(`Could not create new page: ${pageError} - returning empty results`, 'maricopa-legacy');
      return [];
    }

    try {
      await Logger.info(`Starting lien scraping for ${this.county.name}`, 'maricopa-legacy');

      // Parse dates - avoid timezone issues
      let startMonth: number, startDay: number, startYear: number;
      let endMonth: number, endDay: number, endYear: number;

      if (fromDate) {
        const parts = this.parseDateString(fromDate);
        startYear = parts.year;
        startMonth = parts.month;
        startDay = parts.day;
      } else {
        const now = new Date();
        startYear = now.getFullYear();
        startMonth = now.getMonth() + 1;
        startDay = now.getDate();
      }

      if (toDate) {
        const parts = this.parseDateString(toDate);
        endYear = parts.year;
        endMonth = parts.month;
        endDay = parts.day;
      } else {
        endYear = startYear;
        endMonth = startMonth;
        endDay = startDay;
      }

      // Get search form URL from config
      const searchFormUrl = this.config.searchFormUrl || `${this.config.baseUrl}/recdocdata/GetRecDataRec.aspx`;

      await Logger.info(`Searching for medical liens from ${startMonth}/${startDay}/${startYear} to ${endMonth}/${endDay}/${endYear}`, 'maricopa-legacy');
      await Logger.info(`Navigating to search form page: ${searchFormUrl}`, 'maricopa-legacy');

      // Navigate with retry logic
      const navigationSuccess = await this.navigateWithRetry(page, searchFormUrl);
      if (!navigationSuccess) {
        await Logger.error('Navigation failed - returning empty results', 'maricopa-legacy');
        return liens;
      }

      // Fill and submit search form
      const formattedStartDate = this.formatDateForCounty(startYear, startMonth, startDay);
      const formattedEndDate = this.formatDateForCounty(endYear, endMonth, endDay);

      const formSubmitted = await this.fillAndSubmitSearchForm(page, formattedStartDate, formattedEndDate);

      if (!formSubmitted) {
        // Try direct URL as fallback
        await Logger.info('Form submission failed, attempting direct URL...', 'maricopa-legacy');
        const directUrl = this.buildDirectResultsUrl(startMonth, startDay, startYear, endMonth, endDay, endYear);
        await page.goto(directUrl, { waitUntil: 'networkidle0', timeout: 60000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Collect recording numbers from all pages
      const allRecordingNumbers = await this.collectAllRecordingNumbers(page);

      await Logger.success(`Collected ${allRecordingNumbers.length} total recording numbers`, 'maricopa-legacy');

      // Process recording numbers
      const recordingsToProcess = limit && limit > 0
        ? allRecordingNumbers.slice(0, limit)
        : allRecordingNumbers;

      await Logger.info(`Processing ${recordingsToProcess.length} recording numbers`, 'maricopa-legacy');

      // Process each recording
      let recordPage: Page | null = null;

      for (let i = 0; i < recordingsToProcess.length; i++) {
        const recordingNumber = recordingsToProcess[i];
        await Logger.info(`Processing recording ${i + 1}/${recordingsToProcess.length}: ${recordingNumber}`, 'maricopa-legacy');

        try {
          // Ensure browser is connected
          if (!this.browser || !this.browser.isConnected()) {
            await Logger.info('Browser not connected, reinitializing...', 'maricopa-legacy');
            await this.cleanup();
            await this.initialize();
          }

          // Create or reuse page
          if (!recordPage) {
            recordPage = await this.browser!.newPage();
            await Logger.info('Created new page for processing liens', 'maricopa-legacy');
          } else {
            try {
              await recordPage.goto('about:blank', { timeout: 5000 });
            } catch (e) {
              await Logger.info('Page broken, creating new one', 'maricopa-legacy');
              try { await recordPage.close(); } catch (e) { }
              recordPage = await this.browser!.newPage();
            }
          }

          // Small delay between liens
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, this.getDelay('betweenRequests')));
          }

          // Set timeouts
          recordPage.setDefaultNavigationTimeout(30000);
          recordPage.setDefaultTimeout(30000);

          // Navigate to document detail page
          const docUrl = this.buildDocumentDetailUrl(recordingNumber);
          await recordPage.goto(docUrl, { waitUntil: 'networkidle2', timeout: 30000 });

          await Logger.info(`Visiting document URL: ${docUrl}`, 'maricopa-legacy');

          // Extract lien information
          const lienData = await this.extractLienData(recordPage);

          // Find PDF link
          const pdfPageLink = await this.findPdfLink(recordPage);

          let actualPdfUrl: string = '';
          if (pdfPageLink) {
            await Logger.info(`Found Pages column link: ${pdfPageLink}`, 'maricopa-legacy');
            actualPdfUrl = pdfPageLink;
          } else {
            // Fallback to direct URL pattern
            const pdfUrls = this.getPdfUrls(recordingNumber);
            actualPdfUrl = pdfUrls[0] || `${this.config.baseUrl}/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
            await Logger.info(`Using fallback PDF URL: ${actualPdfUrl}`, 'maricopa-legacy');
          }

          // Download PDF
          const pdfBuffer = await this.downloadPdfWithRetry(actualPdfUrl, recordingNumber, recordPage);

          if (pdfBuffer) {
            const lienInfo: ScrapedLien = {
              recordingNumber,
              recordingDate: lienData.recordingDate ? new Date(lienData.recordingDate) : new Date(),
              documentUrl: actualPdfUrl,
              pdfBuffer: pdfBuffer,
              grantor: lienData.grantor,
              grantee: lienData.grantee,
              address: lienData.address,
              amount: lienData.amount
            };

            liens.push(lienInfo);

            // Save immediately to prevent data loss
            await this.saveLienWithPdf(lienInfo, pdfBuffer);

            await Logger.success(`Downloaded and stored PDF for lien ${recordingNumber} (${pdfBuffer.length} bytes)`, 'maricopa-legacy');
          } else {
            await Logger.info(`Skipping ${recordingNumber} - PDF download failed`, 'maricopa-legacy');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (errorMessage.includes('TimeoutError') || errorMessage.includes('Navigation timeout')) {
            await Logger.warning(`Timeout processing ${recordingNumber} - continuing with next lien`, 'maricopa-legacy');
          } else if (errorMessage.includes('detached') || errorMessage.includes('Frame')) {
            await Logger.warning(`Frame issue with ${recordingNumber} - continuing with next lien`, 'maricopa-legacy');
          } else {
            await Logger.error(`Failed to process recording ${recordingNumber}: ${errorMessage}`, 'maricopa-legacy');
          }
        }
      }

      // Cleanup reusable page
      if (recordPage) {
        try {
          await recordPage.close();
        } catch (e) {
          // Ignore close errors
        }
      }

      await Logger.success(`Found ${liens.length} liens with valid PDFs in ${this.county.name}`, 'maricopa-legacy');
      this.liens = liens;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('Protocol') || errorMessage.includes('protocolTimeout')) {
        await Logger.error(`Protocol timeout in ${this.county.name} - returning ${liens.length} partial results.`, 'maricopa-legacy');
      } else {
        await Logger.error(`Error in ${this.county.name}: ${errorMessage}. Returning ${liens.length} partial results.`, 'maricopa-legacy');
      }

      return liens;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          // Ignore page close errors
        }
      }
    }

    return liens;
  }

  /**
   * Navigate with retry logic
   */
  private async navigateWithRetry(page: Page, url: string): Promise<boolean> {
    let navigationAttempts = 0;
    const maxNavigationAttempts = 3;

    while (navigationAttempts < maxNavigationAttempts) {
      navigationAttempts++;
      try {
        await Logger.info(`Navigation attempt ${navigationAttempts}/${maxNavigationAttempts}...`, 'maricopa-legacy');

        page.setDefaultNavigationTimeout(300000);
        page.setDefaultTimeout(300000);

        await page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: 300000
        });

        await Logger.success('Successfully navigated to search page', 'maricopa-legacy');
        return true;
      } catch (navError: any) {
        await Logger.error(`Navigation attempt ${navigationAttempts} failed: ${navError.message}`, 'maricopa-legacy');

        if (navigationAttempts < maxNavigationAttempts) {
          const waitTime = 10000 * navigationAttempts;
          await Logger.info(`Waiting ${waitTime / 1000} seconds before retry...`, 'maricopa-legacy');
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    return false;
  }

  /**
   * Fill and submit the search form
   * Note: Maricopa updated their site - the form is now directly on the page (no iframe)
   */
  private async fillAndSubmitSearchForm(page: Page, startDate: string, endDate: string): Promise<boolean> {
    try {
      await Logger.info('Looking for search form...', 'maricopa-legacy');

      // Wait for page to fully load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Get selectors from config (with new defaults for the updated Maricopa site)
      const startDateSelector = this.getSelector('startDateField') || '#ctl00_ContentPlaceHolder1_datepicker_dateInput';
      const endDateSelector = this.getSelector('endDateField') || '#ctl00_ContentPlaceHolder1_datepickerEnd_dateInput';
      const docTypeSelector = this.getSelector('documentTypeDropdown') || '#ctl00_ContentPlaceHolder1_ddlDocCodes';
      const docTypeValue = this.config.defaultDocumentType || 'HL';
      const submitSelector = this.getSelector('searchButton') || '#ctl00_ContentPlaceHolder1_btnSearchPanel1';

      // Check if form is directly on page (new style) or in iframe (old style)
      const frames = page.frames();
      await Logger.info(`Found ${frames.length} frames on page`, 'maricopa-legacy');

      // Try to find the form on the main page first
      let formFound = false;
      try {
        await page.waitForSelector(docTypeSelector, { timeout: 5000 });
        formFound = true;
        await Logger.info('Search form found directly on page (no iframe)', 'maricopa-legacy');
      } catch (e) {
        await Logger.info('Form not found on main page, checking for iframe...', 'maricopa-legacy');
      }

      // If form not on main page, try iframe (legacy support)
      if (!formFound) {
        const iframeSelector = this.getSelector('searchFormIframe') || 'GetRecDataRecInt';
        const searchFrame = frames.find(f =>
          f.url()?.includes(iframeSelector) ||
          f.url()?.includes('search')
        );

        if (!searchFrame) {
          await Logger.error('Search form not found on page or in iframe', 'maricopa-legacy');
          return false;
        }

        await Logger.info(`Found search form in iframe: ${searchFrame.url()}`, 'maricopa-legacy');
        // Would need to use searchFrame instead of page - for now, return false to use fallback
        return false;
      }

      // Fill the form directly on the page
      await Logger.info(`Filling form: docType=${docTypeValue}, dates=${startDate} to ${endDate}`, 'maricopa-legacy');

      // Select document type first
      try {
        await page.select(docTypeSelector, docTypeValue);
        await Logger.info(`Selected document type: ${docTypeValue}`, 'maricopa-legacy');
      } catch (e) {
        await Logger.warning(`Could not select document type: ${e}`, 'maricopa-legacy');
      }

      // Small delay after selecting doc type (ASP.NET may do postback)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Fill start date - clear first then type
      try {
        await page.click(startDateSelector, { clickCount: 3 }); // Select all
        await page.type(startDateSelector, startDate);
        await Logger.info(`Entered start date: ${startDate}`, 'maricopa-legacy');
      } catch (e) {
        await Logger.warning(`Could not fill start date: ${e}`, 'maricopa-legacy');
      }

      // Fill end date - clear first then type
      try {
        await page.click(endDateSelector, { clickCount: 3 }); // Select all
        await page.type(endDateSelector, endDate);
        await Logger.info(`Entered end date: ${endDate}`, 'maricopa-legacy');
      } catch (e) {
        await Logger.warning(`Could not fill end date: ${e}`, 'maricopa-legacy');
      }

      await Logger.info(`Form filled with dates and ${docTypeValue} document type`, 'maricopa-legacy');

      // Submit the form
      await Logger.info('Submitting search form...', 'maricopa-legacy');

      // Click the search button and wait for navigation
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
        page.click(submitSelector)
      ]);

      await Logger.success('Search form submitted successfully', 'maricopa-legacy');

      // Wait for results to load
      await new Promise(resolve => setTimeout(resolve, this.getDelay('afterFormSubmit')));

      return true;
    } catch (formError: any) {
      await Logger.error(`Failed to fill or submit search form: ${formError.message}`, 'maricopa-legacy');
      return false;
    }
  }

  /**
   * Build direct results URL (fallback if form submission fails)
   */
  private buildDirectResultsUrl(
    startMonth: number, startDay: number, startYear: number,
    endMonth: number, endDay: number, endYear: number
  ): string {
    const docType = this.config.defaultDocumentType || 'HL';

    if (this.config.searchResultsUrlPattern) {
      return this.buildUrl(this.config.searchResultsUrlPattern, {
        startDate: `${startMonth}/${startDay}/${startYear}`,
        endDate: `${endMonth}/${endDay}/${endYear}`,
        docType
      });
    }

    // Default pattern for Maricopa
    return `${this.config.baseUrl}/recdocdata/GetRecDataRecentPgDn.aspx?rec=0&suf=&nm=&bdt=${startMonth}%2F${startDay}%2F${startYear}&edt=${endMonth}%2F${endDay}%2F${endYear}&cde=${docType}&max=500&res=True&doc1=${docType}&doc2=&doc3=&doc4=&doc5=`;
  }

  /**
   * Build document detail URL for a recording number
   */
  private buildDocumentDetailUrl(recordingNumber: string): string {
    if (this.config.documentDetailUrlPattern) {
      return this.buildUrl(this.config.documentDetailUrlPattern, { recordingNumber });
    }
    return `${this.config.baseUrl}/recdocdata/GetRecDataDetail.aspx?rec=${recordingNumber}&suf=&nm=`;
  }

  /**
   * Collect all recording numbers from results pages
   */
  private async collectAllRecordingNumbers(page: Page): Promise<string[]> {
    const allRecordingNumbers: string[] = [];
    let pageNum = 1;
    let hasNextPage = true;
    const maxPages = this.config.rateLimit?.maxPagesPerRun || 10;

    while (hasNextPage && pageNum <= maxPages) {
      await Logger.info(`Processing page ${pageNum} of results (max ${maxPages} pages)`, 'maricopa-legacy');

      // Take screenshot for debugging
      await page.screenshot({ path: `results-page-${pageNum}.png` });

      // Check for results in iframe
      const frames = page.frames();
      const resultsIframeSelector = this.getSelector('resultsIframe') || 'GetRecDataRecentPgDn';
      const resultsFrame = frames.find(f =>
        f.url()?.includes(resultsIframeSelector) ||
        f.url()?.includes('results')
      );

      const targetPage = resultsFrame || page;

      // Extract recording numbers
      const pageRecordingNumbers = await targetPage.evaluate((recordingPattern) => {
        const numbers: string[] = [];
        const pattern = new RegExp(recordingPattern || '^\\d{10,12}$');

        // Look in tables
        document.querySelectorAll('table').forEach(table => {
          const rows = table.querySelectorAll('tr');
          rows.forEach(row => {
            const firstCell = row.querySelector('td:first-child');
            if (firstCell) {
              const link = firstCell.querySelector('a');
              const text = link?.textContent?.trim() || firstCell.textContent?.trim() || '';
              if (text && pattern.test(text)) {
                numbers.push(text);
              }
            }
          });
        });

        // Also look for any links with recording numbers
        document.querySelectorAll('a').forEach(link => {
          const text = link.textContent?.trim() || '';
          if (text && pattern.test(text) && !numbers.includes(text)) {
            numbers.push(text);
          }
        });

        return numbers;
      }, this.config.parsing?.recordingNumberPattern || '^\\d{10,12}$');

      await Logger.info(`Found ${pageRecordingNumbers.length} recording numbers on page ${pageNum}`, 'maricopa-legacy');
      allRecordingNumbers.push(...pageRecordingNumbers);

      // Check for next page
      hasNextPage = await targetPage.evaluate(() => {
        const nextLinks = Array.from(document.querySelectorAll('a, input[type="button"], button'));

        for (const link of nextLinks) {
          const text = (link.textContent || (link as HTMLInputElement).value || '').toLowerCase();
          if (text.includes('next') && !text.includes('previous')) {
            if ((link as HTMLInputElement).disabled || link.getAttribute('disabled')) {
              return false;
            }
            (link as HTMLElement).click();
            return true;
          }
        }

        return false;
      });

      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        pageNum++;
      }
    }

    return allRecordingNumbers;
  }

  /**
   * Extract lien data from the document detail page
   */
  private async extractLienData(page: Page): Promise<{
    recordingDate: string;
    grantor: string;
    grantee: string;
    address: string;
    amount: number;
  }> {
    return await page.evaluate((parsingConfig) => {
      const pageText = document.body?.innerText || '';

      // Extract recording date
      const dateMatch = pageText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      const recordingDate = dateMatch ? dateMatch[1] : '';

      // Extract names
      let grantorName = '';
      let granteeName = '';

      // Try Name(s) section pattern
      const namesSectionMatch = pageText.match(/Name\(s\)[\s\S]*?Document Code/i);
      if (namesSectionMatch) {
        const namesSection = namesSectionMatch[0];
        const lines = namesSection.split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.match(/^Name\(s\)/i) && !l.match(/^Document Code/i));

        if (lines.length >= 1) grantorName = lines[0];
        if (lines.length >= 2) granteeName = lines[1];
      }

      // Fallback patterns
      if (!grantorName) {
        const grantorMatch = pageText.match(/Grantor[\s:]+([^\n]+)/i);
        if (grantorMatch) grantorName = grantorMatch[1].trim();
      }
      if (!granteeName) {
        const granteeMatch = pageText.match(/Grantee[\s:]+([^\n]+)/i);
        if (granteeMatch) granteeName = granteeMatch[1].trim();
      }

      // Extract address
      let address = '';
      if (grantorName) {
        const nameIndex = pageText.indexOf(grantorName);
        if (nameIndex !== -1) {
          const textAfterName = pageText.substring(nameIndex + grantorName.length, nameIndex + grantorName.length + 200);
          const addressPattern = parsingConfig?.addressPattern ||
            '(\\d+\\s+[A-Za-z0-9\\s]+(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|LN|LANE|CT|COURT|WAY|BLVD|BOULEVARD|PL|PLACE)[\\s,]*[A-Za-z\\s]+,?\\s+AZ\\s+\\d{5})';
          const addressMatch = textAfterName.match(new RegExp(addressPattern, 'i'));
          if (addressMatch) address = addressMatch[1].trim();
        }
      }

      // Extract amount
      const amountPattern = parsingConfig?.amountPattern || '\\$([\\d,]+(?:\\.\\d{2})?)';
      const amountMatch = pageText.match(new RegExp(amountPattern, 'i'));
      const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

      return {
        recordingDate,
        grantor: grantorName,
        grantee: granteeName,
        address,
        amount
      };
    }, this.config.parsing);
  }

  /**
   * Find PDF link in the Pages column of the table
   */
  private async findPdfLink(page: Page): Promise<string | null> {
    try {
      await page.waitForSelector('table', { timeout: 5000 }).catch(() => { });

      return await page.evaluate((baseUrl) => {
        const tables = document.querySelectorAll('table');

        for (const table of Array.from(tables)) {
          const rows = table.querySelectorAll('tr');

          for (const row of Array.from(rows)) {
            const cells = row.querySelectorAll('td, th');

            for (let i = 0; i < cells.length; i++) {
              const cellText = cells[i]?.textContent?.trim() || '';

              if (cellText.toLowerCase().includes('pages') || cellText.toLowerCase() === 'pages') {
                const targetCell = cellText.toLowerCase() === 'pages' && cells[i + 1] ? cells[i + 1] : cells[i];
                const link = targetCell?.querySelector('a');

                if (link) {
                  const href = link.getAttribute('href');
                  const linkText = link.textContent?.trim() || '';

                  if (href && linkText.match(/^\d+$/)) {
                    if (href.startsWith('/')) return `${baseUrl}${href}`;
                    if (href.startsWith('http')) return href;
                    return `${baseUrl}/recdocdata/${href}`;
                  }
                }
              }
            }
          }

          // Look for any numeric link (likely pages link)
          const allLinks = table.querySelectorAll('a');
          for (const link of Array.from(allLinks)) {
            const href = link.getAttribute('href');
            const text = link.textContent?.trim() || '';

            if (href && text.match(/^\d+$/) && !href.includes('javascript:')) {
              if (href.startsWith('/')) return `${baseUrl}${href}`;
              if (href.startsWith('http')) return href;
              return `${baseUrl}/recdocdata/${href}`;
            }
          }
        }

        return null;
      }, this.config.baseUrl);
    } catch (evalError) {
      if (evalError instanceof Error && evalError.message.includes('detached')) {
        await Logger.info('Frame detached, using fallback PDF URL', 'maricopa-legacy');
      }
      return null;
    }
  }
}
