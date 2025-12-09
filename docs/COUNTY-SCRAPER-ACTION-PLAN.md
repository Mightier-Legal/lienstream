# County Scraper Action Plan

## Executive Summary

The county scraper currently has three critical issues:
1. **Hard-coded values** - All URLs, selectors, and document types are hard-coded for Maricopa County
2. **Database config ignored** - The `counties.config` JSON is passed but never used
3. **Date timezone bug** - Date strings are converted incorrectly, causing off-by-one day errors

This plan provides step-by-step actions to fix these issues and make the scraper dynamic.

---

## Issue 1: Date Timezone Bug (URGENT - Fix First)

### The Problem

In `scheduler.ts:201-206`, dates are created correctly:
```typescript
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
fromDate = yesterday.toISOString().split('T')[0]; // "2024-12-08" format
```

But in `county-scraper.ts:576-585`, the date string is re-parsed:
```typescript
const startDate = fromDate ? new Date(fromDate) : new Date();
// Then later:
const startMonth = startDate.getMonth() + 1;
const startDay = startDate.getDate();
const startYear = startDate.getFullYear();
```

**The Bug:** When you do `new Date("2024-12-08")`, JavaScript interprets this as midnight UTC. If your server is in a timezone behind UTC, `getDate()` returns the previous day.

### The Fix (Immediate)

**File:** `server/services/county-scraper.ts`

**Location:** Lines 576-586

**Change From:**
```typescript
const startDate = fromDate ? new Date(fromDate) : new Date();
const endDate = toDate ? new Date(toDate) : startDate;

const startMonth = startDate.getMonth() + 1;
const startDay = startDate.getDate();
const startYear = startDate.getFullYear();

const endMonth = endDate.getMonth() + 1;
const endDay = endDate.getDate();
const endYear = endDate.getFullYear();
```

**Change To:**
```typescript
// Parse date strings directly to avoid timezone conversion issues
// fromDate/toDate are in "YYYY-MM-DD" format from the scheduler
let startMonth: number, startDay: number, startYear: number;
let endMonth: number, endDay: number, endYear: number;

if (fromDate) {
  const parts = fromDate.split('-');
  startYear = parseInt(parts[0], 10);
  startMonth = parseInt(parts[1], 10);
  startDay = parseInt(parts[2], 10);
} else {
  const now = new Date();
  startYear = now.getFullYear();
  startMonth = now.getMonth() + 1;
  startDay = now.getDate();
}

if (toDate) {
  const parts = toDate.split('-');
  endYear = parseInt(parts[0], 10);
  endMonth = parseInt(parts[1], 10);
  endDay = parseInt(parts[2], 10);
} else {
  endYear = startYear;
  endMonth = startMonth;
  endDay = startDay;
}
```

---

## Issue 2: Create Maricopa County Configuration for Database

### Current Hard-Coded Values (from county-scraper.ts)

| Item | Hard-Coded Location | Value |
|------|---------------------|-------|
| Search Form URL | Line 588 | `https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRec.aspx` |
| Direct Results URL | Line 748 | `https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRecentPgDn.aspx?...` |
| Document Detail URL | Line 952 | `https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataDetail.aspx?rec={num}` |
| Primary PDF URL | Line 129 | `https://legacy.recorder.maricopa.gov/recdocdata/UnofficialPdfDocs.aspx?rec={num}&pg=1&cls=RecorderDocuments&suf=` |
| Fallback PDF URL | Line 160 | `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/{num}.pdf` |
| Start Date Selector | Line 682 | `#txtRecBegDate, #txbRecBegDate, input[id*="RecBegDate"]` |
| End Date Selector | Line 683 | `#txtRecEndDate, #txbRecEndDate, input[id*="RecEndDate"]` |
| Doc Type Selector | Line 704 | `#ddlDocType, #ddlDocType1, select[id*="DocType"]` |
| Doc Type Value | Line 710 | `HL` |
| Submit Button | Line 727 | `#btnRecDataSubmit, input[type="submit"], button[type="submit"]` |
| Date Format | Line 718 | `MM/DD/YYYY` |

### Maricopa Configuration JSON

Create/update the Maricopa County record in the database with this config:

