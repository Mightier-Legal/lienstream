import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, decimal, boolean, jsonb, index, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enum for timezone
export const timezoneEnum = pgEnum('timezone_enum', [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles'
]);

// Session storage table for authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const liens = pgTable("liens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countyId: varchar("county_id").notNull().references(() => counties.id),
  recordingNumber: text("recording_number").notNull().unique(),
  recordDate: timestamp("record_date").notNull(),
  debtorName: text("debtor_name").notNull(),
  debtorAddress: text("debtor_address"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  creditorName: text("creditor_name"),
  creditorAddress: text("creditor_address"),
  documentUrl: text("document_url"),
  pdfUrl: text("pdf_url"), // Local PDF URL for stored PDFs
  status: text("status").notNull().default("pending"), // pending, processing, synced, mailer_sent, completed
  failureReason: text("failure_reason"), // Reason for sync failure if any
  airtableRecordId: text("airtable_record_id"),
  enrichmentData: jsonb("enrichment_data"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const automationRuns = pgTable("automation_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // scheduled, manual
  status: text("status").notNull(), // running, completed, failed
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  liensFound: integer("liens_found").default(0),
  liensProcessed: integer("liens_processed").default(0),
  liensOver20k: integer("liens_over_20k").default(0),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
});

export const systemLogs = pgTable("system_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  level: text("level").notNull(), // info, warning, error, success
  message: text("message").notNull(),
  component: text("component").notNull(), // scraper, airtable, mailer, etc.
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// Schedule settings table - must be defined before counties since counties references it
export const scheduleSettings = pgTable("schedule_settings", {
  id: varchar("id", { length: 255 }).primaryKey().default('global'),
  name: text("name").notNull().default('Default Schedule'), // Human-readable name
  hour: integer("hour").notNull().default(5),
  minute: integer("minute").notNull().default(0),
  timezone: timezoneEnum("timezone").notNull().default('America/New_York'),
  skipWeekends: boolean("skip_weekends").notNull().default(false),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const counties = pgTable("counties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  state: text("state").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  config: jsonb("config").notNull(), // Stores scraping configuration
  airtableCountyId: text("airtable_county_id"), // Airtable record ID for this county (used in linked record field)
  scheduleSettingsId: varchar("schedule_settings_id", { length: 255 }).references(() => scheduleSettings.id), // Which schedule to use
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const countyRuns = pgTable("county_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countyId: varchar("county_id").notNull().references(() => counties.id),
  automationRunId: varchar("automation_run_id").notNull().references(() => automationRuns.id),
  status: text("status").notNull(), // running, completed, failed
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  liensFound: integer("liens_found").default(0),
  liensProcessed: integer("liens_processed").default(0),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertLienSchema = createInsertSchema(liens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAutomationRunSchema = createInsertSchema(automationRuns).omit({
  id: true,
});

export const insertSystemLogSchema = createInsertSchema(systemLogs).omit({
  id: true,
  timestamp: true,
});

export const insertCountySchema = createInsertSchema(counties).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCountyRunSchema = createInsertSchema(countyRuns).omit({
  id: true,
});

export const insertScheduleSettingsSchema = createInsertSchema(scheduleSettings).omit({
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertLien = z.infer<typeof insertLienSchema>;
export type Lien = typeof liens.$inferSelect;

export type InsertAutomationRun = z.infer<typeof insertAutomationRunSchema>;
export type AutomationRun = typeof automationRuns.$inferSelect;

export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;
export type SystemLog = typeof systemLogs.$inferSelect;

export type InsertCounty = z.infer<typeof insertCountySchema>;
export type County = typeof counties.$inferSelect;

export type InsertCountyRun = z.infer<typeof insertCountyRunSchema>;
export type CountyRun = typeof countyRuns.$inferSelect;

export type InsertScheduleSettings = z.infer<typeof insertScheduleSettingsSchema>;
export type ScheduleSettings = typeof scheduleSettings.$inferSelect;

// App Settings table for storing environment variables and secrets
export const appSettings = pgTable("app_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  isSecret: boolean("is_secret").notNull().default(false),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AppSettings = typeof appSettings.$inferSelect;

// County Configuration Interface
export interface CountyConfig {
  scrapeType: 'puppeteer' | 'api' | 'selenium';
  baseUrl: string;
  searchUrl: string;
  documentUrlPattern: string;
  selectors: {
    documentTypeField?: string;
    documentTypeValue?: string;
    startDateField?: string;
    endDateField?: string;
    searchButton?: string;
    resultsTable?: string;
    recordingNumberLinks?: string;
    pdfDownloadButton?: string;
  };
  parsing: {
    amountPattern: string;
    debtorPattern: string;
    creditorPattern: string;
    addressPattern: string;
    datePattern?: string;
  };
  delays: {
    pageLoad: number;
    betweenRequests: number;
    pdfLoad: number;
  };
  headers?: Record<string, string>;
  authentication?: {
    type: 'none' | 'basic' | 'session';
    credentials?: Record<string, string>;
  };
}
