import puppeteer, { Browser, Page } from 'puppeteer';
import { Logger } from './logger';
import { storage } from '../storage';
import { InsertLien } from '@shared/schema';

interface ScrapedLien {
  recordingNumber: string;
  recordDate: Date;
  debtorName: string;
  debtorAddress?: string;
  amount: number;
  creditorName?: string;
  creditorAddress?: string;
  documentUrl: string;
}

export class ScraperService {
  private browser: Browser | null = null;

  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        protocolTimeout: 180000, // Increase protocol timeout to 3 minutes
        timeout: 60000, // Browser launch timeout of 60 seconds
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080'
        ]
      });
      await Logger.info('Puppeteer browser initialized', 'scraper');
    } catch (error) {
      await Logger.error(`Failed to initialize browser: ${error}`, 'scraper');
      throw error;
    }
  }

  async scrapeMaricopaCountyLiens(startDate?: Date, endDate?: Date): Promise<ScrapedLien[]> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    const liens: ScrapedLien[] = [];

    try {
      await Logger.info('Starting Maricopa County lien scraping', 'scraper');

      // Navigate to the search page
      await page.goto('https://recorder.maricopa.gov/recording/document-search.html', {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Set document code to MEDICAL LN
      await page.waitForSelector('select[name="documentType"]', { timeout: 10000 });
      await page.select('select[name="documentType"]', 'MEDICAL LN');

      // Set date range (default to yesterday if not provided)
      const searchStartDate = startDate || new Date(Date.now() - 24 * 60 * 60 * 1000);
      const searchEndDate = endDate || new Date();

      const formatDate = (date: Date) => {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
      };

      await page.type('input[name="startDate"]', formatDate(searchStartDate));
      await page.type('input[name="endDate"]', formatDate(searchEndDate));

      // Click search
      await page.click('button[type="submit"]');
      await page.waitForSelector('.search-results', { timeout: 15000 });

      // Get all recording numbers from search results
      const recordingNumbers = await page.evaluate(() => {
        const rows = document.querySelectorAll('.search-results tr');
        const numbers: string[] = [];
        
        rows.forEach(row => {
          const recordingCell = row.querySelector('td:first-child a');
          if (recordingCell && recordingCell.textContent) {
            numbers.push(recordingCell.textContent.trim());
          }
        });
        
        return numbers;
      });

      await Logger.info(`Found ${recordingNumbers.length} potential medical liens`, 'scraper', { count: recordingNumbers.length });

      // Process each recording number
      for (const recordingNumber of recordingNumbers) {
        try {
          const lien = await this.processSingleLien(page, recordingNumber);
          if (lien && lien.amount >= 20000) {
            liens.push(lien);
            await Logger.info(`Added lien over $20k: ${recordingNumber} - $${lien.amount}`, 'scraper');
          } else if (lien) {
            await Logger.info(`Skipped lien under $20k: ${recordingNumber} - $${lien.amount}`, 'scraper');
          }
        } catch (error) {
          await Logger.warning(`Failed to process lien ${recordingNumber}: ${error}`, 'scraper');
        }
      }

      await Logger.success(`Scraping completed. Found ${liens.length} liens over $20,000`, 'scraper');
      return liens;

    } catch (error) {
      await Logger.error(`Scraping failed: ${error}`, 'scraper');
      throw error;
    } finally {
      await page.close();
    }
  }

  private async processSingleLien(page: Page, recordingNumber: string): Promise<ScrapedLien | null> {
    try {
      // Construct PDF URL
      const pdfUrl = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
      
      // Navigate to PDF
      await page.goto(pdfUrl, { timeout: 15000 });
      
      // Wait a bit for PDF to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Extract text content from PDF (this is a simplified approach)
      // In production, you might want to use a PDF parsing library
      const textContent = await page.evaluate(() => {
        return document.body.innerText;
      });

      // Parse the lien information from the text
      const lien = await this.parseLienFromText(textContent, recordingNumber, pdfUrl);
      
      return lien;
    } catch (error) {
      await Logger.warning(`Failed to process PDF for ${recordingNumber}: ${error}`, 'scraper');
      return null;
    }
  }

  private async parseLienFromText(text: string, recordingNumber: string, documentUrl: string): Promise<ScrapedLien | null> {
    try {
      // Look for amount pattern
      const amountMatch = text.match(/Amount claimed due for care of patient as of date of recording[:\s]*\$?([\d,]+\.?\d*)/i);
      if (!amountMatch) {
        return null;
      }

      const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      
      // Extract debtor name (simplified pattern)
      const debtorMatch = text.match(/Debtor[:\s]*(.*?)(?:\n|Address|$)/i);
      const debtorName = debtorMatch ? debtorMatch[1].trim() : 'Unknown';
      
      // Extract creditor name
      const creditorMatch = text.match(/Creditor[:\s]*(.*?)(?:\n|Address|$)/i);
      const creditorName = creditorMatch ? creditorMatch[1].trim() : 'Unknown';
      
      // Extract addresses (simplified)
      const addressMatches = text.match(/(\d+.*?(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Circle|Cir|Court|Ct|Way).*?(?:AZ|Arizona).*?\d{5})/gi);
      const debtorAddress = addressMatches?.[0] || undefined;
      const creditorAddress = addressMatches?.[1] || undefined;

      return {
        recordingNumber,
        recordDate: new Date(), // Would parse actual record date from document
        debtorName,
        debtorAddress,
        amount,
        creditorName,
        creditorAddress,
        documentUrl
      };
    } catch (error) {
      await Logger.error(`Failed to parse lien text for ${recordingNumber}: ${error}`, 'scraper');
      return null;
    }
  }

  async saveLiens(liens: ScrapedLien[]): Promise<void> {
    try {
      for (const lien of liens) {
        await storage.createLien({
          recordingNumber: lien.recordingNumber,
          recordDate: lien.recordDate,
          debtorName: lien.debtorName,
          debtorAddress: lien.debtorAddress,
          amount: lien.amount.toString(),
          creditorName: lien.creditorName,
          creditorAddress: lien.creditorAddress,
          documentUrl: lien.documentUrl,
          status: 'pending'
        });
      }
      await Logger.success(`Saved ${liens.length} liens to database`, 'scraper');
    } catch (error) {
      await Logger.error(`Failed to save liens: ${error}`, 'scraper');
      throw error;
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      await Logger.info('Browser cleanup completed', 'scraper');
    }
  }
}
