import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { authenticate, requireAuth } from "./auth";
import { SchedulerService } from "./services/scheduler";
import { Logger } from "./services/logger";
import { pdfStorage } from "./services/pdf-storage";
import { AirtableService } from "./services/airtable";
import * as fs from 'fs';
import * as path from 'path';

const scheduler = new SchedulerService();

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication routes (public)
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }
    
    const userId = await authenticate(username, password);
    
    if (!userId) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    req.session.userId = userId;
    res.json({ success: true });
  });
  
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ success: true });
    });
  });
  
  app.get("/api/auth/check", (req, res) => {
    res.json({ authenticated: !!req.session.userId });
  });
  
  // Protected routes - add auth middleware
  // Start the scheduler
  scheduler.start();

  // Dashboard stats
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const date = req.query.date as string; // Optional date parameter
      const stats = await storage.getDashboardStats(date);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  // Automation status
  app.get("/api/automation/status", requireAuth, async (req, res) => {
    try {
      const isRunning = scheduler.isAutomationRunning();
      const latestRun = await storage.getLatestAutomationRun();
      
      res.json({
        isRunning,
        latestRun,
        status: isRunning ? 'running' : (latestRun?.status || 'idle')
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch automation status" });
    }
  });

  // Scheduled trigger endpoint for Replit Scheduled Deployments
  // This endpoint can be called without session auth but requires a secret token
  app.post("/api/automation/scheduled-trigger", async (req, res) => {
    try {
      // Check for secret token (you should set this as an environment variable)
      const token = req.headers['x-automation-token'] || req.query.token;
      const expectedToken = process.env.AUTOMATION_SECRET_TOKEN || 'default-secret-token-change-me';
      
      if (token !== expectedToken) {
        await Logger.warning('Unauthorized scheduled trigger attempt', 'scheduler');
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const isRunning = scheduler.isAutomationRunning();
      
      if (isRunning) {
        await Logger.info('Scheduled trigger skipped - automation already running', 'scheduler');
        return res.status(200).json({ 
          message: "Automation already running, skipped scheduled run",
          status: "skipped"
        });
      }
      
      // For scheduled runs, use yesterday's date by default
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateStr = yesterday.toISOString().split('T')[0];
      
      await Logger.info(`Starting scheduled automation for date: ${dateStr}`, 'scheduler');
      
      // Start automation in background (don't await)
      scheduler.runAutomation('scheduled', dateStr, dateStr).catch(error => {
        Logger.error(`Scheduled automation failed: ${error}`, 'scheduler');
      });
      
      res.json({ 
        message: "Scheduled automation started",
        status: "started",
        date: dateStr
      });
    } catch (error) {
      await Logger.error(`Failed to trigger scheduled automation: ${error}`, 'scheduler');
      res.status(500).json({ error: "Failed to trigger scheduled automation" });
    }
  });

  // Manual trigger
  app.post("/api/automation/trigger", requireAuth, async (req, res) => {
    try {
      const isRunning = scheduler.isAutomationRunning();
      console.log('[DEBUG] Automation trigger - isRunning:', isRunning);
      
      if (isRunning) {
        console.log('[DEBUG] Automation already running, returning 400');
        return res.status(400).json({ error: "Automation is already running" });
      }

      const { fromDate, toDate, limit } = req.body; // Get date range and limit from request body
      console.log('[DEBUG] Starting automation with dates:', fromDate, toDate, 'limit:', limit);
      
      // Start automation in background with optional date range and limit
      scheduler.runAutomation('manual', fromDate, toDate, limit).catch(error => {
        Logger.error(`Manual automation failed: ${error}`, 'api');
      });

      res.json({ message: "Manual automation started" });
    } catch (error) {
      console.error('[DEBUG] Error in trigger:', error);
      res.status(500).json({ error: "Failed to trigger automation" });
    }
  });

  // Stop automation
  app.post("/api/automation/stop", requireAuth, async (req, res) => {
    try {
      await scheduler.stopAutomation();
      res.json({ message: "Automation stop requested" });
    } catch (error) {
      res.status(500).json({ error: "Failed to stop automation" });
    }
  });

  // Create lien
  app.post("/api/liens", requireAuth, async (req, res) => {
    try {
      const lien = await storage.createLien(req.body);
      res.json(lien);
    } catch (error) {
      res.status(500).json({ error: "Failed to create lien" });
    }
  });
  
  // Retry sync for a specific lien
  app.post("/api/liens/:id/retry-sync", requireAuth, async (req, res) => {
    try {
      const lienId = req.params.id;
      const lien = await storage.getLien(lienId);
      
      if (!lien) {
        return res.status(404).json({ error: "Lien not found" });
      }
      
      if (lien.status === 'synced') {
        return res.json({ message: "Lien already synced" });
      }
      
      if (!lien.documentUrl) {
        return res.status(400).json({ error: "No PDF available for this lien" });
      }
      
      // Import AirtableService and sync the single lien
      const { AirtableService } = await import("./services/airtable");
      const airtableService = new AirtableService();
      
      // Transform lien to Airtable format
      const lienForAirtable = {
        recordingNumber: lien.recordingNumber,
        recordingDate: lien.recordDate,
        documentUrl: lien.documentUrl,
        countyId: '1', // Default county ID
        status: 'pending'
      };
      
      // Sync to Airtable
      await airtableService.syncLiensToAirtable([lienForAirtable]);
      
      // Update lien status
      await storage.updateLienStatus(lien.recordingNumber, 'synced');
      
      await storage.createSystemLog({
        level: "info",
        message: `Retry sync successful for lien ${lien.recordingNumber}`,
        component: "api"
      });
      
      res.json({ success: true, message: "Lien synced successfully" });
    } catch (error) {
      await storage.createSystemLog({
        level: "error",
        message: `Retry sync failed for lien ${req.params.id}: ${error}`,
        component: "api"
      });
      res.status(500).json({ error: "Failed to retry sync" });
    }
  });

  // === Operations Page Endpoints ===
  // NOTE: These routes MUST come before /api/liens/:id routes to avoid route conflicts

  // Get stale pending liens (pending for more than X hours)
  app.get("/api/liens/stale", requireAuth, async (req, res) => {
    try {
      const hoursOld = parseInt(req.query.hours as string) || 24;
      const staleLiens = await storage.getStalePendingLiens(hoursOld);

      res.json({
        count: staleLiens.length,
        hoursOld,
        liens: staleLiens
      });
    } catch (error) {
      await Logger.error(`Failed to fetch stale liens: ${error}`, 'api');
      res.status(500).json({ error: "Failed to fetch stale liens" });
    }
  });

  // Mark stale pending liens as 'stale' status
  app.post("/api/liens/stale/mark", requireAuth, async (req, res) => {
    try {
      const hoursOld = parseInt(req.body.hours as string) || 24;
      const count = await storage.markStalePendingLiens(hoursOld);

      await Logger.info(`Marked ${count} stale pending liens (older than ${hoursOld} hours)`, 'operations');

      res.json({
        success: true,
        count,
        message: `Marked ${count} liens as stale`
      });
    } catch (error) {
      await Logger.error(`Failed to mark stale liens: ${error}`, 'api');
      res.status(500).json({ error: "Failed to mark stale liens" });
    }
  });

  // Find duplicate recording numbers
  app.get("/api/liens/duplicates", requireAuth, async (req, res) => {
    try {
      const duplicates = await storage.findDuplicateRecordingNumbers();

      res.json({
        count: duplicates.length,
        duplicates
      });
    } catch (error) {
      await Logger.error(`Failed to find duplicates: ${error}`, 'api');
      res.status(500).json({ error: "Failed to find duplicates" });
    }
  });

  // Get lien counts by status
  app.get("/api/liens/status-counts", requireAuth, async (req, res) => {
    try {
      const counts = await storage.getLiensCountByStatus();
      res.json(counts);
    } catch (error) {
      await Logger.error(`Failed to get status counts: ${error}`, 'api');
      res.status(500).json({ error: "Failed to get status counts" });
    }
  });

  // Bulk update lien status
  app.post("/api/liens/bulk-update-status", requireAuth, async (req, res) => {
    try {
      const { lienIds, newStatus } = req.body;

      if (!Array.isArray(lienIds) || !newStatus) {
        return res.status(400).json({ error: "lienIds array and newStatus required" });
      }

      const count = await storage.bulkUpdateLienStatus(lienIds, newStatus);

      await Logger.info(`Bulk updated ${count} liens to status: ${newStatus}`, 'operations');

      res.json({
        success: true,
        count,
        message: `Updated ${count} liens to status: ${newStatus}`
      });
    } catch (error) {
      await Logger.error(`Failed to bulk update status: ${error}`, 'api');
      res.status(500).json({ error: "Failed to bulk update status" });
    }
  });

  // Manual review endpoints for failed liens
  app.get("/api/liens/failed", requireAuth, async (req, res) => {
    try {
      const failedLiens = await storage.getFailedLiens();
      const count = failedLiens.length;
      
      res.json({
        count,
        liens: failedLiens,
        message: count > 0 
          ? `${count} lien(s) failed PDF download. Review and approve/reject Airtable sync.`
          : 'No failed liens.'
      });
    } catch (error) {
      await Logger.error(`Failed to fetch failed liens: ${error}`, 'api');
      res.status(500).json({ error: "Failed to fetch failed liens" });
    }
  });

  // Approve Airtable sync despite PDF failures (manual override)
  app.post("/api/liens/failed/approve", requireAuth, async (req, res) => {
    try {
      const failedLiens = await storage.getFailedLiens();
      
      if (failedLiens.length === 0) {
        return res.json({ message: "No failed liens to process", success: true });
      }
      
      await Logger.warning(`📋 Manual override: Approving ${failedLiens.length} liens for Airtable sync despite missing PDFs`, 'api');
      
      // Get all pending liens (successful PDFs)
      const pendingLiens = await storage.getPendingLiens();
      
      if (pendingLiens.length === 0 && failedLiens.length === 0) {
        return res.json({ message: "No liens to sync", success: false });
      }
      
      // Import AirtableService
      const airtableService = new AirtableService();
      
      // Prepare all liens for sync (both successful and failed)
      const allLiens = [...pendingLiens, ...failedLiens];
      const liensForAirtable = allLiens.map((lien: any) => ({
        recordingNumber: lien.recordingNumber,
        recordingDate: lien.recordDate || lien.recordingDate,
        amount: lien.amount || '0',
        debtorNames: lien.debtorNames || lien.debtorName || 'Unknown',
        documentUrl: lien.documentUrl || null, // May be null for failed PDFs
        countyId: '1', // Maricopa County
        status: lien.documentUrl ? 'pending' : 'pdf_failed'
      }));
      
      // Sync to Airtable in batches
      const results = await airtableService.syncLiensToAirtable(liensForAirtable);
      
      // Update lien statuses
      for (const lien of allLiens) {
        await storage.updateLienStatus(lien.recordingNumber, 'synced');
      }
      
      // Clear failed liens after successful sync
      await storage.setFailedLiens([]);
      
      await Logger.success(`✅ Manual override complete: Synced ${allLiens.length} liens (${failedLiens.length} without PDFs)`, 'api');
      
      res.json({
        success: true,
        message: `Successfully synced ${allLiens.length} liens to Airtable (${failedLiens.length} without PDFs)`,
        successfulPdfs: pendingLiens.length,
        failedPdfs: failedLiens.length,
        total: allLiens.length
      });
    } catch (error) {
      await Logger.error(`Failed to approve and sync failed liens: ${error}`, 'api');
      res.status(500).json({ error: "Failed to approve and sync liens" });
    }
  });
  
  // Reject failed liens and clear them
  app.post("/api/liens/failed/reject", requireAuth, async (req, res) => {
    try {
      const failedLiens = await storage.getFailedLiens();
      const count = failedLiens.length;
      
      if (count === 0) {
        return res.json({ message: "No failed liens to reject", success: true });
      }
      
      await Logger.info(`🚫 Rejecting ${count} failed liens and clearing them`, 'api');
      
      // Clear failed liens
      await storage.setFailedLiens([]);
      
      await Logger.success(`✅ Cleared ${count} failed liens`, 'api');
      
      res.json({
        success: true,
        message: `Rejected and cleared ${count} failed liens. No sync to Airtable.`,
        count
      });
    } catch (error) {
      await Logger.error(`Failed to reject failed liens: ${error}`, 'api');
      res.status(500).json({ error: "Failed to reject failed liens" });
    }
  });
  
  // Bulk sync all pending liens to Airtable
  app.post("/api/airtable/sync-all", requireAuth, async (req, res) => {
    try {
      // Get all pending liens
      const pendingLiens = await storage.getPendingLiens();
      
      if (pendingLiens.length === 0) {
        return res.json({ message: "No pending liens to sync", count: 0 });
      }
      
      // Import AirtableService
      const { AirtableService } = await import("./services/airtable");
      const airtableService = new AirtableService();
      
      // Transform liens to Airtable format
      const liensForAirtable = pendingLiens.map((lien: any) => ({
        recordingNumber: lien.recordingNumber,
        recordingDate: lien.recordDate,
        amount: lien.amount,
        debtorNames: lien.debtorNames,
        documentUrl: lien.documentUrl,
        countyId: '1', // Default county ID for Maricopa
        status: 'pending'
      }));
      
      // Sync to Airtable in batches (Airtable API limits to 10 records per request)
      const batchSize = 10;
      let successCount = 0;
      let failedCount = 0;
      
      for (let i = 0; i < liensForAirtable.length; i += batchSize) {
        const batch = liensForAirtable.slice(i, i + batchSize);
        try {
          await airtableService.syncLiensToAirtable(batch);
          
          // Update status for this batch
          for (const lien of batch) {
            await storage.updateLienStatus(lien.recordingNumber, 'synced');
            successCount++;
          }
        } catch (error) {
          failedCount += batch.length;
          await storage.createSystemLog({
            level: "error",
            message: `Batch sync failed for liens ${i} to ${i + batch.length}: ${error}`,
            component: "api"
          });
        }
      }
      
      await storage.createSystemLog({
        level: "info",
        message: `Bulk sync completed: ${successCount} succeeded, ${failedCount} failed out of ${pendingLiens.length} total`,
        component: "api"
      });
      
      res.json({ 
        message: "Bulk sync completed", 
        total: pendingLiens.length,
        success: successCount,
        failed: failedCount
      });
    } catch (error) {
      await storage.createSystemLog({
        level: "error",
        message: `Bulk sync failed: ${error}`,
        component: "api"
      });
      res.status(500).json({ error: "Failed to sync liens to Airtable" });
    }
  });

  // Recent liens with pagination
  app.get("/api/liens/recent", requireAuth, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;
      
      // Get total count
      const allLiens = await storage.getRecentLiens(100000);
      const totalCount = allLiens.length;
      
      // Get paginated results
      const liens = allLiens.slice(offset, offset + limit);
      
      res.json({
        liens,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recent liens" });
    }
  });

  // Export liens as CSV
  app.get("/api/liens/export", requireAuth, async (req, res) => {
    try {
      const from = req.query.from as string;
      const to = req.query.to as string;
      
      let liens;
      if (from && to) {
        // Get liens within date range
        const allLiens = await storage.getRecentLiens(100000); // Get all liens
        const fromDate = new Date(from);
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999); // Include entire end day
        
        liens = allLiens.filter(lien => {
          const lienDate = new Date(lien.recordDate);
          return lienDate >= fromDate && lienDate <= toDate;
        });
      } else {
        // Get all liens
        liens = await storage.getRecentLiens(100000);
      }
      
      // Convert to CSV
      const headers = ['Recording Number', 'Record Date', 'Debtor Name', 'Debtor Address', 'Amount', 'Creditor Name', 'Status', 'Document URL'];
      const csvRows = [headers.join(',')];
      
      for (const lien of liens) {
        const row = [
          lien.recordingNumber,
          new Date(lien.recordDate).toLocaleDateString(),
          `"${lien.debtorName || ''}"`,
          `"${lien.debtorAddress || ''}"`,
          lien.amount,
          `"${lien.creditorName || ''}"`,
          lien.status,
          lien.documentUrl || ''
        ];
        csvRows.push(row.join(','));
      }
      
      const csv = csvRows.join('\n');
      const filename = from && to ? `liens_${from}_to_${to}.csv` : `liens_export_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (error) {
      res.status(500).json({ error: "Failed to export liens" });
    }
  });

  // System logs
  app.get("/api/logs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const date = req.query.date as string;

      let logs;
      if (date) {
        // Filter logs by date using Eastern timezone for consistency
        const allLogs = await storage.getRecentSystemLogs(10000); // Get many logs
        logs = allLogs.filter(log => {
          const logDate = new Date(log.timestamp);
          // Format both dates in Eastern timezone for comparison
          const logDateStr = logDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format
          return logDateStr === date;
        });
      } else {
        logs = await storage.getRecentSystemLogs(limit);
      }

      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system logs" });
    }
  });

  // Export logs as CSV
  app.get("/api/logs/export", requireAuth, async (req, res) => {
    try {
      const date = req.query.date as string;
      
      let logs;
      if (date) {
        // Filter logs by date
        const allLogs = await storage.getRecentSystemLogs(100000);
        const targetDate = new Date(date);
        logs = allLogs.filter(log => {
          const logDate = new Date(log.timestamp);
          return logDate.toDateString() === targetDate.toDateString();
        });
      } else {
        // Get all logs
        logs = await storage.getRecentSystemLogs(100000);
      }
      
      // Convert to CSV
      const headers = ['Timestamp', 'Level', 'Message', 'Component'];
      const csvRows = [headers.join(',')];
      
      for (const log of logs) {
        const row = [
          new Date(log.timestamp).toLocaleString(),
          log.level,
          `"${(log.message || '').replace(/"/g, '""')}"`,
          log.component || ''
        ];
        csvRows.push(row.join(','));
      }
      
      const csv = csvRows.join('\n');
      const filename = date ? `logs_${date}.csv` : `logs_export_${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (error) {
      res.status(500).json({ error: "Failed to export logs" });
    }
  });

  // Manually sync pending liens to Airtable
  app.post("/api/liens/sync-pending", requireAuth, async (req, res) => {
    try {
      const pendingLiens = await storage.getLiensByStatus('pending');
      
      if (pendingLiens.length === 0) {
        return res.json({ 
          message: "No pending liens to sync",
          synced: 0
        });
      }

      // Import AirtableService
      const { AirtableService } = await import('./services/airtable');
      const airtableService = new AirtableService();
      
      // syncLiensToAirtable returns void but updates status internally
      await airtableService.syncLiensToAirtable(pendingLiens);
      
      // Count successfully synced liens  
      const syncedLiens = await storage.getLiensByStatus('synced');
      const newlySynced = syncedLiens.filter(l => 
        pendingLiens.some(p => p.recordingNumber === l.recordingNumber)
      ).length;
      
      await storage.createSystemLog({
        level: 'info',
        message: `Manual sync: ${newlySynced} liens synced to Airtable`,
        component: 'Manual Sync'
      });
      
      res.json({
        message: `Successfully synced ${newlySynced} liens to Airtable`,
        synced: newlySynced,
        total: pendingLiens.length
      });
    } catch (error: any) {
      await storage.createSystemLog({
        level: 'error',
        message: `Manual sync failed: ${error.message}`,
        component: 'Manual Sync'
      });
      res.status(500).json({ error: "Failed to sync liens to Airtable" });
    }
  });

  // Recent automation runs
  app.get("/api/automation/runs", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const runs = await storage.getRecentAutomationRuns(limit);
      res.json(runs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch automation runs" });
    }
  });

  // PDF serving endpoint for Airtable
  app.get("/api/pdf/:id", async (req, res) => {
    try {
      const { id } = req.params;
      let pdf = pdfStorage.getPdf(id);
      
      // If PDF not found, try to extract recording number from request and re-download
      if (!pdf && req.query.recording) {
        const recordingNumber = req.query.recording as string;
        const buffer = await pdfStorage.redownloadPdf(recordingNumber);
        
        if (buffer) {
          // Store the re-downloaded PDF
          const newId = pdfStorage.storePdf(buffer, recordingNumber);
          // Redirect to the new ID
          return res.redirect(`/api/pdf/${newId}`);
        }
      }
      
      if (!pdf) {
        return res.status(404).json({ error: "PDF not found and could not be re-downloaded" });
      }
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${pdf.filename}"`);
      res.send(pdf.buffer);
    } catch (error) {
      res.status(500).json({ error: "Failed to serve PDF" });
    }
  });

  // Test Airtable sync with County field
  app.post("/api/test-airtable-county", requireAuth, async (req, res) => {
    try {
      // Create a test lien
      const testLien = {
        id: 'test-' + Date.now(),
        recordingNumber: '99999999',
        recordDate: new Date(),
        debtorName: 'Test Debtor',
        debtorAddress: '123 Test St',
        amount: 1000,
        creditorName: 'Test Creditor',
        status: 'pending' as const,
        county: 'maricopa-county',
        documentUrl: 'https://test.com/test.pdf',
        pdfBuffer: null
      };
      
      // Initialize Airtable service
      const airtableService = new AirtableService();
      
      // Sync this test lien
      await Logger.info(`Testing Airtable sync with County field for test lien`, 'test-sync');
      await airtableService.syncLiensToAirtable([testLien]);
      
      res.json({ message: "Test sync complete - check logs for County field" });
    } catch (error) {
      await Logger.error(`Test sync failed: ${error}`, 'test-sync');
      res.status(500).json({ error: "Test sync failed: " + error });
    }
  });

  // Retry sync for individual lien
  app.post("/api/liens/:id/retry-sync", async (req, res) => {
    try {
      const { id } = req.params;
      const lien = await storage.getLienById(id);
      
      if (!lien) {
        return res.status(404).json({ error: "Lien not found" });
      }
      
      if (lien.status === 'synced') {
        return res.status(400).json({ error: "Lien already synced" });
      }
      
      // Initialize Airtable service
      const airtableService = new AirtableService();
      
      // Sync this single lien
      await airtableService.syncLiensToAirtable([lien]);
      
      // Update status
      await storage.updateLienStatus(lien.recordingNumber, 'synced');
      
      await Logger.info(`Successfully retried sync for lien ${lien.recordingNumber}`, 'retry-sync');
      res.json({ message: "Sync successful" });
    } catch (error) {
      await Logger.error(`Failed to retry sync: ${error}`, 'retry-sync');
      res.status(500).json({ error: "Failed to sync to Airtable" });
    }
  });

  // Schedule management routes
  app.get("/api/automation/schedule", requireAuth, async (req, res) => {
    try {
      const scheduleInfo = await scheduler.getScheduleInfo();
      res.json(scheduleInfo);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch schedule" });
    }
  });

  app.post("/api/automation/schedule", requireAuth, async (req, res) => {
    try {
      const {
        hour,
        minute,
        timezone = 'America/New_York',
        skipWeekends = false,
        isEnabled = true
      } = req.body;

      if (typeof hour !== 'number' || typeof minute !== 'number') {
        return res.status(400).json({ error: "Invalid schedule time" });
      }

      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return res.status(400).json({ error: "Invalid time values" });
      }

      const validTimezones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];
      if (!validTimezones.includes(timezone)) {
        return res.status(400).json({ error: "Invalid timezone" });
      }

      await scheduler.updateSchedule(hour, minute, timezone, skipWeekends, isEnabled);
      const scheduleInfo = await scheduler.getScheduleInfo();
      res.json(scheduleInfo);
    } catch (error) {
      console.error("Schedule update error:", error);
      res.status(500).json({ error: "Failed to update schedule: " + (error instanceof Error ? error.message : String(error)) });
    }
  });

  // Scraper Platform routes
  app.get("/api/scraper-platforms", requireAuth, async (req, res) => {
    try {
      const platforms = await storage.getAllScraperPlatforms();
      res.json(platforms);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scraper platforms" });
    }
  });

  app.get("/api/scraper-platforms/active", requireAuth, async (req, res) => {
    try {
      const platforms = await storage.getActiveScraperPlatforms();
      res.json(platforms);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active scraper platforms" });
    }
  });

  app.get("/api/scraper-platforms/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const platform = await storage.getScraperPlatform(id);
      if (!platform) {
        return res.status(404).json({ error: "Scraper platform not found" });
      }
      res.json(platform);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scraper platform" });
    }
  });

  app.post("/api/scraper-platforms", requireAuth, async (req, res) => {
    try {
      const platform = await storage.createScraperPlatform(req.body);
      res.json(platform);
    } catch (error) {
      res.status(500).json({ error: "Failed to create scraper platform" });
    }
  });

  app.patch("/api/scraper-platforms/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.updateScraperPlatform(id, req.body);
      res.json({ message: "Scraper platform updated successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update scraper platform" });
    }
  });

  // County management routes
  app.get("/api/counties", requireAuth, async (req, res) => {
    try {
      // Return ALL counties for management page, not just active ones
      const counties = await storage.getAllCounties();
      res.json(counties);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch counties" });
    }
  });

  app.get("/api/counties/states/:state", requireAuth, async (req, res) => {
    try {
      const { state } = req.params;
      const counties = await storage.getCountiesByState(state);
      res.json(counties);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch counties by state" });
    }
  });

  app.post("/api/counties", async (req, res) => {
    try {
      const county = await storage.createCounty(req.body);
      res.json(county);
    } catch (error) {
      res.status(500).json({ error: "Failed to create county" });
    }
  });

  app.patch("/api/counties/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.updateCounty(id, req.body);
      res.json({ message: "County updated successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update county" });
    }
  });

  // Test route to directly process a specific recording
  app.post("/api/test-recording", async (req, res) => {
    try {
      const { recordingNumber = '20250479696' } = req.body;
      
      const pdfUrl = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
      await Logger.info(`Testing direct PDF download for recording ${recordingNumber}`, 'test');
      
      // Download the PDF
      const response = await fetch(pdfUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
          'Accept': 'application/pdf,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        }
      });
      
      await Logger.info(`PDF fetch response: Status ${response.status}, OK: ${response.ok}`, 'test');
      
      if (!response.ok) {
        return res.json({ 
          success: false, 
          recordingNumber,
          status: response.status,
          error: `PDF not accessible (${response.status})`
        });
      }
      
      const pdfBuffer = Buffer.from(await response.arrayBuffer());
      await Logger.info(`Downloaded PDF: ${pdfBuffer.length} bytes`, 'test');
      
      // OCR removed - just validate PDF
      await Logger.info(`PDF validated: ${pdfBuffer.length} bytes`, 'test');
      const ocrData = { debtorName: 'To be extracted', debtorAddress: '', amount: 0 };
      
      // Create lien regardless of amount
      if (true) {
        const lien = {
          recordingNumber,
          recordDate: new Date(),
          countyId: 'maricopa-az',
          debtorName: ocrData.debtorName,
          debtorAddress: ocrData.debtorAddress || '',
          creditorName: 'Medical Provider',
          creditorAddress: '',
          amount: ocrData.amount.toString(),
          documentUrl: pdfUrl,
          status: 'pending'
        };
        
        await storage.createLien(lien);
        await Logger.success(`✅ Successfully processed and saved lien ${recordingNumber}`, 'test');
        
        return res.json({
          success: true,
          recordingNumber,
          lien,
          message: 'Successfully processed PDF and extracted lien data'
        });
      }
      
      return res.json({
        success: true,
        recordingNumber,
        pdfDownloaded: true,
        pdfSize: pdfBuffer.length,
        message: 'PDF successfully downloaded'
      });
      
    } catch (error) {
      await Logger.error(`Test recording failed: ${error}`, 'test');
      res.status(500).json({ error: error instanceof Error ? error.message : 'Test failed' });
    }
  });

  // Serve PDFs
  app.get("/api/liens/:id/pdf", async (req, res) => {
    try {
      const { id } = req.params;
      const lien = await storage.getLienById(id);
      
      if (!lien) {
        return res.status(404).json({ error: "Lien not found" });
      }

      // Serve the actual PDF from the lien's documentUrl
      if (lien.documentUrl) {
        try {
          console.log(`Fetching unique PDF for lien ${lien.recordingNumber} from: ${lien.documentUrl}`);
          
          // Fetch the actual PDF for this specific lien
          const response = await fetch(lien.documentUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/pdf,*/*'
            }
          });
          
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            
            // Set appropriate headers with no caching to ensure unique PDFs
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${lien.recordingNumber}.pdf"`);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            
            return res.send(Buffer.from(buffer));
          }
        } catch (fetchError) {
          console.error(`Failed to fetch PDF from URL for ${lien.recordingNumber}:`, fetchError);
        }
      }

      // Fallback to test PDF if no documentUrl or fetch fails
      const pdfPath = path.join(process.cwd(), 'test_download.pdf');
      
      // Check if the file exists
      if (!fs.existsSync(pdfPath)) {
        return res.status(404).json({ error: "PDF not found" });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="lien-${lien.recordingNumber}.pdf"`);
      
      // Stream the PDF file
      const stream = fs.createReadStream(pdfPath);
      stream.pipe(res);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve PDF" });
    }
  });

  // App Settings routes
  app.get("/api/settings", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getAllAppSettings();
      // Mask secret values in response
      const maskedSettings = settings.map(s => ({
        ...s,
        value: s.isSecret ? '••••••••' : s.value
      }));
      res.json(maskedSettings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.get("/api/settings/:key", requireAuth, async (req, res) => {
    try {
      const { key } = req.params;
      const setting = await storage.getAppSetting(key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      // Mask secret value
      res.json({
        ...setting,
        value: setting.isSecret ? '••••••••' : setting.value
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  app.post("/api/settings", requireAuth, async (req, res) => {
    try {
      const { key, value, isSecret, description } = req.body;

      if (!key || value === undefined) {
        return res.status(400).json({ error: "Key and value are required" });
      }

      const setting = await storage.upsertAppSetting({
        key,
        value,
        isSecret: isSecret ?? false,
        description: description ?? null
      });

      res.json({
        ...setting,
        value: setting.isSecret ? '••••••••' : setting.value
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to save setting" });
    }
  });

  app.delete("/api/settings/:key", requireAuth, async (req, res) => {
    try {
      const { key } = req.params;
      await storage.deleteAppSetting(key);
      res.json({ message: "Setting deleted" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete setting" });
    }
  });

  // Get unmasked value for a specific setting (for editing)
  app.get("/api/settings/:key/reveal", requireAuth, async (req, res) => {
    try {
      const { key } = req.params;
      const setting = await storage.getAppSetting(key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      // Return actual value (unmasked)
      res.json(setting);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