```json
{
  "scrapeType": "puppeteer",
  "baseUrl": "https://legacy.recorder.maricopa.gov",
  "searchFormUrl": "https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRec.aspx",
  "searchResultsUrlPattern": "https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRecentPgDn.aspx?rec=0&suf=&nm=&bdt={startDate}&edt={endDate}&cde={docType}&max=500&res=True&doc1={docType}&doc2=&doc3=&doc4=&doc5=",
  "documentDetailUrlPattern": "https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataDetail.aspx?rec={recordingNumber}&suf=&nm=",
  "pdfUrlPatterns": [
    "https://legacy.recorder.maricopa.gov/recdocdata/UnofficialPdfDocs.aspx?rec={recordingNumber}&pg=1&cls=RecorderDocuments&suf=",
    "https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/{recordingNumber}.pdf"
  ],
  "documentTypes": [
    { "code": "HL", "name": "Hospital Lien", "description": "Medical/Hospital Lien" }
  ],
  "defaultDocumentType": "HL",
  "dateFormat": "MM/DD/YYYY",
  "selectors": {
    "searchFormIframe": "iframe[src*='GetRecDataRecInt']",
    "startDateField": "#txtRecBegDate, #txbRecBegDate, input[id*='RecBegDate']",
    "endDateField": "#txtRecEndDate, #txbRecEndDate, input[id*='RecEndDate']",
    "documentTypeDropdown": "#ddlDocType, #ddlDocType1, select[id*='DocType']",
    "searchButton": "#btnRecDataSubmit, input[type='submit'], button[type='submit']",
    "resultsIframe": "iframe[src*='GetRecDataRecentPgDn']",
    "resultsTable": "table",
    "recordingNumberLinks": "a",
    "noResultsIndicator": "No results exist for this search",
    "pagesColumnLink": "td a[href*='unofficialpdfdocs']"
  },
  "parsing": {
    "recordingNumberPattern": "^\\d{10,12}$",
    "amountPattern": "\\$(\\d{1,3}(?:,\\d{3})*(?:\\.\\d{2})?)",
    "debtorPattern": "Name\\(s\\)([\\s\\S]*?)Document Code",
    "addressPattern": "(\\d+\\s+[A-Za-z0-9\\s]+(?:ST|AVE|RD|DR|LN|CT|WAY|BLVD|PL)[\\s,]*[A-Za-z\\s]+,?\\s+AZ\\s+\\d{5})"
  },
  "delays": {
    "pageLoadWait": 3000,
    "betweenRequests": 300,
    "afterFormSubmit": 3000,
    "pdfLoadWait": 2000
  },
  "rateLimit": {
    "maxRequestsPerMinute": 30,
    "maxPagesPerRun": 10
  }
}
```

### SQL to Insert/Update Maricopa County

```sql
-- First check if Maricopa County exists
SELECT * FROM counties WHERE name = 'Maricopa County' AND state = 'AZ';

-- If exists, update it:
UPDATE counties
SET config = '{...the JSON above...}'::jsonb,
    updated_at = NOW()
WHERE name = 'Maricopa County' AND state = 'AZ';

-- If doesn't exist, insert it:
INSERT INTO counties (name, state, is_active, config)
VALUES (
  'Maricopa County',
  'AZ',
  true,
  '{...the JSON above...}'::jsonb
);
```

---

## Issue 3: Refactor Scraper to Use Database Config

### Phase 1: Update CountyConfig Interface (Immediate)

**File:** `shared/schema.ts`

The current `CountyConfig` interface (lines 168-200) needs to be expanded to match what we actually need:

```typescript
export interface CountyConfig {
  // Scraper type
  scrapeType: 'puppeteer' | 'api' | 'selenium';

  // URLs
  baseUrl: string;
  searchFormUrl?: string;              // Page with the search form
  searchResultsUrlPattern?: string;    // URL pattern for direct results access
  documentDetailUrlPattern: string;    // Pattern: /detail?rec={recordingNumber}
  pdfUrlPatterns: string[];            // Array of patterns to try for PDFs

  // Document types
  documentTypes: Array<{
    code: string;
    name: string;
    description?: string;
  }>;
  defaultDocumentType: string;

  // Date format expected by the county site
  dateFormat: 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD/MM/YYYY';

  // Selectors
  selectors: {
    searchFormIframe?: string;
    startDateField: string;
    endDateField: string;
    documentTypeDropdown?: string;
    searchButton: string;
    resultsIframe?: string;
    resultsTable?: string;
    recordingNumberLinks?: string;
    nextPageButton?: string;
    noResultsIndicator?: string;
    pagesColumnLink?: string;
  };

  // Parsing patterns
  parsing: {
    recordingNumberPattern?: string;
    amountPattern?: string;
    debtorPattern?: string;
    creditorPattern?: string;
    addressPattern?: string;
  };

  // Timing
  delays: {
    pageLoadWait: number;
    betweenRequests: number;
    afterFormSubmit?: number;
    pdfLoadWait: number;
  };

  // Rate limiting
  rateLimit?: {
    maxRequestsPerMinute: number;
    maxPagesPerRun: number;
  };

  // Authentication (if needed)
  authentication?: {
    type: 'none' | 'basic' | 'session' | 'cookie';
    credentials?: Record<string, string>;
  };

  // Custom headers
  headers?: Record<string, string>;
}
```

### Phase 2: Refactor Scraper to Read Config (Next Steps)

Create a new method in `PuppeteerCountyScraper` that uses config values:

**File:** `server/services/county-scraper.ts`

Add helper methods:

