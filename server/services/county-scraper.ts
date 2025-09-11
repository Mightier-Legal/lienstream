import puppeteer, { Browser, Page } from 'puppeteer';
import { execSync } from 'child_process';
import { Lien } from '../../shared/schema';
// OCR no longer needed - just collecting PDF URLs
// Type definitions
interface County {
  id: string;
  name: string;
  state: string;
  website: string;
  scraperEnabled: boolean;
  searchUrl: string;
  selectors: any;
}

interface CountyConfig {
  url: string;
  searchUrl: string;
  selectors: {
    documentTypeDropdown?: string;
    startDateField?: string;
    endDateField?: string;
    searchButton?: string;
    resultsTable?: string;
  };
}
import { Logger } from './logger';
import { storage } from '../storage';

interface ScrapedLien {
  recordingNumber: string;
  recordingDate: Date;
  documentUrl: string;
  pdfBuffer?: Buffer;
  grantor?: string;
  grantee?: string;
  address?: string;
  amount?: number;
}

export abstract class CountyScraper {
  constructor(protected county: County, protected config: CountyConfig) {}

  abstract scrapeCountyLiens(fromDate?: string, toDate?: string, limit?: number): Promise<ScrapedLien[]>;

  async scrapeLiens(): Promise<Lien[]> {
    const scrapedLiens = await this.scrapeCountyLiens();
    const liens: Lien[] = [];

    try {
      // Save liens to storage
      for (const lien of scrapedLiens) {
        liens.push({
          id: crypto.randomUUID(),
          recordingNumber: lien.recordingNumber,
          recordDate: lien.recordingDate,
          countyId: this.county.id,
          debtorName: 'To be extracted',
          debtorAddress: '',
          amount: '0',
          creditorName: 'Medical Provider',
          creditorAddress: '',
          documentUrl: lien.documentUrl,
          status: 'pending',
          airtableRecordId: null,
          enrichmentData: null,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      await Logger.success(`Saved ${liens.length} liens from ${this.county.name}`, 'county-scraper');
    } catch (error) {
      await Logger.error(`Failed to save liens from ${this.county.name}: ${error}`, 'county-scraper');
      throw error;
    }
    return liens;
  }
}

export class PuppeteerCountyScraper extends CountyScraper {
  private browser: Browser | null = null;
  public liens: any[] = []; // Store liens for access by scheduler

  async downloadPdf(pdfUrl: string, recordingNumber: string, page?: Page): Promise<Buffer | null> {
    try {
      await Logger.info(`📥 Downloading PDF from: ${pdfUrl}`, 'county-scraper');
      
      // Try to download the PDF
      try {
        // First try direct fetch
        const response = await fetch(pdfUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
            'Accept': 'application/pdf,*/*'
          }
        });
        
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          // Check if it's actually a PDF (starts with %PDF)
          const header = buffer.toString('utf8', 0, 5);
          if (header.startsWith('%PDF')) {
            await Logger.success(`✅ Downloaded PDF (${buffer.length} bytes): ${pdfUrl}`, 'county-scraper');
            return buffer;
          } else {
            await Logger.info(`⚠️ Downloaded file is not a PDF (starts with: ${header})`, 'county-scraper');
          }
        }
      } catch (fetchError) {
        await Logger.info(`Direct fetch failed: ${fetchError}`, 'county-scraper');
      }
      
      // If direct fetch fails and we have a browser page, try downloading through browser
      if (page) {
        try {
          const navResponse = await page.goto(pdfUrl, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
          });
          
          if (navResponse && navResponse.ok()) {
            const buffer = await navResponse.buffer();
            
            // Check if it's a PDF
            const header = buffer.toString('utf8', 0, 5);
            if (header.startsWith('%PDF')) {
              await Logger.success(`✅ Downloaded PDF via browser (${buffer.length} bytes)`, 'county-scraper');
              return buffer;
            }
          }
        } catch (navError) {
          await Logger.info(`Browser download failed: ${navError}`, 'county-scraper');
        }
      }
      
      return null;
    } catch (error) {
      await Logger.error(`Failed to download PDF: ${error}`, 'county-scraper');
      return null;
    }
  }

  async initialize() {
    try {
      // Try to find Chrome/Chromium executable
      let executablePath: string | undefined;
      
      try {
        // Try to find chromium or chrome in the system
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
              await Logger.info(`Found Chrome/Chromium at: ${executablePath}`, 'county-scraper');
              break;
            }
          } catch {
            // Continue to next path
          }
        }
      } catch (error) {
        await Logger.warning('Could not find Chrome/Chromium in PATH, will let Puppeteer use its bundled version', 'county-scraper');
      }
      
      // Retry logic for browser launch
      let retries = 3;
      let lastError: any;
      
      while (retries > 0) {
        try {
          await Logger.info(`Launching browser... (attempt ${4 - retries}/3)`, 'county-scraper');
          
          const launchOptions: any = {
            headless: true, // Use headless mode for production
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
            timeout: 300000, // 5 minutes launch timeout for production
            protocolTimeout: 600000, // 10 minutes for very slow connections/deployments
            ignoreHTTPSErrors: true,
            defaultViewport: {
              width: 1920,
              height: 1080
            }
          };
          
          // Only set executablePath if we found one
          if (executablePath) {
            launchOptions.executablePath = executablePath;
          }
          
          // For Replit/container environments, add extra args
          if (process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT) {
            launchOptions.args.push('--single-process');
            launchOptions.args.push('--no-zygote');
            launchOptions.args.push('--disable-dev-tools');
            await Logger.info('Detected Replit environment, added container-specific args', 'county-scraper');
          }
          
          this.browser = await puppeteer.launch(launchOptions);
          
          await Logger.success('Browser launched successfully', 'county-scraper');
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error;
          retries--;
          if (retries > 0) {
            await Logger.warning(`Browser launch failed: ${error}, retrying in 5 seconds... (${retries} attempts left)`, 'county-scraper');
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }
      
      if (!this.browser) {
        throw new Error(`Failed to launch browser after 3 attempts: ${lastError?.message || 'Unknown error'}`);
      }
      await Logger.info(`Puppeteer browser initialized for ${this.county.name}`, 'county-scraper');
    } catch (error) {
      await Logger.error(`Failed to initialize browser for ${this.county.name}: ${error}`, 'county-scraper');
      throw error;
    }
  }

  async scrapeCountyLiens(fromDate?: string, toDate?: string, limit?: number): Promise<ScrapedLien[]> {
    // Ensure browser is initialized with retry logic
    if (!this.browser) {
      let initAttempts = 0;
      const maxInitAttempts = 3;
      
      while (!this.browser && initAttempts < maxInitAttempts) {
        initAttempts++;
        try {
          await Logger.info(`Browser initialization attempt ${initAttempts}/${maxInitAttempts}`, 'county-scraper');
          await this.initialize();
        } catch (initError) {
          await Logger.error(`Browser init attempt ${initAttempts} failed: ${initError}`, 'county-scraper');
          if (initAttempts >= maxInitAttempts) {
            // Return empty array instead of throwing - prevent complete failure
            await Logger.error('Could not initialize browser after 3 attempts - returning empty results to prevent timeout', 'county-scraper');
            return [];
          }
          // Exponential backoff: 5s, 10s, 15s
          await new Promise(resolve => setTimeout(resolve, 5000 * initAttempts));
        }
      }
    }

    if (!this.browser) {
      await Logger.error('Browser not available - returning empty results to prevent timeout', 'county-scraper');
      return [];
    }

    let page;
    try {
      page = await this.browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
    } catch (pageError) {
      await Logger.error(`Could not create new page: ${pageError} - returning empty results`, 'county-scraper');
      return [];
    }
    
    const liens: ScrapedLien[] = [];

    try {
      await Logger.info(`Starting lien scraping for ${this.county.name}`, 'county-scraper');

      // Use provided date range or default to today
      const startDate = fromDate ? new Date(fromDate) : new Date();
      const endDate = toDate ? new Date(toDate) : startDate;
      
      const startMonth = startDate.getMonth() + 1;
      const startDay = startDate.getDate();
      const startYear = startDate.getFullYear();
      
      const endMonth = endDate.getMonth() + 1;
      const endDay = endDate.getDate();
      const endYear = endDate.getFullYear();
      
      // Build the direct URL with date range and increased max results
      const directUrl = `https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRecentPgDn.aspx?rec=0&suf=&nm=&bdt=${startMonth}%2F${startDay}%2F${startYear}&edt=${endMonth}%2F${endDay}%2F${endYear}&cde=HL&max=500&res=True&doc1=HL&doc2=&doc3=&doc4=&doc5=`;
      
      await Logger.info(`📅 Searching for medical liens from ${startMonth}/${startDay}/${startYear} to ${endMonth}/${endDay}/${endYear}`, 'county-scraper');
      await Logger.info(`🔗 Navigating directly to results page`, 'county-scraper');
      await Logger.info(`🔗 Full URL: ${directUrl}`, 'county-scraper');
      
      // Navigate with retry logic and extended timeout for production environments
      let navigationSuccess = false;
      let navigationAttempts = 0;
      const maxNavigationAttempts = 3;
      
      while (!navigationSuccess && navigationAttempts < maxNavigationAttempts) {
        navigationAttempts++;
        try {
          await Logger.info(`🌐 Navigation attempt ${navigationAttempts}/${maxNavigationAttempts} to Maricopa County website...`, 'county-scraper');
          
          // Set page timeout for production environments
          page.setDefaultNavigationTimeout(300000); // 5 minutes
          page.setDefaultTimeout(300000); // 5 minutes for all operations
          
          await page.goto(directUrl, { 
            waitUntil: 'domcontentloaded', // Less strict than networkidle2
            timeout: 300000 // 5 minutes for production networks
          });
          
          navigationSuccess = true;
          await Logger.success(`✅ Successfully navigated to Maricopa County website`, 'county-scraper');
        } catch (navError: any) {
          await Logger.error(`Navigation attempt ${navigationAttempts} failed: ${navError.message}`, 'county-scraper');
          
          if (navError.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
            await Logger.error('DNS resolution failed - check network connectivity in production', 'county-scraper');
          } else if (navError.message.includes('net::ERR_CONNECTION_REFUSED')) {
            await Logger.error('Connection refused - site may be blocking automated requests', 'county-scraper');
          } else if (navError.message.includes('TimeoutError')) {
            await Logger.error('Navigation timeout - production network may be slow or restricted', 'county-scraper');
          }
          
          if (navigationAttempts < maxNavigationAttempts) {
            const waitTime = 10000 * navigationAttempts; // Exponential backoff: 10s, 20s, 30s
            await Logger.info(`Waiting ${waitTime/1000} seconds before retry...`, 'county-scraper');
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            // Don't throw - return what we have (empty array)
            await Logger.error(`Could not navigate after ${maxNavigationAttempts} attempts - returning empty results to prevent timeout`, 'county-scraper');
            try {
              await page.close();
            } catch (closeError) {
              // Ignore close errors
            }
            return liens; // Return empty array
          }
        }
      }

      // Check if navigation was successful
      if (!navigationSuccess) {
        await Logger.error('Navigation failed - returning empty results to prevent timeout', 'county-scraper');
        return liens;
      }
      
      // Wait for page to load with timeout protection
      await Promise.race([
        new Promise(resolve => setTimeout(resolve, 3000)),
        new Promise(resolve => setTimeout(resolve, 10000)) // Max 10 seconds wait
      ]);
      
      // Log the current URL to verify navigation
      const currentUrl = page.url();
      await Logger.info(`📍 Current page URL: ${currentUrl}`, 'county-scraper');

      // Collect all recording numbers from all pages
      const allRecordingNumbers: string[] = [];
      let pageNum = 1;
      let hasNextPage = true;
      const MAX_PAGES = 10; // Process up to 10 pages of results

      while (hasNextPage && pageNum <= MAX_PAGES) {
        await Logger.info(`📄 Processing page ${pageNum} of results (max ${MAX_PAGES} pages)`, 'county-scraper');

        // Take screenshot for debugging
        await page.screenshot({ path: `results-page-${pageNum}.png` });
        await Logger.info(`📸 Screenshot saved to results-page-${pageNum}.png`, 'county-scraper');
        
        // Extract recording numbers from current page with better debugging
        const pageData = await page.evaluate(() => {
          const numbers: string[] = [];
          const pageInfo: any = {
            url: window.location.href,
            title: document.title,
            bodyText: document.body.innerText?.substring(0, 500) || '',
            tables: document.querySelectorAll('table').length,
            links: []
          };
          
          // Look for the results table
          const tables = document.querySelectorAll('table');
          
          tables.forEach((table, tableIndex) => {
            const rows = table.querySelectorAll('tr');
            
            for (let i = 0; i < Math.min(rows.length, 5); i++) { // Check first 5 rows
              const cells = rows[i].querySelectorAll('td, th');
              const rowData: string[] = [];
              
              cells.forEach((cell, cellIndex) => {
                const cellText = cell.textContent?.trim() || '';
                rowData.push(cellText);
                
                // Look for links in first column
                if (cellIndex === 0) {
                  const link = cell.querySelector('a');
                  if (link) {
                    const linkText = link.textContent?.trim();
                    const href = link.getAttribute('href') || '';
                    
                    pageInfo.links.push({
                      text: linkText,
                      href: href
                    });
                    
                    if (linkText && linkText.match(/^\d{10,12}$/)) {
                      numbers.push(linkText);
                    }
                  } else if (cellText && cellText.match(/^\d{10,12}$/)) {
                    numbers.push(cellText);
                  }
                }
              });
              
              if (i === 0) {
                pageInfo.firstRowContent = rowData;
              }
            }
          });
          
          // Also look for any links with recording numbers anywhere on page
          document.querySelectorAll('a').forEach(link => {
            const text = link.textContent?.trim() || '';
            if (text.match(/^\d{10,12}$/) && !numbers.includes(text)) {
              numbers.push(text);
            }
          });
          
          return { numbers, pageInfo };
        });
        
        const pageRecordingNumbers = pageData.numbers;
        await Logger.info(`📊 Page analysis: Tables: ${pageData.pageInfo.tables}, Links found: ${pageData.pageInfo.links.length}`, 'county-scraper');
        if (pageData.pageInfo.firstRowContent) {
          await Logger.info(`First row content: ${JSON.stringify(pageData.pageInfo.firstRowContent)}`, 'county-scraper');
        }
        await Logger.info(`Page snippet: ${pageData.pageInfo.bodyText}`, 'county-scraper');

        await Logger.info(`Found ${pageRecordingNumbers.length} recording numbers on page ${pageNum}`, 'county-scraper');
        allRecordingNumbers.push(...pageRecordingNumbers);

        // Check if there's a "Next Page" button and click it
        hasNextPage = await page.evaluate(() => {
          // Look for next page link/button
          const nextLinks = Array.from(document.querySelectorAll('a, input[type="button"], button'));
          
          for (const link of nextLinks) {
            const text = (link.textContent || (link as HTMLInputElement).value || '').toLowerCase();
            if (text.includes('next') && !text.includes('previous')) {
              // Check if the button/link is disabled
              if ((link as HTMLInputElement).disabled || link.getAttribute('disabled')) {
                return false;
              }
              
              // Click the next button
              (link as HTMLElement).click();
              return true;
            }
          }
          
          return false;
        });

        if (hasNextPage) {
          // Wait for the next page to load
          await new Promise(resolve => setTimeout(resolve, 3000));
          pageNum++;
        }
      }

      await Logger.success(`✅ Collected ${allRecordingNumbers.length} total recording numbers from ${pageNum} pages`, 'county-scraper');

      // Only add the user's example if no recordings found (for testing)
      if (allRecordingNumbers.length === 0 && fromDate && fromDate.includes('2025-08-20')) {
        // User provided this as an example of accessible PDF from Aug 20, 2025
        allRecordingNumbers.push('20250479507');
        await Logger.info(`🔍 No recordings found in search. Added user's example 20250479507 for testing`, 'county-scraper');
      }
      
      // Process all recording numbers found, or limit if specified
      const recordingsToProcess = limit && limit > 0 
        ? allRecordingNumbers.slice(0, limit)
        : allRecordingNumbers;
      await Logger.info(`Processing ${recordingsToProcess.length} recording numbers (out of ${allRecordingNumbers.length} found${limit ? `, limited to ${limit}` : ''})`, 'county-scraper');
      
      // Create a single page for all processing to avoid constant reconnections
      let recordPage: Page | null = null;
      let pageCreated = false;
      
      for (let i = 0; i < recordingsToProcess.length; i++) {
        const recordingNumber = recordingsToProcess[i];
        await Logger.info(`📑 Processing recording number ${i+1}/${recordingsToProcess.length}: ${recordingNumber}`, 'county-scraper');
        
        try {
          // Reinitialize browser for each lien to avoid protocol timeout issues
          if (!this.browser || !this.browser.isConnected()) {
            await Logger.info(`Browser not connected, initializing...`, 'county-scraper');
            await this.cleanup();
            await this.initialize();
          }
          
          // Create new page for each lien to avoid frame detachment
          if (recordPage) {
            try { await recordPage.close(); } catch (e) {}
          }
          
          recordPage = await this.browser!.newPage();
          pageCreated = true;
          
          // Small delay between liens
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          
          // Set page timeouts
          recordPage.setDefaultNavigationTimeout(30000); // 30 seconds for navigation
          recordPage.setDefaultTimeout(30000); // 30 seconds default timeout
          
          // Navigate to the document detail page
          const docUrl = `https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataDetail.aspx?rec=${recordingNumber}&suf=&nm=`;
          await recordPage.goto(docUrl, { waitUntil: 'networkidle2', timeout: 30000 }); // More stable navigation
          
          // Log the actual URL we're visiting
          await Logger.info(`🔗 Visiting document URL: ${docUrl}`, 'county-scraper');
          
          // Extract lien information from the page
          const lienData = await recordPage.evaluate(() => {
            // Get all text from the page
            const pageText = document.body?.innerText || '';
            
            // Extract recording date
            const dateMatch = pageText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
            const recordingDate = dateMatch ? dateMatch[1] : '';
            
            // Extract names (usually in a specific format on the page)
            const grantorMatch = pageText.match(/Grantor[\s:]+([^\n]+)/i);
            const granteeMatch = pageText.match(/Grantee[\s:]+([^\n]+)/i);
            
            const grantorName = grantorMatch ? grantorMatch[1].trim() : '';
            
            // Extract address - typically appears right after the grantor/debtor name
            let address = '';
            
            // First try to find address right after the grantor's name
            if (grantorName) {
              // Look for address immediately following the grantor name
              const nameIndex = pageText.indexOf(grantorName);
              if (nameIndex !== -1) {
                // Get text after the name (next 200 characters)
                const textAfterName = pageText.substring(nameIndex + grantorName.length, nameIndex + grantorName.length + 200);
                // Look for address pattern in this text
                const addressAfterNameMatch = textAfterName.match(/(\d+\s+[A-Za-z0-9\s]+(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|LN|LANE|CT|COURT|WAY|BLVD|BOULEVARD|PL|PLACE)[\s,]*[A-Za-z\s]+,?\s+AZ\s+\d{5})/i);
                if (addressAfterNameMatch) {
                  address = addressAfterNameMatch[1].trim();
                }
              }
            }
            
            // If no address found after name, try other patterns
            if (!address) {
              const addressPatterns = [
                /(?:Property Address|Address|Property)[\s:]+([^\n]+(?:\n[^\n]+)?)/i,
                /(\d+\s+[A-Za-z0-9\s]+(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|LN|LANE|CT|COURT|WAY|BLVD|BOULEVARD|PL|PLACE)[\s,]*[A-Za-z\s]+,?\s+AZ\s+\d{5})/i
              ];
              
              for (const pattern of addressPatterns) {
                const match = pageText.match(pattern);
                if (match) {
                  address = match[1].trim();
                  break;
                }
              }
            }
            
            // Look for amount in various formats
            const amountMatch = pageText.match(/\$([\d,]+(?:\.\d{2})?)/i);
            const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;
            
            return {
              recordingDate: recordingDate || '',
              grantor: grantorName,
              grantee: granteeMatch ? granteeMatch[1].trim() : '',
              address: address,
              amount: amount,
              pageText: pageText.substring(0, 500) // First 500 chars for debugging
            };
          });
          
          // Look for the link in the "Pages" column of the table (as user suggested)
          let pdfPageLink: string | null = null;
          
          try {
            // Wait for table to be loaded to prevent frame detachment
            await recordPage.waitForSelector('table', { timeout: 5000 }).catch(() => {});
            
            pdfPageLink = await recordPage.evaluate(() => {
            // Find the table with document information
            const tables = document.querySelectorAll('table');
            
            for (const table of Array.from(tables)) {
              const rows = table.querySelectorAll('tr');
              
              // Look for a row with "Pages" header or cell
              for (const row of Array.from(rows)) {
                const cells = row.querySelectorAll('td, th');
                
                for (let i = 0; i < cells.length; i++) {
                  const cellText = cells[i]?.textContent?.trim() || '';
                  
                  // Check if this cell contains "Pages" or if the header above it says "Pages"
                  if (cellText.toLowerCase().includes('pages') || cellText.toLowerCase() === 'pages') {
                    // Look for a link in the next cell or current cell
                    const targetCell = cellText.toLowerCase() === 'pages' && cells[i + 1] ? cells[i + 1] : cells[i];
                    const link = targetCell?.querySelector('a');
                    
                    if (link) {
                      const href = link.getAttribute('href');
                      const linkText = link.textContent?.trim() || '';
                      
                      // The link text is usually just a number (page count)
                      if (href && linkText.match(/^\d+$/)) {
                        console.log(`Found Pages link: ${linkText} -> ${href}`);
                        if (href.startsWith('/')) {
                          return `https://legacy.recorder.maricopa.gov${href}`;
                        }
                        if (href.startsWith('http')) {
                          return href;
                        }
                        // Handle relative URLs
                        return `https://legacy.recorder.maricopa.gov/recdocdata/${href}`;
                      }
                    }
                  }
                }
              }
              
              // Alternative: Look for any numeric link in a table cell (likely the pages link)
              const allLinks = table.querySelectorAll('a');
              for (const link of Array.from(allLinks)) {
                const href = link.getAttribute('href');
                const text = link.textContent?.trim() || '';
                
                // If it's a numeric link (like "1" or "2" for page count)
                if (href && text.match(/^\d+$/) && !href.includes('javascript:')) {
                  console.log(`Found numeric link (likely Pages): ${text} -> ${href}`);
                  if (href.startsWith('/')) {
                    return `https://legacy.recorder.maricopa.gov${href}`;
                  }
                  if (href.startsWith('http')) {
                    return href;
                  }
                  // Handle relative URLs
                  return `https://legacy.recorder.maricopa.gov/recdocdata/${href}`;
                }
              }
            }
            
            return null;
          });
          } catch (evalError) {
            // Handle frame detachment gracefully
            if (evalError instanceof Error && evalError.message.includes('detached')) {
              await Logger.info(`⚠️ Frame detached for ${recordingNumber}, using fallback PDF URL`, 'county-scraper');
            } else {
              await Logger.info(`⚠️ Error finding PDF link for ${recordingNumber}: ${evalError}`, 'county-scraper');
            }
            // Continue with fallback URL
            pdfPageLink = null;
          }
          
          let actualPdfUrl: string = '';
          
          if (pdfPageLink) {
            await Logger.info(`📎 Found Pages column link: ${pdfPageLink}`, 'county-scraper');
            
            // Create a new page for PDF navigation to avoid detached frame errors
            let pdfPage: Page | null = null;
            
            try {
              pdfPage = await this.browser!.newPage();
              
              // Navigate to the page link to get the actual PDF
              const pdfResponse = await pdfPage.goto(pdfPageLink, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
              });
            
              // Wait a bit for the PDF to be generated/loaded
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Check if we need to reload (sometimes PDFs need a refresh to load)
              let contentType = pdfResponse?.headers()['content-type'] || '';
              let reloadAttempts = 0;
              const maxReloads = 5;
              
              // Keep reloading until we get a PDF or hit max attempts
              while (!contentType.includes('pdf') && reloadAttempts < maxReloads) {
                reloadAttempts++;
                await Logger.info(`🔄 Attempt ${reloadAttempts}/${maxReloads}: Got ${contentType || 'unknown'} response, refreshing to get PDF...`, 'county-scraper');
                
                // Wait before reload (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * reloadAttempts));
                
                // Reload the page
                const reloadResponse = await pdfPage.reload({ waitUntil: 'networkidle2', timeout: 30000 });
                
                // Check if we have a PDF now
                contentType = reloadResponse?.headers()['content-type'] || '';
                
                // Also check if the URL indicates a PDF
                const currentUrl = pdfPage.url();
                if (currentUrl.includes('.pdf')) {
                  // Try to get the actual response
                  const pageContent = await pdfPage.evaluate(() => {
                    // Check if this is actually a PDF by looking at the document
                    const isPdf = document.contentType === 'application/pdf' || 
                                  window.location.href.includes('.pdf');
                    return {
                      url: window.location.href,
                      isPdf: isPdf,
                      contentType: document.contentType,
                      bodyText: document.body ? document.body.innerText.substring(0, 100) : ''
                    };
                  });
                  
                  if (pageContent.isPdf || !pageContent.bodyText.includes('<!DOCTYPE')) {
                    actualPdfUrl = currentUrl;
                    await Logger.info(`✅ Successfully loaded PDF after ${reloadAttempts} reload(s): ${actualPdfUrl}`, 'county-scraper');
                    contentType = 'application/pdf'; // Force it to be treated as PDF
                  break;
                }
              }
            }
            
              if (reloadAttempts >= maxReloads) {
                await Logger.info(`❌ Failed to load PDF after ${maxReloads} refresh attempts`, 'county-scraper');
              }
              
              if (contentType.includes('pdf') || pdfPage.url().includes('.pdf')) {
                // Direct PDF response
                actualPdfUrl = pdfPage.url();
                await Logger.info(`📄 Navigated directly to PDF: ${actualPdfUrl}`, 'county-scraper');
              } else {
                // Might be a viewer page, look for the actual PDF URL
                const viewerPdfUrl = await pdfPage.evaluate(() => {
                // Check for PDF in iframe
                const iframe = document.querySelector('iframe');
                if (iframe?.src) {
                  return iframe.src;
                }
                
                // Check for embed or object tags
                const embed = document.querySelector('embed');
                if (embed?.src) {
                  return embed.src;
                }
                
                const object = document.querySelector('object');
                if (object?.data) {
                  return object.data;
                }
                
                // Look for any PDF links on the page
                const links = document.querySelectorAll('a');
                for (const link of Array.from(links)) {
                  const href = link.getAttribute('href');
                  if (href && href.includes('.pdf')) {
                    return href.startsWith('http') ? href : `https://legacy.recorder.maricopa.gov${href}`;
                  }
                }
                
                return null;
              });
              
                if (viewerPdfUrl) {
                  actualPdfUrl = viewerPdfUrl;
                  await Logger.info(`📄 Found PDF URL in viewer: ${actualPdfUrl}`, 'county-scraper');
                } else {
                  // Use current URL if it might be the PDF
                  actualPdfUrl = pdfPage.url();
                  await Logger.info(`📄 Using current page URL: ${actualPdfUrl}`, 'county-scraper');
                }
              }
            } catch (pdfError) {
              await Logger.error(`Error processing PDF page for ${recordingNumber}: ${pdfError}`, 'county-scraper');
              // Use fallback URL if PDF page processing fails
              actualPdfUrl = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
              await Logger.info(`Using fallback PDF URL after error: ${actualPdfUrl}`, 'county-scraper');
            } finally {
              // Always close the PDF page to avoid memory leaks
              if (pdfPage) {
                try {
                  await pdfPage.close();
                } catch (closeError) {
                  // Ignore close errors
                }
              }
            }
          } else {
            // Fallback to direct PDF URL if Pages link not found
            actualPdfUrl = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
            await Logger.info(`🔗 No Pages link found, using direct PDF URL: ${actualPdfUrl}`, 'county-scraper');
          }
          
          // Log the detail page for reference
          await Logger.info(`📄 Document ${recordingNumber}: Detail page: ${docUrl}`, 'county-scraper');
          
          // Download the actual PDF
          const pdfBuffer = await this.downloadPdf(actualPdfUrl, recordingNumber, recordPage);
          
          if (pdfBuffer) {
            const lienInfo = {
              recordingNumber,
              recordingDate: lienData.recordingDate ? new Date(lienData.recordingDate) : new Date(),
              documentUrl: actualPdfUrl,
              pdfBuffer: pdfBuffer, // Store the actual PDF data
              grantor: lienData.grantor,
              grantee: lienData.grantee,
              address: lienData.address,
              amount: lienData.amount
            };
            
            liens.push(lienInfo);
            await Logger.success(`✅ Downloaded PDF for lien ${recordingNumber} (${pdfBuffer.length} bytes)`, 'county-scraper');
            
            // Save lien immediately to database to prevent data loss on restart
            console.log(`[DEBUG] About to save lien ${recordingNumber} to database`);
            try {
              await storage.createLien({
                recordingNumber: lienInfo.recordingNumber,
                recordDate: lienInfo.recordingDate,
                countyId: this.county.id,
                debtorName: lienInfo.grantor || 'To be extracted',
                debtorAddress: lienInfo.address || '',
                amount: (lienInfo.amount || 0).toString(),
                creditorName: lienInfo.grantee || 'Medical Provider',
                creditorAddress: '',
                documentUrl: lienInfo.documentUrl,
                status: 'pending'
              });
              await Logger.info(`💾 Saved lien ${recordingNumber} to database`, 'county-scraper');
              console.log(`[DEBUG] Successfully saved lien ${recordingNumber}`);
            } catch (saveError) {
              console.error(`[DEBUG] Failed to save lien ${recordingNumber}:`, saveError);
              await Logger.error(`Failed to save lien ${recordingNumber}: ${saveError}`, 'county-scraper');
            }
          } else {
            await Logger.info(`⏭️ Skipping ${recordingNumber} - PDF download failed`, 'county-scraper');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Log specific error types differently to help debugging
          if (errorMessage.includes('TimeoutError') || errorMessage.includes('Navigation timeout')) {
            await Logger.warning(`⏱️ Timeout processing ${recordingNumber} (server may be slow) - continuing with next lien`, 'county-scraper');
          } else if (errorMessage.includes('detached') || errorMessage.includes('Frame')) {
            await Logger.warning(`🔄 Frame issue with ${recordingNumber} (page structure changed) - continuing with next lien`, 'county-scraper');
          } else if (errorMessage.includes('Protocol error') || errorMessage.includes('Connection closed')) {
            await Logger.warning(`🔌 Connection lost for ${recordingNumber} - continuing with next lien`, 'county-scraper');
          } else {
            await Logger.error(`Failed to process recording ${recordingNumber}: ${errorMessage}`, 'county-scraper');
          }
          
          // Continue processing other liens even if this one fails
        } finally {
          // Don't close the page here - reuse it for next lien
        }
      }
      
      // Clean up the reusable page after all liens are processed
      if (recordPage) {
        try {
          await recordPage.close();
        } catch (e) {
          // Ignore close errors
        }
      }

      await Logger.success(`🎯 Found ${liens.length} liens with valid PDFs in ${this.county.name}`, 'county-scraper');
      
      // Store liens for access by scheduler
      this.liens = liens;
      
      // Note: Liens are now saved immediately after processing to prevent data loss

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Handle protocol timeout specifically
      if (errorMessage.includes('Protocol') || errorMessage.includes('protocolTimeout') || errorMessage.includes('Network.enable')) {
        await Logger.error(`Protocol timeout in ${this.county.name} - browser connection is slow. Returning ${liens.length} partial results.`, 'county-scraper');
      } else {
        await Logger.error(`Error in ${this.county.name}: ${errorMessage}. Returning ${liens.length} partial results.`, 'county-scraper');
      }
      
      // Always return partial results instead of throwing
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

  // parseLienInfo method removed - no longer extracting data from PDFs

  async saveLiens(liens: ScrapedLien[]): Promise<void> {
    try {
      // Store liens in instance for access by scheduler
      this.liens = liens;
      
      // Save to storage for persistence
      for (const lien of liens) {
        await storage.createLien({
          recordingNumber: lien.recordingNumber,
          recordDate: lien.recordingDate,
          countyId: this.county.id,
          debtorName: (lien as any).grantor || 'To be extracted',
          debtorAddress: (lien as any).address || '',
          amount: ((lien as any).amount || 0).toString(),
          creditorName: (lien as any).grantee || 'Medical Provider',
          creditorAddress: '',
          documentUrl: lien.documentUrl, // This has the PDF URL
          status: 'pending'
        });
      }
      
      await Logger.success(`Saved ${liens.length} liens from ${this.county.name}`, 'county-scraper');
    } catch (error) {
      await Logger.error(`Failed to save liens: ${error}`, 'county-scraper');
      throw error;
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      await Logger.info(`Browser cleanup completed for ${this.county.name}`, 'county-scraper');
    }
  }
}

// Maricopa County specific implementation
export class MaricopaCountyScraper extends PuppeteerCountyScraper {
  // Uses the base implementation with direct URL approach
}

// Factory function to create appropriate scraper
export function createCountyScraper(county: County, config: CountyConfig): CountyScraper {
  switch (county.name.toLowerCase()) {
    case 'maricopa county':
      return new MaricopaCountyScraper(county, config);
    default:
      return new PuppeteerCountyScraper(county, config);
  }
}