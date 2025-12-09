# County Scraper Enhancement Plan

## Overview

This document outlines the plan to enhance the Lienstream county scraper to be dynamic, configurable, and more robust. Currently, the scraper is mostly hard-coded for Maricopa County, Arizona. We need to extract these hard-coded values, make the system configurable per-county, and add safeguards like duplicate detection.

---

## Current Issues Identified

### 1. Hard-Coded Maricopa County URLs
- Search URL: `https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRec.aspx`
- PDF URL patterns: `https://legacy.recorder.maricopa.gov/recdocdata/UnofficialPdfDocs.aspx?rec=...`
- Fallback PDF URL: `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/{recordingNumber}.pdf`
- Document detail URL: `https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataDetail.aspx?rec=...`

### 2. Hard-Coded Document Type
- Document type `HL` (Hospital Lien) is hard-coded in form submission

### 3. No Duplicate Detection
- System can push duplicate recording numbers to Airtable
- No `isDuplicate` flag on liens table
- No check before Airtable sync

### 4. Date/Timezone Issues
- Server timezone may differ from expected timezone
- No clear logging of what date is being searched
- Manual vs scheduled runs have different date logic

### 5. No Second Test County
- Only Maricopa County is configured
- Need another county to test dynamic configuration

---

## Phase 1: Database Schema Updates

### 1.1 Update `liens` Table
Add new columns to track duplicates and processing state:

```sql
ALTER TABLE liens ADD COLUMN is_duplicate BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE liens ADD COLUMN duplicate_of VARCHAR REFERENCES liens(id);
ALTER TABLE liens ADD COLUMN first_seen_at TIMESTAMP;
ALTER TABLE liens ADD COLUMN sync_attempts INTEGER DEFAULT 0;
ALTER TABLE liens ADD COLUMN last_sync_error TEXT;
```

**Schema changes in `shared/schema.ts`:**
```typescript
export const liens = pgTable("liens", {
  // ... existing fields ...
  isDuplicate: boolean("is_duplicate").notNull().default(false),
  duplicateOf: varchar("duplicate_of").references(() => liens.id),
  firstSeenAt: timestamp("first_seen_at"),
  syncAttempts: integer("sync_attempts").default(0),
  lastSyncError: text("last_sync_error"),
});
```

### 1.2 Expand `counties.config` JSON Structure
The existing `CountyConfig` interface in `schema.ts` is good but not being used. Update the counties table data to use this structure:

```typescript
interface CountyConfig {
  // Scraper type
  scrapeType: 'puppeteer' | 'api' | 'selenium';

  // URLs - MAKE THESE REQUIRED
  baseUrl: string;              // e.g., "https://legacy.recorder.maricopa.gov"
  searchFormUrl: string;        // Page with the search form
  searchResultsUrlPattern: string; // URL pattern for results with placeholders
  documentDetailUrlPattern: string; // URL pattern for document detail pages
  pdfUrlPatterns: string[];     // Array of URL patterns to try for PDFs

  // Document type configuration
  documentTypes: {
    code: string;               // e.g., "HL"
    name: string;               // e.g., "Hospital Lien"
    description?: string;
  }[];
  defaultDocumentType: string;  // Default code to use

  // Selectors for form interaction
  selectors: {
    searchForm?: string;
    documentTypeDropdown?: string;
    startDateField: string;
    endDateField: string;
    searchButton: string;
    resultsTable?: string;
    resultsIframe?: string;     // Some sites use iframes
    recordingNumberLinks: string;
    nextPageButton?: string;
    noResultsIndicator?: string; // Selector or text to detect "no results"
    pagesColumnLink?: string;   // Link in "Pages" column for PDF viewer
  };

  // Date format this county expects
  dateFormat: string;           // e.g., "MM/DD/YYYY" or "YYYY-MM-DD"

  // Parsing patterns for extracting data
  parsing: {
    recordingNumberPattern: string;  // Regex to validate/extract recording numbers
    amountPattern?: string;
    debtorPattern?: string;
    creditorPattern?: string;
    addressPattern?: string;
  };

  // Timing configuration
  delays: {
    pageLoadWait: number;       // ms to wait for page load
    betweenRequests: number;    // ms between requests
    afterFormSubmit: number;    // ms to wait after form submission
    pdfLoadWait: number;        // ms to wait for PDF
  };

  // Rate limiting
  rateLimit?: {
    maxRequestsPerMinute: number;
    maxPagesPerRun: number;
  };

  // Authentication if needed
  authentication?: {
    type: 'none' | 'basic' | 'session' | 'cookie';
    credentials?: Record<string, string>;
  };

  // Custom headers
  headers?: Record<string, string>;
}
```