```typescript
class PuppeteerCountyScraper extends CountyScraper {
  // Get typed config
  private getConfig(): CountyConfig {
    return this.config as unknown as CountyConfig;
  }

  // Format date according to county's expected format
  private formatDateForCounty(year: number, month: number, day: number): string {
    const config = this.getConfig();
    const mm = month.toString().padStart(2, '0');
    const dd = day.toString().padStart(2, '0');

    switch (config.dateFormat) {
      case 'YYYY-MM-DD':
        return `${year}-${mm}-${dd}`;
      case 'DD/MM/YYYY':
        return `${dd}/${mm}/${year}`;
      case 'MM/DD/YYYY':
      default:
        return `${mm}/${dd}/${year}`;
    }
  }

  // Get URL with placeholders replaced
  private buildUrl(pattern: string, replacements: Record<string, string>): string {
    let url = pattern;
    for (const [key, value] of Object.entries(replacements)) {
      url = url.replace(`{${key}}`, encodeURIComponent(value));
    }
    return url;
  }

  // Get the search form URL
  private getSearchFormUrl(): string {
    const config = this.getConfig();
    return config.searchFormUrl || `${config.baseUrl}/search`;
  }

  // Get document detail URL for a recording number
  private getDocumentDetailUrl(recordingNumber: string): string {
    const config = this.getConfig();
    return this.buildUrl(config.documentDetailUrlPattern, { recordingNumber });
  }

  // Try each PDF URL pattern until one works
  private getPdfUrls(recordingNumber: string): string[] {
    const config = this.getConfig();
    return config.pdfUrlPatterns.map(pattern =>
      this.buildUrl(pattern, { recordingNumber })
    );
  }
}
```

### Phase 3: Replace Hard-Coded Values One by One

Start with the easiest replacements first:

1. **Search Form URL** (line 588)
   ```typescript
   // FROM:
   const searchFormUrl = 'https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRec.aspx';
   // TO:
   const searchFormUrl = this.getSearchFormUrl();
   ```

2. **Document Detail URL** (line 952)
   ```typescript
   // FROM:
   const docUrl = `https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataDetail.aspx?rec=${recordingNumber}&suf=&nm=`;
   // TO:
   const docUrl = this.getDocumentDetailUrl(recordingNumber);
   ```

3. **PDF URLs** (lines 129, 160)
   - Refactor `downloadPdf` to iterate through `this.getPdfUrls(recordingNumber)`

4. **Form Selectors** (lines 682-727)
   - Use `config.selectors.startDateField`, etc.

5. **Date Format** (line 718)
   - Use `this.formatDateForCounty(year, month, day)`

6. **Document Type** (lines 704-711)
   - Use `config.defaultDocumentType`

---

## Implementation Order

### Today/Immediate
1. **Fix the date timezone bug** (5 minutes)
   - Change lines 576-586 in county-scraper.ts to parse date strings directly

2. **Create the Maricopa config JSON** (10 minutes)
   - Use the SQL or a database tool to insert the config

### This Week
3. **Update CountyConfig interface** in `shared/schema.ts` (30 minutes)
   - Add new fields while keeping backward compatibility

4. **Add helper methods** to `PuppeteerCountyScraper` (1 hour)
   - `getConfig()`, `formatDateForCounty()`, `buildUrl()`, etc.

5. **Replace hard-coded values one at a time** (2-3 hours)
   - Start with URLs, then selectors, then document types
   - Test after each change

### Next Sprint
6. **Add second test county** (Jefferson County or another)
   - Research the county's recorder website
   - Create config JSON
   - Test with the dynamic scraper

7. **Add duplicate detection** (from enhancement doc Phase 2)
   - Add `isDuplicate` column
   - Check before Airtable sync

---

## Files to Modify

| File | Changes |
|------|---------|
| `server/services/county-scraper.ts` | Fix date parsing, add config helper methods, replace hard-coded values |
| `shared/schema.ts` | Expand `CountyConfig` interface |
| `server/storage.ts` | Add method to get county config by ID (if not exists) |
| Database | Insert Maricopa County config JSON |

---

## Testing Checklist

- [ ] Run manual automation with specific date - verify correct date is searched
- [ ] Run scheduled automation - verify "yesterday" is calculated correctly
- [ ] Verify Maricopa County config is loaded from database
- [ ] Verify scraper still finds liens after refactoring
- [ ] Verify PDFs are downloaded correctly
- [ ] Compare results before/after to ensure no regression

---

## Quick Reference: Current vs Target

| Aspect | Current (Hard-Coded) | Target (Config-Driven) |
|--------|---------------------|----------------------|
| URLs | In county-scraper.ts | `counties.config.baseUrl`, etc. |
| Selectors | In county-scraper.ts | `counties.config.selectors` |
| Document Type | `'HL'` literal | `counties.config.defaultDocumentType` |
| Date Format | `MM/DD/YYYY` assumed | `counties.config.dateFormat` |
| PDF Patterns | 2 hard-coded URLs | `counties.config.pdfUrlPatterns` |
| Adding County | Requires code change | Just add DB record |
