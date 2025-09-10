import { 
  users,
  liens,
  automationRuns,
  systemLogs,
  counties,
  countyRuns,
  type User, 
  type InsertUser, 
  type Lien, 
  type InsertLien,
  type AutomationRun,
  type InsertAutomationRun,
  type SystemLog,
  type InsertSystemLog,
  type County,
  type InsertCounty,
  type CountyRun,
  type InsertCountyRun
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, desc, and, gte, sql, or } from "drizzle-orm";
import { IStorage } from "./storage";
import { randomUUID } from "crypto";

// Database operation retry helper
async function retryDatabaseOperation<T>(
  operation: () => Promise<T>, 
  operationName: string, 
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      console.error(`[Database] ${operationName} attempt ${attempt} failed:`, error.message);
      
      // Check if this is a transient error that might be recoverable
      const isTransientError = 
        error.code === '57P01' || // admin_shutdown
        error.code === '57P02' || // crash_shutdown  
        error.code?.startsWith('08') || // Connection exception class
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND';
      
      if (!isTransientError || attempt === maxRetries) {
        throw error;
      }
      
      // Wait with exponential backoff before retry
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`[Database] Retrying ${operationName} in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

export class DatabaseStorage implements IStorage {
  private scheduleConfig: { cronExpression: string; hour: number; minute: number; timezone: string; updatedAt: Date } | null = null;

  constructor() {
    // Initialize default counties if not exists
    this.initializeDefaultCounties();
  }

  // Schedule configuration (kept in memory for now)
  async getScheduleConfig(): Promise<{ cronExpression: string; hour: number; minute: number; timezone: string; updatedAt: Date } | null> {
    return this.scheduleConfig;
  }

  async saveScheduleConfig(config: { cronExpression: string; hour: number; minute: number; timezone: string; updatedAt: Date }): Promise<void> {
    this.scheduleConfig = config;
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return await retryDatabaseOperation(async () => {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    }, `getUser(${id})`);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return await retryDatabaseOperation(async () => {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user;
    }, `getUserByUsername(${username})`);
  }

  async createUser(user: InsertUser): Promise<User> {
    return await retryDatabaseOperation(async () => {
      const [newUser] = await db.insert(users).values(user).returning();
      return newUser;
    }, `createUser(${user.username})`);
  }

  // Lien methods
  async getLien(id: string): Promise<Lien | undefined> {
    return await retryDatabaseOperation(async () => {
      const [lien] = await db.select().from(liens).where(eq(liens.id, id));
      return lien;
    }, `getLien(${id})`);
  }

  async getLienById(id: string): Promise<Lien | undefined> {
    return await retryDatabaseOperation(async () => {
      const [lien] = await db.select().from(liens).where(eq(liens.id, id));
      return lien;
    }, `getLienById(${id})`);
  }

  async getLienByRecordingNumber(recordingNumber: string): Promise<Lien | undefined> {
    return await retryDatabaseOperation(async () => {
      const [lien] = await db.select().from(liens).where(eq(liens.recordingNumber, recordingNumber));
      return lien;
    }, `getLienByRecordingNumber(${recordingNumber})`);
  }

  async getLiensByStatus(status: string): Promise<Lien[]> {
    return await retryDatabaseOperation(async () => {
      return await db.select().from(liens).where(eq(liens.status, status));
    }, `getLiensByStatus(${status})`);
  }

  async createLien(lien: InsertLien): Promise<Lien> {
    return await retryDatabaseOperation(async () => {
      // Ensure countyId is set
      const lienData = {
        ...lien,
        id: randomUUID(),
        countyId: lien.countyId || 'maricopa-county',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      console.log(`[Storage] Creating lien ${lien.recordingNumber} with county ${lienData.countyId}`);
      
      try {
        const [newLien] = await db.insert(liens).values(lienData).returning();
        console.log(`[Storage] Successfully saved lien ${lien.recordingNumber}`);
        return newLien;
      } catch (error: any) {
        // Handle unique constraint violation - lien already exists
        if (error.code === '23505') {
          console.log(`[Storage] Lien ${lien.recordingNumber} already exists, fetching existing record`);
          const existing = await db.select().from(liens).where(eq(liens.recordingNumber, lien.recordingNumber));
          if (existing.length > 0) {
            return existing[0];
          }
        }
        throw error;
      }
    }, `createLien(${lien.recordingNumber})`);
  }

  async updateLienStatus(recordingNumber: string, status: string): Promise<void> {
    await db.update(liens)
      .set({ status, updatedAt: new Date() })
      .where(eq(liens.recordingNumber, recordingNumber));
  }

  async updateLienAirtableId(recordingNumber: string, airtableRecordId: string): Promise<void> {
    await db.update(liens)
      .set({ airtableRecordId, status: 'synced', updatedAt: new Date() })
      .where(eq(liens.recordingNumber, recordingNumber));
  }

  async getRecentLiens(limit: number): Promise<Lien[]> {
    return await db.select()
      .from(liens)
      .orderBy(desc(liens.recordDate))
      .limit(limit);
  }

  async getLiensCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(liens);
    return Number(result?.count || 0);
  }

  async getTodaysLiensCount(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(liens)
      .where(gte(liens.createdAt, today));
    return Number(result?.count || 0);
  }

  // Automation run methods
  async createAutomationRun(run: InsertAutomationRun): Promise<string> {
    const id = randomUUID();
    await db.insert(automationRuns).values({
      ...run,
      id,
      startTime: new Date(),
      liensFound: 0,
      liensProcessed: 0,
      liensOver20k: 0
    });
    return id;
  }

  async updateAutomationRun(id: string, updates: Partial<AutomationRun>): Promise<void> {
    await db.update(automationRuns)
      .set(updates)
      .where(eq(automationRuns.id, id));
  }

  async getRecentAutomationRuns(limit: number): Promise<AutomationRun[]> {
    return await db.select()
      .from(automationRuns)
      .orderBy(desc(automationRuns.startTime))
      .limit(limit);
  }

  async getLatestAutomationRun(): Promise<AutomationRun | undefined> {
    const [run] = await db.select()
      .from(automationRuns)
      .orderBy(desc(automationRuns.startTime))
      .limit(1);
    return run;
  }

  // System log methods
  async createSystemLog(log: InsertSystemLog): Promise<SystemLog> {
    const [newLog] = await db.insert(systemLogs).values({
      ...log,
      id: randomUUID(),
      timestamp: new Date()
    }).returning();
    return newLog;
  }

  async getRecentSystemLogs(limit: number): Promise<SystemLog[]> {
    return await db.select()
      .from(systemLogs)
      .orderBy(desc(systemLogs.timestamp))
      .limit(limit);
  }

  // County methods
  async getCounty(id: string): Promise<County | undefined> {
    const [county] = await db.select().from(counties).where(eq(counties.id, id));
    return county;
  }

  async getCountiesByState(state: string): Promise<County[]> {
    return await db.select().from(counties).where(eq(counties.state, state));
  }

  async getActiveCounties(): Promise<County[]> {
    return await db.select().from(counties).where(eq(counties.isActive, true));
  }

  async createCounty(county: InsertCounty): Promise<County> {
    const [newCounty] = await db.insert(counties).values({
      ...county
    }).returning();
    return newCounty;
  }

  async updateCounty(id: string, updates: Partial<County>): Promise<void> {
    await db.update(counties)
      .set(updates)
      .where(eq(counties.id, id));
  }

  // County run methods
  async createCountyRun(run: InsertCountyRun): Promise<string> {
    const id = randomUUID();
    await db.insert(countyRuns).values({
      ...run,
      id,
      startTime: new Date(),
      liensFound: 0,
      liensProcessed: 0
    });
    return id;
  }

  async updateCountyRun(id: string, updates: Partial<CountyRun>): Promise<void> {
    await db.update(countyRuns)
      .set(updates)
      .where(eq(countyRuns.id, id));
  }

  async getCountyRunsByAutomationRun(automationRunId: string): Promise<CountyRun[]> {
    return await db.select()
      .from(countyRuns)
      .where(eq(countyRuns.automationRunId, automationRunId));
  }

  // Dashboard stats
  async getDashboardStats(date?: string): Promise<{
    todaysLiens: number;
    airtableSynced: number;
    mailersSent: number;
    activeLeads: number;
  }> {
    // If date is provided, get stats for that specific date
    // Otherwise get today's stats
    let startDate: Date;
    let endDate: Date;
    
    if (date) {
      startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }
    
    // Count liens by their record date (not creation date)
    const [liensResult] = await db.select({ count: sql<number>`count(*)` })
      .from(liens)
      .where(and(
        gte(liens.recordDate, startDate),
        sql`${liens.recordDate} <= ${endDate}`
      ));
    const todaysLiens = Number(liensResult?.count || 0);
    
    // Count liens synced to Airtable by record date
    const [syncedResult] = await db.select({ count: sql<number>`count(*)` })
      .from(liens)
      .where(and(
        eq(liens.status, 'synced'),
        gte(liens.recordDate, startDate),
        sql`${liens.recordDate} <= ${endDate}`
      ));
    const airtableSynced = Number(syncedResult?.count || 0);
    
    // Count mailers sent by record date
    const [mailerResult] = await db.select({ count: sql<number>`count(*)` })
      .from(liens)
      .where(and(
        or(
          eq(liens.status, 'mailer_sent'),
          eq(liens.status, 'completed')
        ),
        gte(liens.recordDate, startDate),
        sql`${liens.recordDate} <= ${endDate}`
      ));
    const mailersSent = Number(mailerResult?.count || 0);
    
    // Active leads are still within 30 days of the specified date (by record date)
    const activeDate = date ? new Date(date) : new Date();
    const thirtyDaysAgo = new Date(activeDate);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [activeResult] = await db.select({ count: sql<number>`count(*)` })
      .from(liens)
      .where(and(
        eq(liens.status, 'synced'),
        gte(liens.recordDate, thirtyDaysAgo),
        sql`${liens.recordDate} <= ${endDate}`
      ));
    const activeLeads = Number(activeResult?.count || 0);
    
    return {
      todaysLiens,
      airtableSynced,
      mailersSent,
      activeLeads
    };
  }

  private async initializeDefaultCounties() {
    try {
      // Check if Maricopa County already exists
      const existingCounties = await this.getCountiesByState("Arizona");
      
      if (existingCounties.length === 0) {
        // Initialize Maricopa County
        await this.createCounty({
          name: "Maricopa County",
          state: "Arizona",
          isActive: true,
          config: {
            scrapeType: 'puppeteer',
            baseUrl: 'https://legacy.recorder.maricopa.gov',
            searchUrl: 'https://legacy.recorder.maricopa.gov/recdocdata/',
            documentUrlPattern: 'https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/{recordingNumber}.pdf',
            selectors: {
              documentTypeField: 'select[name="ctl00$ContentPlaceHolder1$ddlDocCodes"]',
              documentTypeValue: 'MEDICAL LN-FOR MOSTMEDICAL/HOSP/CHIRO LIENTYPES',
              startDateField: '#ctl00_ContentPlaceHolder1_RadDateInputBegin',
              endDateField: '#ctl00_ContentPlaceHolder1_RadDateInputEnd',
              searchButton: '#ctl00_ContentPlaceHolder1_btnSearch2',
              resultsTable: 'table[id="ctl00_ContentPlaceHolder1_GridView1"], table[id*="ctl00"]',
              recordingNumberLinks: 'table[id="ctl00_ContentPlaceHolder1_GridView1"] tr td:first-child a[href*="pdf"]'
            },
            parsing: {
              amountPattern: 'Amount claimed due for care of patient as of date of recording[:\\s]*\\$?([\\d,]+\\.?\\d*)',
              debtorPattern: 'Debtor[:\\s]*(.*?)(?:\\n|Address|$)',
              creditorPattern: 'Creditor[:\\s]*(.*?)(?:\\n|Address|$)',
              addressPattern: 'Address[:\\s]*(.*?)(?:\\n|$)'
            }
          }
        });
        
        console.log('[Storage] Initialized Maricopa County');
      }
    } catch (error) {
      console.error('[Storage] Error initializing counties:', error);
    }
  }
}