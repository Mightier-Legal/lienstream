import * as cron from 'node-cron';
import { AirtableService } from './airtable';
import { Logger } from './logger';
import { createScraper, BaseScraper, ScrapedLien } from './scrapers';
import { storage } from '../storage';

// Timezone type matching the schema enum
type TimezoneType = 'America/New_York' | 'America/Chicago' | 'America/Denver' | 'America/Los_Angeles';

export class SchedulerService {
  private airtableService: AirtableService;
  private isRunning = false;
  private scheduledTask: any | null = null;
  private currentSchedule = '0 5 * * *'; // Default: 5:00 AM UTC (1:00 AM ET)
  private currentTimezone = 'America/New_York'; // Default: Eastern Time
  private currentHour = 1; // Local hour (1 AM ET)
  private currentMinute = 0;
  private skipWeekends = false;
  private isEnabled = true;
  private currentScrapers: BaseScraper[] = [];
  private currentRunId: string | null = null;
  private shouldStop = false;

  constructor() {
    this.airtableService = new AirtableService();
    // Reset isRunning flag on initialization to ensure clean state
    this.isRunning = false;
  }

  async start() {
    // Load saved schedule from database if exists
    const savedSchedule = await storage.getScheduleConfig();
    if (savedSchedule) {
      this.currentTimezone = savedSchedule.timezone || 'America/New_York';
      this.currentHour = savedSchedule.hour;
      this.currentMinute = savedSchedule.minute;
      this.skipWeekends = savedSchedule.skipWeekends;
      this.isEnabled = savedSchedule.isEnabled;
      // Build cron expression (timezone handled in scheduleTask)
      this.currentSchedule = this.buildCronExpression(savedSchedule.hour, savedSchedule.minute, savedSchedule.skipWeekends);
    }

    // Schedule the task
    this.scheduleTask();

    const scheduleTime = this.getHumanReadableSchedule();
    await Logger.info(`Scheduler started - ${scheduleTime}`, 'scheduler');
  }

  private buildCronExpression(hour: number, minute: number, skipWeekends: boolean): string {
    // Build cron expression using the specified hour/minute directly
    // Timezone is handled by node-cron's timezone option in scheduleTask()
    if (skipWeekends) {
      // Mon-Fri only (1-5)
      return `${minute} ${hour} * * 1-5`;
    }
    return `${minute} ${hour} * * *`;
  }

  private scheduleTask() {
    // Stop existing task if any
    if (this.scheduledTask) {
      this.scheduledTask.stop();
    }

    // Create new scheduled task with timezone support
    // node-cron will run at the specified time in the configured timezone
    this.scheduledTask = cron.schedule(this.currentSchedule, async () => {
      await this.runAutomation('scheduled');
    }, {
      timezone: this.currentTimezone
    });
  }

  async updateSchedule(hour: number, minute: number, timezone: TimezoneType = 'America/New_York', skipWeekends: boolean = false, isEnabled: boolean = true): Promise<void> {
    // Build the cron expression (timezone handled separately in scheduleTask)
    const cronExpression = this.buildCronExpression(hour, minute, skipWeekends);

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error('Invalid schedule time');
    }

    // Store the schedule in memory
    this.currentSchedule = cronExpression;
    this.currentTimezone = timezone;
    this.currentHour = hour;
    this.currentMinute = minute;
    this.skipWeekends = skipWeekends;
    this.isEnabled = isEnabled;

    // Save to database
    await storage.saveScheduleConfig({
      id: 'global',
      name: 'Default Schedule',
      hour,
      minute,
      timezone,
      skipWeekends,
      isEnabled
    });

    // Reschedule the task
    this.scheduleTask();

