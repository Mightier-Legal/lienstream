import { Logger } from './logger';
import { Lien } from '@shared/schema';
import { storage } from '../storage';
import { pdfStorage } from './pdf-storage';
import { getPublicBaseUrl } from './scrapers';

interface AirtableRecord {
  fields: {
    'Status'?: string;
    'County'?: string | string[]; // Can be string or array for linked records
    'Document ID'?: string;
    'Scrape Batch ID'?: string;
    'Grantor/Grantee Names'?: string;
    'Lien Amount'?: number;
    [key: string]: any; // Allow additional fields
  };
  hasPdf?: boolean; // Internal flag for PDF status
  recordingNumber?: string; // Internal flag for tracking
}

export class AirtableService {
  private apiKey: string = '';
  private baseId: string = '';
  private tableId: string = '';

  constructor() {
    // Credentials will be loaded from app settings in loadCredentials()
  }

  /**
   * Load Airtable credentials from app settings (database) first, then fall back to env vars
   */
  private async loadCredentials(): Promise<void> {
    // Try app settings first
    const apiKeySetting = await storage.getAppSetting('AIRTABLE_API_KEY');
    const baseIdSetting = await storage.getAppSetting('AIRTABLE_BASE_ID');
    const tableIdSetting = await storage.getAppSetting('AIRTABLE_TABLE_ID');

    this.apiKey = apiKeySetting?.value || process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || '';
    this.baseId = baseIdSetting?.value || process.env.AIRTABLE_BASE_ID || '';
    this.tableId = tableIdSetting?.value || process.env.AIRTABLE_TABLE_ID || '';

    console.log(`[AIRTABLE] Loaded credentials - API Key: ${this.apiKey ? '***' + this.apiKey.slice(-4) : 'MISSING'}, Base ID: ${this.baseId || 'MISSING'}, Table ID: ${this.tableId || 'MISSING'}`);
  }

