# LienStream UI Visibility & Customization Plan

## Current State Analysis

### Issues Identified

#### 1. **Status Cards Show Incorrect Data** - FIXED
- **Problem**: Cards show "0" and "No activity today" even when Replit shows 52 records
- **Root Cause**: The `getDashboardStats()` in `server/database-storage.ts:308-383` filters by `recordDate` within today's date range, but if liens were recorded on a different date (e.g., yesterday's liens scraped today), they won't show
- **Also**: Frontend expects `totalProcessed` and `pendingSync` but backend returns `mailersSent` and `activeLeads`
- **Resolution**: Changed date filtering from `recordDate` to `createdAt` to show liens based on when they were scraped, not when they were recorded

#### 2. **Automation Controls Not Interactive**
- **Problem**: "Processing Pipeline" section is read-only, shows static status
- **Current**: Just displays County Scraping / PDF Download / Airtable Sync with status
- **Missing**: No real-time progress, no per-step controls, no retry buttons

#### 3. **System Logs Limited**
- **Problem**: Shows all logs, no filtering by level (error/warning/info)
- **Missing**: No "View All" link to dedicated logs page, no export, no search

#### 4. **Counties Page - No Edit Capability** - FIXED
- **Problem**: Can only Enable/Disable counties, cannot edit configuration
- **Missing**: Edit button, inline config editor, selector testing
- **Resolution**: Added Edit button and modal with fields for: County Name, State, Base URL, Search URL, Document URL Pattern, Document Type Value, Page Load Delay, Between Requests Delay

---

## Quick Wins (1-2 hours each)

### QW1. Fix Status Cards Data Mismatch
**Files**:
- `client/src/components/status-cards.tsx`
- `server/database-storage.ts`
- `server/routes.ts`

**Changes**:
1. Update backend `getDashboardStats()` to return actual counts:
   - `todaysLiens` - liens with recordDate = selected date
   - `airtableSynced` - liens with status='synced' for that date
   - `totalProcessed` - total liens processed (with PDFs)
   - `pendingSync` - liens with status='pending'
2. Update frontend interface to match

### QW2. Add Log Level Filtering
**Files**: `client/src/components/system-logs.tsx`

**Changes**:
1. Add filter buttons: All | Errors | Warnings | Info | Success
2. Filter logs client-side based on `log.level`
3. Add "View All Logs" link to new `/logs` page

### QW3. Add County Edit Button
**Files**: `client/src/pages/counties.tsx`

**Changes**:
1. Add "Edit" button next to Enable/Disable
2. Open modal or expand inline form with current config
3. Add PATCH endpoint support (already exists at `/api/counties/:id`)

---

## Medium Effort (Half day each)

### M1. Real-time Automation Progress
**Files**:
- `client/src/components/automation-status.tsx`
- `server/services/scheduler.ts`
- `server/routes.ts`

**Changes**:
1. Add WebSocket or SSE endpoint for live progress
2. Track progress: `{ step: 'scraping', progress: 45, current: 23, total: 52 }`
3. Show actual progress bar with percentage
4. Add current recording number being processed

### M2. Dedicated Logs Page
**Files**: New `client/src/pages/logs.tsx`

**Changes**:
1. Full-page log viewer with pagination
2. Date range filter
3. Level filter (checkboxes)
4. Component filter (scheduler, scraper, airtable, etc.)
5. Search box for message text
6. Export to CSV button

### M3. County Configuration Editor
**Files**:
- `client/src/pages/counties.tsx`
- New component `county-config-editor.tsx`

**Changes**:
1. Modal with tabs: General | Selectors | Parsing | Delays
2. JSON editor with syntax highlighting
3. "Test Connection" button to verify URL is reachable
4. "Test Selectors" to run a dry scrape and show what matches

---

## Larger Improvements (1+ day)

### L1. Dashboard Redesign
**Proposed Structure**:
```
Dashboard
├── Header (title, date picker, Run Now button)
├── Status Cards (4 cards - working correctly)
├── Live Progress Panel (when running)
│   ├── Current step indicator
│   ├── Progress bar with %
│   └── Current recording # being processed
├── Recent Liens Table (last 10)
└── Quick Stats footer
```

Move to separate pages:
- `/logs` - Full system logs with filtering
- `/settings` - Schedule settings
- `/counties` - County management (already exists)

### L2. Sidebar Restructure
**Current**:
- Dashboard
- Counties

**Proposed**:
```
Dashboard
Activity
├── Recent Liens
├── System Logs
├── Automation Runs
Configuration
├── Counties
├── Schedule
├── Settings
```

### L3. Failed Liens Review Panel
**New Feature**:
- Show liens that failed PDF download
- Allow manual retry per lien
- Approve/Reject for Airtable sync
- Already has backend: `/api/liens/failed`, `/api/liens/failed/approve`

---

## Implementation Priority

### Phase 1: Fix What's Broken (This Week)
1. [x] Get app running locally - DONE
2. [x] **QW1**: Fix Status Cards data - DONE (changed filtering from recordDate to createdAt)
3. [ ] **QW2**: Add log level filtering
4. [x] **QW3**: Add County edit button - DONE (added Edit modal with essential config fields)
5. [x] **NEW**: Add Run History page - DONE (table layout with status/type filters, shows automation runs)

### Phase 2: Improve Visibility (Next Week)
6. [ ] **M2**: Dedicated Logs page
7. [ ] **M1**: Real-time automation progress
8. [ ] **L3**: Failed liens review panel

### Phase 3: Polish (Following Week)
9. [ ] **L1**: Dashboard redesign
10. [ ] **L2**: Sidebar restructure
11. [ ] **M3**: County configuration editor (partially done - basic modal exists, could add JSON editor/test buttons)

---

## Files Reference

| File | Purpose |
|------|---------|
| `server/database-storage.ts` | Database queries, getDashboardStats() |
| `server/routes.ts` | API endpoints |
| `server/services/scheduler.ts` | Automation orchestration |
| `server/services/county-scraper.ts` | Web scraping logic (1200+ lines) |
| `client/src/components/status-cards.tsx` | Dashboard stat cards |
| `client/src/components/system-logs.tsx` | Log display widget |
| `client/src/components/automation-status.tsx` | Pipeline status display |
| `client/src/pages/counties.tsx` | County management page |
| `client/src/pages/dashboard.tsx` | Main dashboard layout |
| `client/src/pages/runs.tsx` | Run History page (NEW) |
| `client/src/components/sidebar.tsx` | Sidebar navigation |

---

## Notes

- Airtable sync will fail without API key - that's OK for UI development
- The scraper uses Puppeteer which won't work well on Windows - test UI changes only locally
- Database is shared with production - be careful with data modifications
