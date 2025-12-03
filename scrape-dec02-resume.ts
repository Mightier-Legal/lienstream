import { MaricopaCountyScraper } from './server/services/county-scraper';
import { db } from './server/db';
import { liens } from './shared/schema';
import { sql, eq, inArray } from 'drizzle-orm';
import { AirtableService } from './server/services/airtable';
import * as fs from 'fs';
import * as path from 'path';

const TARGET_DATE = '12/02/2025';
const PDF_DIR = 'stored_pdfs';

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESUMING SCRAPE FOR ${TARGET_DATE}`);
  console.log(`${'='.repeat(60)}\n`);

  const county = {
    id: 'maricopa-county',
    name: 'Maricopa County',
    state: 'AZ',
    searchUrl: 'https://legacy.recorder.maricopa.gov/recdocdata/',
    documentTypes: ['HL']
  };

  const config = {
    dateFormat: 'MM/DD/YYYY',
    documentCode: 'HL',
    maxRetries: 3,
    retryDelay: 2000
  };

  const scraper = new MaricopaCountyScraper(county, config);

  try {
    console.log('--- RESUMING SCRAPE ---\n');
    const results = await scraper.scrapeCountyLiens(TARGET_DATE, TARGET_DATE);
    console.log(`\nScraping complete: ${results.liensFound} liens processed\n`);

  } finally {
    await scraper.cleanup();
  }

  // Step 2: Check what we have in database
  console.log('--- VERIFYING DATABASE RECORDS ---\n');
  
  const dec2Liens = await db.select().from(liens)
    .where(sql`${liens.recordingNumber} >= '20250692000' AND ${liens.recordingNumber} < '20250699999'`);
  
  console.log(`Dec 2 liens in database: ${dec2Liens.length}`);

  // Step 3: Verify PDFs
  console.log('\n--- VERIFYING PDFs ---\n');
  
  const liensWithValidPdfs: typeof dec2Liens = [];
  const liensWithoutPdfs: typeof dec2Liens = [];
  
  for (const lien of dec2Liens) {
    if (!lien.pdfUrl || !lien.pdfUrl.includes('/api/pdf/')) {
      liensWithoutPdfs.push(lien);
      continue;
    }
    
    const pdfId = lien.pdfUrl.split('/api/pdf/')[1];
    const pdfPath = path.join(PDF_DIR, `${pdfId}.pdf`);
    const jsonPath = path.join(PDF_DIR, `${pdfId}.json`);
    
    if (fs.existsSync(pdfPath) && fs.existsSync(jsonPath)) {
      const stats = fs.statSync(pdfPath);
      if (stats.size > 20000) {
        liensWithValidPdfs.push(lien);
      } else {
        console.log(`PDF too small for ${lien.recordingNumber}: ${stats.size} bytes`);
        liensWithoutPdfs.push(lien);
      }
    } else {
      console.log(`PDF files missing for ${lien.recordingNumber}`);
      liensWithoutPdfs.push(lien);
    }
  }
  
  console.log(`With valid PDFs: ${liensWithValidPdfs.length}`);
  console.log(`Without valid PDFs: ${liensWithoutPdfs.length}`);
  
  if (liensWithoutPdfs.length > 0) {
    console.log(`\n⚠️ WARNING: ${liensWithoutPdfs.length} liens without valid PDFs!`);
    console.log(`Missing: ${liensWithoutPdfs.map(l => l.recordingNumber).join(', ')}`);
    console.log('\n❌ STOPPING - All liens must have valid PDFs before syncing to Airtable');
    return;
  }
  
  if (liensWithValidPdfs.length === 0) {
    console.log('\n❌ No liens have valid PDFs - cannot sync to Airtable');
    return;
  }

  // Step 4: Sync to Airtable
  console.log('\n--- SYNCING TO AIRTABLE ---\n');
  
  const liensToSync = liensWithValidPdfs.filter(l => !l.airtableRecordId);
  console.log(`Liens to sync (pending): ${liensToSync.length}`);
  
  if (liensToSync.length === 0) {
    console.log('All liens already synced!');
    return;
  }

  const airtableService = new AirtableService();
  const batchSize = 10;
  let syncedCount = 0;
  let failedCount = 0;
  
  for (let i = 0; i < liensToSync.length; i += batchSize) {
    const batch = liensToSync.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(liensToSync.length / batchSize);
    
    try {
      await airtableService.syncLiensToAirtable(batch);
      syncedCount += batch.length;
      console.log(`✅ Batch ${batchNum}/${totalBatches}: ${batch.length} liens synced`);
    } catch (error) {
      console.log(`❌ Batch ${batchNum} failed: ${error}`);
      failedCount += batch.length;
    }
    
    await new Promise(r => setTimeout(r, 1500));
  }

  // Final summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`FINAL SUMMARY FOR ${TARGET_DATE}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total liens in database: ${dec2Liens.length}`);
  console.log(`With valid PDFs: ${liensWithValidPdfs.length}`);
  console.log(`Synced to Airtable: ${syncedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(console.error);