  async syncLiensToAirtable(liens: any[]): Promise<{ synced: number; failed: number; errors: string[] }> {
    const result = { synced: 0, failed: 0, errors: [] as string[] };

    // Load credentials from app settings before each sync
    await this.loadCredentials();

    if (!this.apiKey || !this.baseId || !this.tableId) {
      const errorMsg = `Airtable not configured - missing: ${!this.apiKey ? 'API_KEY ' : ''}${!this.baseId ? 'BASE_ID ' : ''}${!this.tableId ? 'TABLE_ID' : ''}`;
      await Logger.error(errorMsg, 'airtable');
      console.error(`[AIRTABLE ERROR] ${errorMsg}`);
      result.errors.push(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      await Logger.info(`Starting Airtable sync for ${liens.length} liens to base: ${this.baseId}, table: ${this.tableId}`, 'airtable');

      // Get base URL for serving PDFs
      const baseUrl = await getPublicBaseUrl();
      
      // Pre-fetch counties to get airtableCountyId for each lien
      const countyCache = new Map<string, string | null>();

      const records: AirtableRecord[] = [];
      for (const lien of liens) {
        // Look up county's airtableCountyId (with caching)
        let airtableCountyId: string | null = null;
        if (lien.countyId) {
          if (countyCache.has(lien.countyId)) {
            airtableCountyId = countyCache.get(lien.countyId) || null;
          } else {
            const county = await storage.getCounty(lien.countyId);
            airtableCountyId = county?.airtableCountyId || null;
            countyCache.set(lien.countyId, airtableCountyId);
          }
        }

        // Determine the PDF URL to use
        let pdfAttachment = null;

        // PRIORITY 1: Check pdfUrl field (local stored PDF URL from database)
        if (lien.pdfUrl && lien.pdfUrl.includes('/api/pdf/')) {
          pdfAttachment = [{
            url: lien.pdfUrl,
            filename: `${lien.recordingNumber}.pdf`
          }];
          Logger.info(`Using local PDF URL from pdfUrl field for ${lien.recordingNumber}: ${lien.pdfUrl}`, 'airtable');
        }
        // PRIORITY 2: Check documentUrl if it's a local URL
        else if (lien.documentUrl && (lien.documentUrl.includes('/api/pdf/') || lien.documentUrl.includes(baseUrl))) {
          pdfAttachment = [{
            url: lien.documentUrl,
            filename: `${lien.recordingNumber}.pdf`
          }];
          Logger.info(`Using local PDF URL from documentUrl for ${lien.recordingNumber}: ${lien.documentUrl}`, 'airtable');
        }
        // PRIORITY 3: Have a buffer - store it and get URL
        else if (lien.pdfBuffer) {
          const pdfId = pdfStorage.storePdf(lien.pdfBuffer, lien.recordingNumber);
          const pdfUrl = `${baseUrl}/api/pdf/${pdfId}`;
          pdfAttachment = [{
            url: pdfUrl,
            filename: `${lien.recordingNumber}.pdf`
          }];
          Logger.info(`Stored PDF buffer for ${lien.recordingNumber} at ${pdfUrl}`, 'airtable');
        }
        // NO PDF AVAILABLE - skip this lien or log error
        else {
          Logger.error(`NO LOCAL PDF AVAILABLE for ${lien.recordingNumber} - cannot sync to Airtable without PDF`, 'airtable');
          // Don't set pdfAttachment - we'll filter these out
        }

        // Convert recording number to number
        const recordNumber = parseInt(lien.recordingNumber, 10);

        // Build fields object dynamically
        const fields: any = {
          'Record Number': recordNumber // Convert to number for Airtable number field
        };

        // Only include PDF Link if we have a valid PDF attachment
        if (pdfAttachment) {
          fields['PDF Link'] = pdfAttachment;
        }

        // Only include County field if we have a valid airtableCountyId from the county record
        if (airtableCountyId) {
          fields['County'] = [airtableCountyId]; // Linked record field - array of record IDs
          Logger.info(`Using County airtableCountyId for ${lien.recordingNumber}: ${airtableCountyId}`, 'airtable');
        } else {
          Logger.warning(`County airtableCountyId not configured for lien ${lien.recordingNumber} (countyId: ${lien.countyId}) - omitting County field`, 'airtable');
        }

        records.push({ fields, hasPdf: !!pdfAttachment, recordingNumber: lien.recordingNumber });
      }
      
      // Filter out records without PDFs - PDFs are ESSENTIAL
      const recordsWithPdfs = records.filter(r => r.hasPdf);
      const recordsWithoutPdfs = records.filter(r => !r.hasPdf);
      
      if (recordsWithoutPdfs.length > 0) {
        Logger.warning(`Skipping ${recordsWithoutPdfs.length} liens without PDFs: ${recordsWithoutPdfs.map(r => r.recordingNumber).join(', ')}`, 'airtable');
      }
      
      if (recordsWithPdfs.length === 0) {
        const errorMsg = 'No liens have PDFs - aborting Airtable sync';
        Logger.error(errorMsg, 'airtable');
        console.error(`[AIRTABLE ERROR] ${errorMsg}`);
        result.errors.push(errorMsg);
        result.failed = liens.length;
        throw new Error(errorMsg);
      }
      
      // Convert back to just fields for Airtable
      const cleanRecords = recordsWithPdfs.map(r => ({ fields: r.fields }));

      // Batch create records (Airtable allows up to 10 records per request)
      const batches = this.chunkArray(cleanRecords, 10);
      let syncedCount = 0;
      
      Logger.info(`Syncing ${cleanRecords.length} liens with PDFs to Airtable`, 'airtable');

      for (const batch of batches) {
        try {
          const payload = { 
            records: batch,
            typecast: true // Allow Airtable to coerce field types
          };
          Logger.info(`Sending to Airtable: ${JSON.stringify(payload.records[0].fields)}`, 'airtable');
          
          const response = await fetch(`https://api.airtable.com/v0/${this.baseId}/${this.tableId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const errorText = await response.text();
            let errorDetails = errorText;
            try {
              // Try to parse Airtable's JSON error response for better details
              const errorJson = JSON.parse(errorText);
              if (errorJson.error) {
                errorDetails = `${errorJson.error.type}: ${errorJson.error.message}`;
                if (errorJson.error.type === 'INVALID_VALUE_FOR_COLUMN' || 
                    errorJson.error.type === 'INVALID_RECORD_ID') {
                  Logger.error(`Field validation error - check that County record ID exists in production base`, 'airtable');
                }
              }
            } catch {
              // If not JSON, use the raw text
            }
            throw new Error(`Airtable API error (${response.status}): ${errorDetails}`);
          }

          const result = await response.json();
          
          // Update lien status to 'synced' and store Airtable record IDs
          for (let i = 0; i < result.records.length; i++) {
            const airtableRecord = result.records[i];
            const originalLien = liens[batches.indexOf(batch) * 10 + i];
            if (originalLien && airtableRecord) {
              await storage.updateLienStatus(originalLien.recordingNumber, 'synced');
              await storage.updateLienAirtableId(originalLien.recordingNumber, airtableRecord.id);
            }
          }
          
          syncedCount += batch.length;
          await Logger.info(`Synced batch to Airtable: ${batch.length} records`, 'airtable');
          
        } catch (error: any) {
          const errorMsg = `Failed to sync batch to Airtable: ${error.message || error}`;
          await Logger.error(errorMsg, 'airtable');
          console.error(`[AIRTABLE ERROR] ${errorMsg}`);
          result.errors.push(errorMsg);
          result.failed += batch.length;
          // Re-throw to stop processing - don't silently continue
          throw error;
        }
      }

      result.synced = syncedCount;
      await Logger.success(`Successfully synced ${syncedCount} liens to Airtable`, 'airtable');
      console.log(`[AIRTABLE SUCCESS] Synced ${syncedCount} liens`);
      return result;

    } catch (error: any) {
      await Logger.error(`Airtable sync failed: ${error.message || error}`, 'airtable');
      console.error(`[AIRTABLE ERROR] Sync failed: ${error.message || error}`);
      throw error;
    }
  }

  async updateLienWithEnrichment(recordingNumber: string, phoneNumber?: string, email?: string): Promise<void> {
    if (!this.apiKey || !this.baseId) {
      return;
    }

    try {
      const lien = await storage.getLienByRecordingNumber(recordingNumber);
      if (!lien?.airtableRecordId) {
        return;
      }

      const updateFields: any = {};
      if (phoneNumber) {
        updateFields['Phone'] = phoneNumber;
        updateFields['Phone (All)'] = phoneNumber; // Could be enhanced to append multiple numbers
      }
      if (email) {
        updateFields['Email'] = email;
        updateFields['Email (All)'] = email; // Could be enhanced to append multiple emails
      }
      
      // Update confidence score when enrichment data is added
      if (phoneNumber || email) {
        updateFields['Confidence Score'] = 95; // Higher confidence with contact info
      }
      
      // Always update the Last Updated timestamp
      updateFields['Last Updated'] = new Date().toISOString();

      if (Object.keys(updateFields).length === 0) {
        return;
      }

      const response = await fetch(`https://api.airtable.com/v0/${this.baseId}/${this.tableId}/${lien.airtableRecordId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: updateFields })
      });

      if (!response.ok) {
        throw new Error(`Failed to update Airtable record: ${response.status}`);
      }

      await Logger.success(`Updated Airtable record with enrichment data: ${recordingNumber}`, 'airtable');

    } catch (error) {
      await Logger.error(`Failed to update Airtable record: ${error}`, 'airtable');
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
