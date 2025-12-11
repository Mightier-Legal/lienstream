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
  type InsertCountyRun,
  type ScheduleSettings,
  type InsertScheduleSettings,
  type AppSettings,
  type InsertAppSettings,
  type ScraperPlatform,
  type InsertScraperPlatform
} from "@shared/schema";

export interface IStorage {
  // Schedule configuration (now persisted in database)
  getScheduleConfig(): Promise<ScheduleSettings | null>;
  saveScheduleConfig(config: InsertScheduleSettings): Promise<ScheduleSettings>;
  
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
  updateLienByRecordingNumber(recordingNumber: string, updates: Partial<Lien>): Promise<void>;
  deleteLien(id: string): Promise<boolean>;
  deleteLiensByRecordingNumbers(recordingNumbers: string[]): Promise<number>;
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
  getAllCounties(): Promise<County[]>;
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

  // App Settings methods
  getAllAppSettings(): Promise<AppSettings[]>;
  getAppSetting(key: string): Promise<AppSettings | undefined>;
  upsertAppSetting(setting: InsertAppSettings): Promise<AppSettings>;
  deleteAppSetting(key: string): Promise<void>;

  // Scraper Platform methods
  getAllScraperPlatforms(): Promise<ScraperPlatform[]>;
  getActiveScraperPlatforms(): Promise<ScraperPlatform[]>;
  getScraperPlatform(id: string): Promise<ScraperPlatform | undefined>;
  createScraperPlatform(platform: InsertScraperPlatform): Promise<ScraperPlatform>;
  updateScraperPlatform(id: string, updates: Partial<ScraperPlatform>): Promise<void>;
}

// Import database storage
import { DatabaseStorage } from "./database-storage";

// Use database storage instead of memory storage
export const storage = new DatabaseStorage();