    // Log the update
    const displayHour = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
    const isPM = hour >= 12;
    const tzAbbrev = this.getTimezoneAbbreviation(timezone);
    const localTime = `${displayHour}:${minute.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'} ${tzAbbrev}`;
    const weekdayStr = skipWeekends ? ' (weekdays only)' : '';
    await Logger.info(`Schedule updated to ${localTime}${weekdayStr}`, 'scheduler');
  }

  private getTimezoneAbbreviation(timezone: string): string {
    const abbrevMap: { [key: string]: string } = {
      'America/New_York': 'ET',
      'America/Chicago': 'CT',
      'America/Denver': 'MT',
      'America/Los_Angeles': 'PT'
    };
    return abbrevMap[timezone] || timezone;
  }

  async getScheduleInfo(): Promise<{
    id: string;
    name: string;
    hour: number;
    minute: number;
    timezone: string;
    skipWeekends: boolean;
    isEnabled: boolean;
    humanReadable: string;
  }> {
    // Get the saved schedule config from database
    const savedConfig = await storage.getScheduleConfig();

    if (savedConfig) {
      return {
        id: savedConfig.id,
        name: savedConfig.name,
        hour: savedConfig.hour,
        minute: savedConfig.minute,
        timezone: savedConfig.timezone,
        skipWeekends: savedConfig.skipWeekends,
        isEnabled: savedConfig.isEnabled,
        humanReadable: this.getHumanReadableSchedule()
      };
    }

    // Return defaults if no config exists
    return {
      id: 'global',
      name: 'Default Schedule',
      hour: this.currentHour,
      minute: this.currentMinute,
      timezone: this.currentTimezone,
      skipWeekends: this.skipWeekends,
      isEnabled: this.isEnabled,
      humanReadable: this.getHumanReadableSchedule()
    };
  }

  private getHumanReadableSchedule(): string {
    // Use local time settings instead of parsing cron
    const hour = this.currentHour;
    const minute = this.currentMinute;

    // Convert to 12-hour format with AM/PM
    const isPM = hour >= 12;
    let displayHour = hour % 12;
    if (displayHour === 0) displayHour = 12; // Handle midnight (0) and noon (12)

    const tzAbbrev = this.getTimezoneAbbreviation(this.currentTimezone);
    const timeStr = `${displayHour}:${minute.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'} ${tzAbbrev}`;
    const frequency = this.skipWeekends ? 'weekdays' : 'daily';
    return `${frequency} at ${timeStr}`;
  }

  async runAutomation(type: 'scheduled' | 'manual', fromDate?: string, toDate?: string, limit?: number): Promise<void> {
    if (this.isRunning) {
      await Logger.warning('Automation already running, skipping', 'scheduler');
      return;
    }

    this.isRunning = true;
    this.shouldStop = false;
    this.currentScrapers = [];
    
    // ALWAYS use yesterday's date when no dates are provided (both scheduled and manual runs)
    // This ensures we're always searching for liens that were recorded the previous business day
    if (!fromDate && !toDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      fromDate = yesterday.toISOString().split('T')[0]; // Format as YYYY-MM-DD
      toDate = fromDate; // Same date for both to get just that day's records
      await Logger.info(`Using yesterday's date for ${type} run: ${fromDate}`, 'scheduler');
    }
    
    const runId = await storage.createAutomationRun({
      type,
      status: 'running',
      startTime: new Date(),
      metadata: JSON.stringify({ startedBy: type, fromDate, toDate })
    });
    
    this.currentRunId = runId;

    try {
      await Logger.info(`Starting ${type} automation run`, 'scheduler', { runId });

      // Step 1: Get active counties
      const activeCounties = await storage.getActiveCounties();
      if (activeCounties.length === 0) {
        await Logger.warning('No active counties configured', 'scheduler');
        await storage.updateAutomationRun(runId, {
          status: 'completed',
          endTime: new Date(),
          liensFound: 0,
          liensProcessed: 0,
          liensOver20k: 0
        });
        return;
      }

      let totalLiensFound = 0;
      let totalLiensProcessed = 0;
      const allScrapers: any[] = [];

      // Step 2: Scrape each county
      for (const county of activeCounties) {
        // Check if stop was requested
        if (this.shouldStop) {
          await Logger.info('Stopping automation as requested', 'scheduler');
          break;
        }
        
        let countyRunId: string | undefined;
        
        try {
          await Logger.info(`Starting lien scraping for ${county.name}, ${county.state}`, 'scheduler');
          
          // Create county run record
          countyRunId = await storage.createCountyRun({
            countyId: county.id,
            automationRunId: runId,
            status: 'running',
            startTime: new Date(),
            metadata: JSON.stringify({ county: county.name, state: county.state })
          });

          // Create appropriate scraper for this county using the factory
          // The factory handles: fetching platform, merging configs, selecting scraper class
          const scraper = await createScraper(county);
          allScrapers.push(scraper);
          this.currentScrapers.push(scraper);
          
          // Initialize the scraper with timeout (longer for production environments)
          const SCRAPER_TIMEOUT = process.env.REPLIT_DEPLOYMENT ? 
            30 * 60 * 1000 : // 30 minutes for production deployments
            15 * 60 * 1000;  // 15 minutes for development
          
          try {
            await Promise.race([
              scraper.initialize(),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Scraper initialization timeout')), 60000) // Increase to 60 seconds
              )
            ]);
          } catch (initError) {
            await Logger.error(`Scraper initialization failed: ${initError} - attempting to continue`, 'scheduler');
            // Don't throw - let scrapeCountyLiens handle the uninitialized browser
          }

          // Scrape with timeout protection but always get results
          let scrapedLiens: ScrapedLien[] = [];
          try {
            scrapedLiens = await Promise.race([
              scraper.scrapeCountyLiens(fromDate, toDate, limit),
              new Promise<ScrapedLien[]>((resolve) => 
                setTimeout(() => {
                  Logger.warning(`Scraping timeout reached (${SCRAPER_TIMEOUT/1000}s) - using partial results`, 'scheduler');
                  resolve([]); // Return empty array instead of rejecting
                }, SCRAPER_TIMEOUT)
              )
            ]);
          } catch (scrapeError) {
            await Logger.error(`Scraping error: ${scrapeError} - continuing with empty results`, 'scheduler');
            scrapedLiens = [];
          }
          
          if (scrapedLiens.length > 0) {
            totalLiensFound += scrapedLiens.length;

            // Note: Liens are saved immediately during scraping in the new scrapers
            // No need to call saveLiens here

            // Update county run
            await storage.updateCountyRun(countyRunId, {
              status: 'completed',
              endTime: new Date(),
              liensFound: scrapedLiens.length,
              liensProcessed: scrapedLiens.length
            });
          } else {
            await storage.updateCountyRun(countyRunId, {
              status: 'completed',
              endTime: new Date(),
              liensFound: 0,
              liensProcessed: 0
            });
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await Logger.error(`Error scraping ${county.name}: ${errorMessage}`, 'scheduler');
          
          // Log the error but don't stop the entire automation
          if (errorMessage.includes('ProtocolError') || 
              errorMessage.includes('timed out') ||
              errorMessage.includes('Browser is not open') ||
              errorMessage.includes('crashed')) {
            await Logger.warning(`Browser issue detected for ${county.name} - continuing with other counties`, 'scheduler');
          }
          
          // Update county run as completed with 0 liens (partial success)
          if (countyRunId) {
            await storage.updateCountyRun(countyRunId, {
              status: 'completed',
              endTime: new Date(),
              liensFound: 0,
              liensProcessed: 0,
              errorMessage: `Completed with error: ${errorMessage}`
            });
          }
          
          // Continue processing other counties instead of failing entirely
          await Logger.info('Continuing automation despite error', 'scheduler');
          
          // For non-critical errors, continue with other counties
          if (countyRunId) {
            await storage.updateCountyRun(countyRunId, {
              status: 'failed',
              endTime: new Date(),
              errorMessage: errorMessage
            });
          }
        }
      }

      // Step 3: Get all scraped liens and check for PDF failures
      // Check BOTH in-memory liens (newly scraped) AND database liens (pending status with PDFs)
      let allLiensFromScrapers: any[] = [];
      let liensWithPDFs: any[] = [];
      let failedLiens: any[] = [];

      // Collect liens from scraper memory (newly processed this run)
      for (const scraper of allScrapers) {
        if (scraper.liens && scraper.liens.length > 0) {
          allLiensFromScrapers = allLiensFromScrapers.concat(scraper.liens);
        }
      }

      await Logger.info(`In-memory liens from scrapers: ${allLiensFromScrapers.length}`, 'scheduler');

      // ALSO check database for pending liens that might have been saved during scraping
      // This handles the case where duplicates were skipped but liens are in DB
      const pendingDbLiens = await storage.getLiensByStatus('pending');
      await Logger.info(`Pending liens in database: ${pendingDbLiens.length}`, 'scheduler');

      // Separate liens with successful PDFs from those without
      // First check in-memory liens
      for (const lien of allLiensFromScrapers) {
        if (lien.documentUrl && lien.documentUrl.includes('/api/pdf/')) {
          liensWithPDFs.push(lien);
        } else {
          failedLiens.push(lien);
          await Logger.warning(`PDF download failed for lien ${lien.recordingNumber}`, 'scheduler');
        }
      }

      // Now check database pending liens (avoid duplicates from in-memory)
      const inMemoryRecordingNumbers = new Set(allLiensFromScrapers.map((l: any) => l.recordingNumber));

      for (const dbLien of pendingDbLiens) {
        // Skip if we already have this lien from in-memory
        if (inMemoryRecordingNumbers.has(dbLien.recordingNumber)) {
          continue;
        }

        // Check if this DB lien has a valid PDF URL
        const pdfUrl = dbLien.pdfUrl || dbLien.documentUrl;
        if (pdfUrl && pdfUrl.includes('/api/pdf/')) {
          liensWithPDFs.push({
            recordingNumber: dbLien.recordingNumber,
            recordingDate: dbLien.recordDate,
            documentUrl: pdfUrl,
            countyId: dbLien.countyId,
            status: dbLien.status
          });
        } else {
          // DB lien without valid PDF
          failedLiens.push({
            recordingNumber: dbLien.recordingNumber,
            documentUrl: pdfUrl || 'none'
          });
        }
      }

      await Logger.info(`Total liens with PDFs: ${liensWithPDFs.length}, Failed: ${failedLiens.length}`, 'scheduler');

      totalLiensProcessed = liensWithPDFs.length;

      // Step 4: Check if we have 100% success rate before syncing to Airtable
      // Only halt if there are NEW failed liens (from this scrape run), not existing DB liens
      const newlyFailedLiens = failedLiens.filter((l: any) =>
        allLiensFromScrapers.some((m: any) => m.recordingNumber === l.recordingNumber)
      );

      if (newlyFailedLiens.length > 0) {
        // HALT: Do not push to Airtable if any NEW PDFs failed
        await Logger.error(
          `HALTING Airtable sync: ${newlyFailedLiens.length} of ${allLiensFromScrapers.length} NEW liens failed PDF download. ` +
          `Failed liens: ${newlyFailedLiens.map((l: any) => l.recordingNumber).join(', ')}`,
          'scheduler'
        );

        // Update automation run with partial failure status
        await storage.updateAutomationRun(runId, {
          status: 'needs_review',
          endTime: new Date(),
          liensFound: totalLiensFound,
          liensProcessed: 0, // 0 because we didn't push to Airtable
          errorMessage: `${newlyFailedLiens.length} liens failed PDF download - Airtable sync halted pending review`
        });

        // Store failed liens for manual review
        await storage.setFailedLiens(newlyFailedLiens);

        await Logger.warning(
          `Automation needs review: Found ${allLiensFromScrapers.length} new liens, ${liensWithPDFs.length} total with PDFs, ` +
          `${newlyFailedLiens.length} newly failed. Airtable sync HALTED. Manual review required.`,
          'scheduler'
        );

        // Exit early without pushing to Airtable
        return;
      }

      // Only sync to Airtable if we have liens with PDFs
      if (liensWithPDFs.length > 0) {
        await Logger.info(`${liensWithPDFs.length} liens have PDFs - proceeding with Airtable sync`, 'scheduler');

        // Transform liens to match Airtable service expectations
        const liensForAirtable = liensWithPDFs.map((lien: any) => ({
          recordingNumber: lien.recordingNumber,
          recordingDate: lien.recordingDate,
          documentUrl: lien.documentUrl,
          countyId: lien.countyId || '1',
          pdfUrl: lien.documentUrl, // Ensure pdfUrl is set for Airtable service
          status: 'pending'
        }));
        
        await this.airtableService.syncLiensToAirtable(liensForAirtable);
      }

      // Step 5: Update automation run status
      await storage.updateAutomationRun(runId, {
        status: 'completed',
        endTime: new Date(),
        liensFound: totalLiensFound,
        liensProcessed: totalLiensProcessed,
        liensOver20k: 0 // Not tracking amounts anymore
      });

      await Logger.success(`Automation completed successfully. Found ${totalLiensFound} liens across ${activeCounties.length} counties, pushed ${totalLiensProcessed} to Airtable`, 'scheduler');

      // Cleanup all scrapers
      for (const scraper of allScrapers) {
        if (scraper.cleanup) {
          await scraper.cleanup();
        }
      }

      // TODO: Send Slack notification
      // TODO: Generate mailers for liens with addresses

    } catch (error) {
      await Logger.error(`Automation failed: ${error}`, 'scheduler');
      
      await storage.updateAutomationRun(runId, {
        status: 'failed',
        endTime: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });

    } finally {
      this.isRunning = false;
      this.shouldStop = false;
      this.currentScrapers = [];
      this.currentRunId = null;
    }
  }

  isAutomationRunning(): boolean {
    return this.isRunning;
  }

  async stopAutomation(): Promise<void> {
    if (!this.isRunning) {
      await Logger.warning('No automation running to stop', 'scheduler');
      return;
    }

    this.shouldStop = true;
    await Logger.info('Stop requested - stopping automation gracefully', 'scheduler');

    // Close all scrapers
    for (const scraper of this.currentScrapers) {
      try {
        if (scraper.cleanup) {
          await scraper.cleanup();
        }
      } catch (error) {
        await Logger.error(`Error closing scraper: ${error}`, 'scheduler');
      }
    }

    // Update the current run status
    if (this.currentRunId) {
      await storage.updateAutomationRun(this.currentRunId, {
        status: 'stopped',
        endTime: new Date(),
        errorMessage: 'Stopped by user'
      });
    }

    // Reset state
    this.isRunning = false;
    this.shouldStop = false;
    this.currentScrapers = [];
    this.currentRunId = null;

    await Logger.info('Automation stopped successfully', 'scheduler');
  }

  getAutomationStatus() {
    return storage.getLatestAutomationRun();
  }
}
