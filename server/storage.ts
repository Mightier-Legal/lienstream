import { 
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
import { randomUUID } from "crypto";

export interface IStorage {
  // Schedule configuration
  getScheduleConfig(): Promise<{ cronExpression: string; hour: number; minute: number; timezone: string; updatedAt: Date } | null>;
  saveScheduleConfig(config: { cronExpression: string; hour: number; minute: number; timezone: string; updatedAt: Date }): Promise<void>;
  
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Lien methods
  getLien(id: string): Promise<Lien | undefined>;
  getLienById(id: string): Promise<Lien | undefined>;
  getLienByRecordingNumber(recordingNumber: string): Promise<Lien | undefined>;
  getLiensByStatus(status: string): Promise<Lien[]>;
  createLien(lien: InsertLien): Promise<Lien>;
  updateLienStatus(recordingNumber: string, status: string): Promise<void>;
  updateLienAirtableId(recordingNumber: string, airtableRecordId: string): Promise<void>;
  getRecentLiens(limit: number): Promise<Lien[]>;
  getLiensCount(): Promise<number>;
  getTodaysLiensCount(): Promise<number>;
  
  // Automation run methods
  createAutomationRun(run: InsertAutomationRun): Promise<string>;
  updateAutomationRun(id: string, updates: Partial<AutomationRun>): Promise<void>;
  getRecentAutomationRuns(limit: number): Promise<AutomationRun[]>;
  getLatestAutomationRun(): Promise<AutomationRun | undefined>;
  
  // System log methods
  createSystemLog(log: InsertSystemLog): Promise<SystemLog>;
  getRecentSystemLogs(limit: number): Promise<SystemLog[]>;
  
  // County methods
  getCounty(id: string): Promise<County | undefined>;
  getCountiesByState(state: string): Promise<County[]>;
  getActiveCounties(): Promise<County[]>;
  createCounty(county: InsertCounty): Promise<County>;
  updateCounty(id: string, updates: Partial<County>): Promise<void>;
  
  // County run methods
  createCountyRun(run: InsertCountyRun): Promise<string>;
  updateCountyRun(id: string, updates: Partial<CountyRun>): Promise<void>;
  getCountyRunsByAutomationRun(automationRunId: string): Promise<CountyRun[]>;
  
  // Dashboard stats
  getDashboardStats(): Promise<{
    todaysLiens: number;
    airtableSynced: number;
    mailersSent: number;
    activeLeads: number;
  }>;
  
  // Failed liens tracking for manual review
  setFailedLiens(liens: any[]): Promise<void>;
  getFailedLiens(): Promise<any[]>;

  // Operations page methods
  getStalePendingLiens(hoursOld: number): Promise<Lien[]>;
  markStalePendingLiens(hoursOld: number): Promise<number>;
  findDuplicateRecordingNumbers(): Promise<{recordingNumber: string; count: number; statuses: string[]}[]>;
  getLiensCountByStatus(): Promise<{status: string; count: number}[]>;
  bulkUpdateLienStatus(lienIds: string[], newStatus: string): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private liens: Map<string, Lien>;
  private automationRuns: Map<string, AutomationRun>;
  private systemLogs: Map<string, SystemLog>;
  private counties: Map<string, County>;
  private countyRuns: Map<string, CountyRun>;
  private scheduleConfig: { cronExpression: string; hour: number; minute: number; timezone: string; updatedAt: Date } | null = null;
  private failedLiens: any[] = [];

  constructor() {
    this.users = new Map();
    this.liens = new Map();
    this.automationRuns = new Map();
    this.systemLogs = new Map();
    this.counties = new Map();
    this.countyRuns = new Map();
    
    // Initialize with Arizona counties by default
    this.initializeDefaultCounties();
  }

  // Schedule configuration
  async getScheduleConfig(): Promise<{ cronExpression: string; hour: number; minute: number; timezone: string; updatedAt: Date } | null> {
    return this.scheduleConfig;
  }

  async saveScheduleConfig(config: { cronExpression: string; hour: number; minute: number; timezone: string; updatedAt: Date }): Promise<void> {
    this.scheduleConfig = config;
  }

  private initializeDefaultCounties() {
    // Maricopa County
    const maricopaId = randomUUID();
    const maricopa: County = {
      id: maricopaId,
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
          addressPattern: '(\\d+.*?(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Circle|Cir|Court|Ct|Way).*?(?:AZ|Arizona).*?\\d{5})'
        },
        delays: {
          pageLoad: 2000,
          betweenRequests: 1000,
          pdfLoad: 2000
        },
        authentication: {
          type: 'none'
        }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.counties.set(maricopaId, maricopa);

    // Pima County
    const pimaId = randomUUID();
    const pima: County = {
      id: pimaId,
      name: "Pima County",
      state: "Arizona",
      isActive: false,
      config: {
        scrapeType: 'puppeteer',
        baseUrl: 'https://pimacountyaz-web.tylerhost.net',
        searchUrl: 'https://pimacountyaz-web.tylerhost.net/web/login/search',
        documentUrlPattern: 'https://pimacountyaz-web.tylerhost.net/web/document/{recordingNumber}?search={searchId}',
        selectors: {
          documentTypeField: 'select[name="tp"]',
          documentTypeValue: 'HOSPITAL LIEN',
          startDateField: 'input[name="rd1"]',
          endDateField: 'input[name="rd2"]',
          searchButton: 'input[type="submit"][value="SEARCH"]',
          resultsTable: '.search-results',
          recordingNumberLinks: '.search-results tr td a'
        },
        parsing: {
          amountPattern: 'Amount claimed due for care of patient as of date of recording[:\\s]*\\$?([\\d,]+\\.?\\d*)',
          debtorPattern: 'Debtor[:\\s]*(.*?)(?:\\n|Address|$)',
          creditorPattern: 'Creditor[:\\s]*(.*?)(?:\\n|Address|$)',
          addressPattern: '(\\d+.*?(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Circle|Cir|Court|Ct|Way).*?(?:AZ|Arizona).*?\\d{5})'
        },
        delays: {
          pageLoad: 3000,
          betweenRequests: 1500,
          pdfLoad: 3000
        },
        authentication: {
          type: 'none'
        }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.counties.set(pimaId, pima);

    // Pinal County  
    const pinalId = randomUUID();
    const pinal: County = {
      id: pinalId,
      name: "Pinal County",
      state: "Arizona",
      isActive: false,
      config: {
        scrapeType: 'puppeteer',
        baseUrl: 'https://acclaim.pinalcountyaz.gov',
        searchUrl: 'https://acclaim.pinalcountyaz.gov/AcclaimWeb/search',
        documentUrlPattern: 'https://acclaim.pinalcountyaz.gov/AcclaimWeb/Details/',
        selectors: {
          documentTypeField: 'select[id*="DocType"]',
          documentTypeValue: 'LIEN H - HEALTH CARE, HOSPITAL LIEN',
          startDateField: 'input[id*="startDate"]',
          endDateField: 'input[id*="endDate"]',
          searchButton: 'input[type="submit"][value*="Search"]',
          resultsTable: '.search-results',
          recordingNumberLinks: '.search-results tr td a',
          lightboxTrigger: '.document-link',
          lightboxContent: '.lightbox-content, .modal-content, .popup-content'
        },
        parsing: {
          amountPattern: 'Amount claimed due for care of patient as of date of recording[:\\s]*\\$?([\\d,]+\\.?\\d*)',
          debtorPattern: 'Debtor[:\\s]*(.*?)(?:\\n|Address|$)',
          creditorPattern: 'Creditor[:\\s]*(.*?)(?:\\n|Address|$)',
          addressPattern: '(\\d+.*?(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Circle|Cir|Court|Ct|Way).*?(?:AZ|Arizona).*?\\d{5})'
        },
        delays: {
          pageLoad: 4000,
          betweenRequests: 2000,
          pdfLoad: 4000,
          lightboxWait: 3000,
          lightboxLoad: 2000
        },
        authentication: {
          type: 'none'
        }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.counties.set(pinalId, pinal);
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Lien methods
  async getLien(id: string): Promise<Lien | undefined> {
    return this.liens.get(id);
  }

  async getLienById(id: string): Promise<Lien | undefined> {
    return this.liens.get(id);
  }

  async getLienByRecordingNumber(recordingNumber: string): Promise<Lien | undefined> {
    return Array.from(this.liens.values()).find(
      (lien) => lien.recordingNumber === recordingNumber
    );
  }

  async getLiensByStatus(status: string): Promise<Lien[]> {
    return Array.from(this.liens.values()).filter(
      (lien) => lien.status === status
    );
  }

  async createLien(insertLien: InsertLien): Promise<Lien> {
    const id = randomUUID();
    const now = new Date();
    const lien: Lien = {
      ...insertLien,
      id,
      status: insertLien.status || 'pending',
      airtableRecordId: null,
      enrichmentData: null,
      debtorAddress: insertLien.debtorAddress || null,
      creditorName: insertLien.creditorName || null,
      creditorAddress: insertLien.creditorAddress || null,
      documentUrl: insertLien.documentUrl || null,
      createdAt: now,
      updatedAt: now,
    };
    this.liens.set(id, lien);
    return lien;
  }

  async updateLienStatus(recordingNumber: string, status: string): Promise<void> {
    const lien = await this.getLienByRecordingNumber(recordingNumber);
    if (lien) {
      lien.status = status;
      lien.updatedAt = new Date();
      this.liens.set(lien.id, lien);
    }
  }

  async updateLienAirtableId(recordingNumber: string, airtableRecordId: string): Promise<void> {
    const lien = await this.getLienByRecordingNumber(recordingNumber);
    if (lien) {
      lien.airtableRecordId = airtableRecordId;
      lien.updatedAt = new Date();
      this.liens.set(lien.id, lien);
    }
  }

  async getRecentLiens(limit: number): Promise<Lien[]> {
    return Array.from(this.liens.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getLiensCount(): Promise<number> {
    return this.liens.size;
  }

  async getTodaysLiensCount(): Promise<number> {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // Get today's date as YYYY-MM-DD
    
    // Count liens based on recordDate, not createdAt
    // Also ensure no duplicates by using a Set of recording numbers
    const uniqueRecordingNumbers = new Set<string>();
    
    Array.from(this.liens.values()).forEach(lien => {
      // Check if recordDate matches today
      const lienDateStr = new Date(lien.recordDate).toISOString().split('T')[0];
      if (lienDateStr === todayStr) {
        uniqueRecordingNumbers.add(lien.recordingNumber);
      }
    });
    
    return uniqueRecordingNumbers.size;
  }

  // Automation run methods
  async createAutomationRun(insertRun: InsertAutomationRun): Promise<string> {
    const id = randomUUID();
    const run: AutomationRun = {
      ...insertRun,
      id,
      endTime: null,
      liensFound: insertRun.liensFound || 0,
      liensProcessed: insertRun.liensProcessed || 0,
      liensOver20k: insertRun.liensOver20k || 0,
      errorMessage: null,
      metadata: insertRun.metadata || null,
    };
    this.automationRuns.set(id, run);
    return id;
  }

  async updateAutomationRun(id: string, updates: Partial<AutomationRun>): Promise<void> {
    const run = this.automationRuns.get(id);
    if (run) {
      Object.assign(run, updates);
      this.automationRuns.set(id, run);
    }
  }

  async getRecentAutomationRuns(limit: number): Promise<AutomationRun[]> {
    return Array.from(this.automationRuns.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  async getLatestAutomationRun(): Promise<AutomationRun | undefined> {
    const runs = await this.getRecentAutomationRuns(1);
    return runs[0];
  }

  // System log methods
  async createSystemLog(insertLog: InsertSystemLog): Promise<SystemLog> {
    const id = randomUUID();
    const log: SystemLog = {
      ...insertLog,
      id,
      metadata: insertLog.metadata || null,
      timestamp: new Date(),
    };
    this.systemLogs.set(id, log);
    return log;
  }

  async getRecentSystemLogs(limit: number): Promise<SystemLog[]> {
    return Array.from(this.systemLogs.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Dashboard stats
  async getDashboardStats(): Promise<{
    todaysLiens: number;
    airtableSynced: number;
    mailersSent: number;
    activeLeads: number;
  }> {
    const todaysLiens = await this.getTodaysLiensCount();
    const syncedLiens = await this.getLiensByStatus('synced');
    const mailerSentLiens = await this.getLiensByStatus('mailer_sent');
    const allLiens = Array.from(this.liens.values());
    
    return {
      todaysLiens,
      airtableSynced: syncedLiens.length,
      mailersSent: mailerSentLiens.length,
      activeLeads: allLiens.filter(l => l.status === 'synced' || l.status === 'mailer_sent').length,
    };
  }

  // County methods
  async getCounty(id: string): Promise<County | undefined> {
    return this.counties.get(id);
  }

  async getCountiesByState(state: string): Promise<County[]> {
    return Array.from(this.counties.values()).filter(county => county.state === state);
  }

  async getActiveCounties(): Promise<County[]> {
    return Array.from(this.counties.values()).filter(county => county.isActive);
  }

  async createCounty(insertCounty: InsertCounty): Promise<County> {
    const id = randomUUID();
    const now = new Date();
    const county: County = {
      ...insertCounty,
      id,
      isActive: insertCounty.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.counties.set(id, county);
    return county;
  }

  async updateCounty(id: string, updates: Partial<County>): Promise<void> {
    const county = this.counties.get(id);
    if (county) {
      Object.assign(county, { ...updates, updatedAt: new Date() });
      this.counties.set(id, county);
    }
  }

  // County run methods
  async createCountyRun(insertRun: InsertCountyRun): Promise<string> {
    const id = randomUUID();
    const run: CountyRun = {
      ...insertRun,
      id,
      endTime: null,
      liensFound: insertRun.liensFound || 0,
      liensProcessed: insertRun.liensProcessed || 0,
      errorMessage: null,
      metadata: insertRun.metadata || null,
    };
    this.countyRuns.set(id, run);
    return id;
  }

  async updateCountyRun(id: string, updates: Partial<CountyRun>): Promise<void> {
    const run = this.countyRuns.get(id);
    if (run) {
      Object.assign(run, updates);
      this.countyRuns.set(id, run);
    }
  }

  async getCountyRunsByAutomationRun(automationRunId: string): Promise<CountyRun[]> {
    return Array.from(this.countyRuns.values()).filter(
      run => run.automationRunId === automationRunId
    );
  }

  // Helper method to get default county (Maricopa)
  async getDefaultCounty(): Promise<County> {
    const counties = await this.getActiveCounties();
    return counties.find(c => c.name === "Maricopa County") || counties[0];
  }
  
  // Failed liens tracking
  async setFailedLiens(liens: any[]): Promise<void> {
    this.failedLiens = liens;
  }

  async getFailedLiens(): Promise<any[]> {
    return this.failedLiens;
  }

  // Operations page methods
  async getStalePendingLiens(hoursOld: number = 24): Promise<Lien[]> {
    const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    return Array.from(this.liens.values()).filter(
      lien => lien.status === 'pending' && lien.createdAt < cutoffTime
    );
  }

  async markStalePendingLiens(hoursOld: number = 24): Promise<number> {
    const staleLiens = await this.getStalePendingLiens(hoursOld);
    for (const lien of staleLiens) {
      lien.status = 'stale';
      lien.updatedAt = new Date();
      this.liens.set(lien.id, lien);
    }
    return staleLiens.length;
  }

  async findDuplicateRecordingNumbers(): Promise<{recordingNumber: string; count: number; statuses: string[]}[]> {
    const recordingNumberMap = new Map<string, {count: number; statuses: Set<string>}>();

    for (const lien of this.liens.values()) {
      const existing = recordingNumberMap.get(lien.recordingNumber);
      if (existing) {
        existing.count++;
        existing.statuses.add(lien.status);
      } else {
        recordingNumberMap.set(lien.recordingNumber, {
          count: 1,
          statuses: new Set([lien.status])
        });
      }
    }

    return Array.from(recordingNumberMap.entries())
      .filter(([_, data]) => data.count > 1)
      .map(([recordingNumber, data]) => ({
        recordingNumber,
        count: data.count,
        statuses: Array.from(data.statuses)
      }));
  }

  async getLiensCountByStatus(): Promise<{status: string; count: number}[]> {
    const statusCounts = new Map<string, number>();

    for (const lien of this.liens.values()) {
      statusCounts.set(lien.status, (statusCounts.get(lien.status) || 0) + 1);
    }

    return Array.from(statusCounts.entries()).map(([status, count]) => ({
      status,
      count
    }));
  }

  async bulkUpdateLienStatus(lienIds: string[], newStatus: string): Promise<number> {
    let updated = 0;
    for (const id of lienIds) {
      const lien = this.liens.get(id);
      if (lien) {
        lien.status = newStatus;
        lien.updatedAt = new Date();
        this.liens.set(id, lien);
        updated++;
      }
    }
    return updated;
  }
}

// Import database storage
import { DatabaseStorage } from "./database-storage";

// Use database storage instead of memory storage
export const storage = new DatabaseStorage();