---

## Phase 2: Duplicate Detection System

### 2.1 Pre-Sync Duplicate Check
Before pushing to Airtable, check if recording number already exists:

**Location:** `server/services/airtable.ts`

```typescript
async checkForDuplicates(liens: any[]): Promise<{
  newLiens: any[];
  duplicates: any[];
}> {
  const newLiens: any[] = [];
  const duplicates: any[] = [];

  for (const lien of liens) {
    // Check local database first
    const existing = await storage.getLienByRecordingNumber(lien.recordingNumber);

    if (existing) {
      // Mark as duplicate
      await storage.markLienAsDuplicate(lien.id, existing.id);
      duplicates.push({ lien, existingId: existing.id });
    } else {
      newLiens.push(lien);
    }
  }

  return { newLiens, duplicates };
}
```

### 2.2 Storage Methods to Add
**Location:** `server/storage.ts`

```typescript
interface IStorage {
  // ... existing methods ...

  // Duplicate detection
  markLienAsDuplicate(lienId: string, duplicateOfId: string): Promise<void>;
  getDuplicateLiens(): Promise<Lien[]>;
  getLienByRecordingNumber(recordingNumber: string): Promise<Lien | null>;
}
```

### 2.3 Update Airtable Sync Flow
**Location:** `server/services/scheduler.ts` (around line 434)

```typescript
// BEFORE syncing to Airtable
const { newLiens, duplicates } = await this.airtableService.checkForDuplicates(liensWithPDFs);

if (duplicates.length > 0) {
  await Logger.warning(
    `Found ${duplicates.length} duplicate liens - skipping: ${duplicates.map(d => d.lien.recordingNumber).join(', ')}`,
    'scheduler'
  );
}

// Only sync non-duplicates
if (newLiens.length > 0) {
  await this.airtableService.syncLiensToAirtable(newLiens);
}
```

---

## Phase 3: Dynamic County Scraper

### 3.1 Refactor `county-scraper.ts`
Extract hard-coded values into configuration.

**Key Changes:**

1. **Remove hard-coded URLs** - Use `this.config.baseUrl`, `this.config.searchFormUrl`, etc.

2. **Make form filling dynamic** - Use selector config instead of hard-coded selectors

3. **Parameterize document type** - Use `this.config.defaultDocumentType` instead of `'HL'`

4. **Dynamic PDF URL generation** - Try each pattern in `this.config.pdfUrlPatterns`

### 3.2 Updated Scraper Class Structure

```typescript
export class DynamicCountyScraper extends CountyScraper {
  async scrapeCountyLiens(fromDate?: string, toDate?: string, limit?: number): Promise<ScrapedLien[]> {
    const config = this.config as CountyConfig;

    // Use config for all URLs
    const searchFormUrl = config.searchFormUrl;

    // Format dates according to county's expected format
    const formattedStartDate = this.formatDate(startDate, config.dateFormat);
    const formattedEndDate = this.formatDate(endDate, config.dateFormat);

    // Fill form using configured selectors
    await this.fillSearchForm(page, {
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      documentType: config.defaultDocumentType,
      selectors: config.selectors
    });

    // ... rest of scraping logic using config values
  }

  private formatDate(date: Date, format: string): string {
    // Format date according to county's expected format
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();

    switch (format) {
      case 'MM/DD/YYYY':
        return `${month}/${day}/${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`;
      default:
        return `${month}/${day}/${year}`;
    }
  }

  private async tryDownloadPdf(recordingNumber: string): Promise<Buffer | null> {
    const config = this.config as CountyConfig;

    // Try each PDF URL pattern until one works
    for (const pattern of config.pdfUrlPatterns) {
      const url = pattern.replace('{recordingNumber}', recordingNumber);
      const buffer = await this.downloadPdfFromUrl(url);
      if (buffer) return buffer;
    }

    return null;
  }
}
```

### 3.3 Create Maricopa County Configuration

```typescript
const MARICOPA_COUNTY_CONFIG: CountyConfig = {
  scrapeType: 'puppeteer',
  baseUrl: 'https://legacy.recorder.maricopa.gov',
  searchFormUrl: 'https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRec.aspx',
  searchResultsUrlPattern: 'https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRecentPgDn.aspx?rec=0&suf=&nm=&bdt={startDate}&edt={endDate}&cde={docType}&max=500&res=True&doc1={docType}&doc2=&doc3=&doc4=&doc5=',
  documentDetailUrlPattern: 'https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataDetail.aspx?rec={recordingNumber}&suf=&nm=',
  pdfUrlPatterns: [
    'https://legacy.recorder.maricopa.gov/recdocdata/UnofficialPdfDocs.aspx?rec={recordingNumber}&pg=1&cls=RecorderDocuments&suf=',
    'https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/{recordingNumber}.pdf'
  ],
  documentTypes: [
    { code: 'HL', name: 'Hospital Lien', description: 'Medical/Hospital Lien' }
  ],
  defaultDocumentType: 'HL',
  dateFormat: 'MM/DD/YYYY',
  selectors: {
    searchForm: 'form',
    documentTypeDropdown: '#ddlDocType, #ddlDocType1, select[id*="DocType"]',
    startDateField: '#txtRecBegDate, #txbRecBegDate, input[id*="RecBegDate"]',
    endDateField: '#txtRecEndDate, #txbRecEndDate, input[id*="RecEndDate"]',
    searchButton: '#btnRecDataSubmit, input[type="submit"], button[type="submit"]',
    resultsTable: 'table',
    resultsIframe: 'iframe',
    recordingNumberLinks: 'a',
    nextPageButton: 'a:contains("next"), input[value*="next"]',
    noResultsIndicator: 'No results exist for this search',
    pagesColumnLink: 'td a[href*="unofficialpdfdocs"]'
  },
  parsing: {
    recordingNumberPattern: '^\\d{10,12}$',
    amountPattern: '\\$(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?)',
    debtorPattern: 'Name\\(s\\)([\\s\\S]*?)Document Code',
    addressPattern: '(\\d+\\s+[A-Za-z0-9\\s]+(?:ST|AVE|RD|DR|LN|CT|WAY|BLVD|PL)[\\s,]*[A-Za-z\\s]+,?\\s+AZ\\s+\\d{5})'
  },
  delays: {
    pageLoadWait: 3000,
    betweenRequests: 300,
    afterFormSubmit: 3000,
    pdfLoadWait: 2000
  },
  rateLimit: {
    maxRequestsPerMinute: 30,
    maxPagesPerRun: 10
  }
};
```

---

## Phase 4: Add Second Test County

### 4.1 Research Candidate Counties
Find another Arizona or nearby state county with:
- Online recorder document search
- Medical/Hospital Lien document type
- Publicly accessible without login

**Candidates to Research:**
1. **Pima County, AZ** - Tucson area, second largest in AZ
2. **Clark County, NV** - Las Vegas, large volume
3. **Los Angeles County, CA** - Huge volume, may have API

### 4.2 Create Configuration for Second County
Once selected, create a similar config object and test.

### 4.3 Add County to Database
```sql
INSERT INTO counties (name, state, is_active, config) VALUES (
  'Pima County',
  'AZ',
  true,
  '{...config JSON...}'
);
```

---

## Phase 5: Improved Logging & Monitoring

### 5.1 Enhanced Date Logging
Add clear logging at the start of each run:

```typescript
await Logger.info(`
  ========================================
  AUTOMATION RUN STARTING
  Type: ${type}
  Server Time: ${new Date().toISOString()}
  Server Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
  Search Date Range: ${fromDate} to ${toDate}
  ========================================
`, 'scheduler');
```

### 5.2 Screenshot Management
- Store screenshots with timestamps in filenames
- Add run ID to screenshot names
- Consider storing in a dedicated folder

```typescript
const screenshotPath = `screenshots/${runId}/page-${pageNum}-${Date.now()}.png`;
```

### 5.3 Add Dry Run Mode
Add ability to run scraper without pushing to Airtable:

```typescript
async runAutomation(
  type: 'scheduled' | 'manual',
  options?: {
    fromDate?: string;
    toDate?: string;
    limit?: number;
    dryRun?: boolean;  // NEW: Don't push to Airtable
  }
): Promise<void>
```

---

## Phase 6: Safety Improvements

### 6.1 Pre-Airtable Sync Confirmation
Add a step that logs what WOULD be synced:

```typescript
// Before actual sync
await Logger.info(`
  AIRTABLE SYNC PREVIEW:
  - Total liens to sync: ${newLiens.length}
  - Duplicates skipped: ${duplicates.length}
  - Recording numbers: ${newLiens.map(l => l.recordingNumber).join(', ')}
`, 'airtable');

// Only proceed if not dry run
if (!options.dryRun) {
  await this.airtableService.syncLiensToAirtable(newLiens);
}
```

### 6.2 Airtable Duplicate Check
Also check Airtable for existing records before creating:

```typescript
async checkAirtableForDuplicates(recordingNumbers: string[]): Promise<string[]> {
  // Query Airtable to see if any of these recording numbers exist
  const formula = `OR(${recordingNumbers.map(rn => `{Record Number}=${rn}`).join(',')})`;

  const response = await fetch(
    `https://api.airtable.com/v0/${this.baseId}/${this.tableId}?filterByFormula=${encodeURIComponent(formula)}`,
    {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    }
  );

  const data = await response.json();
  return data.records.map((r: any) => r.fields['Record Number'].toString());
}
```

---

## Implementation Order

### Sprint 1: Safety First
1. Add `isDuplicate` column to liens table
2. Implement duplicate detection in storage layer
3. Add pre-sync duplicate check
4. Add dry run mode

### Sprint 2: Dynamic Configuration
1. Update `CountyConfig` interface
2. Create Maricopa config JSON
3. Refactor scraper to use config values
4. Update county in database with full config

### Sprint 3: Second County
1. Research and select second test county
2. Create configuration for that county
3. Test scraper with new county
4. Document any county-specific edge cases

### Sprint 4: Monitoring & Polish
1. Enhanced logging
2. Screenshot management
3. Airtable duplicate check
4. Admin UI for viewing/managing county configs

---

## Files to Modify

| File | Changes |
|------|---------|
| `shared/schema.ts` | Add `isDuplicate`, `duplicateOf`, etc. columns to liens table |
| `server/storage.ts` | Add duplicate detection methods |
| `server/database-storage.ts` | Implement duplicate detection methods |
| `server/services/county-scraper.ts` | Refactor to use dynamic config |
| `server/services/scheduler.ts` | Add dry run mode, duplicate check before sync |
| `server/services/airtable.ts` | Add Airtable duplicate check |
| `server/routes.ts` | Add dry run parameter to manual run endpoint |

---

## Testing Checklist

- [ ] Run scraper for date with known results - verify liens found
- [ ] Run scraper twice for same date - verify duplicates detected
- [ ] Run with dry run mode - verify no Airtable push
- [ ] Run for Maricopa with new config - verify still works
- [ ] Run for second county - verify dynamic config works
- [ ] Check timezone handling - verify correct dates searched
- [ ] Test "no results" handling - verify graceful handling

---

## Notes

- The `recordingNumber` column already has a `UNIQUE` constraint, so the database will reject true duplicates
- The current Airtable sync doesn't check for existing records - this is the gap we need to fill
- Consider adding a "last successful run date" per county to help with incremental scraping
