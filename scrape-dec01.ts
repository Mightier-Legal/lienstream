import { createCountyScraper, PuppeteerCountyScraper } from './server/services/county-scraper';
import { AirtableService } from './server/services/airtable';
import { db } from './server/db';
import { liens } from './shared/schema';
import { sql, eq } from 'drizzle-orm';
import { pdfStorage } from './server/services/pdf-storage';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const TARGET_DATE = '2025-12-01';
const PDF_DIR = 'stored_pdfs';

function downloadPdfDirect(recordingNumber: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const url = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        resolve(null);
        return;
      }
      
      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('pdf')) {
        resolve(null);
        return;
      }
      
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        if (buffer.length > 1000 && buffer.slice(0, 4).toString() === '%PDF') {
          resolve(buffer);
        } else {
          resolve(null);
        }
      });
      response.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SCRAPING LIENS FOR ${TARGET_DATE}`);
  console.log(`${'='.repeat(60)}\n`);

  const baseUrl = process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : 'http://localhost:5000';

  // Step 1: Scrape liens
  console.log('--- STEP 1: SCRAPING LIENS ---\n');
  
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
    requiresLogin: false as const
  };
  
  const scraper = createCountyScraper(county, config) as PuppeteerCountyScraper;
  let scrapedLiens: any[] = [];
  
  try {
    await scraper.initialize();
    scrapedLiens = await scraper.scrapeCountyLiens(TARGET_DATE, TARGET_DATE);
    console.log(`Found ${scrapedLiens.length} liens\n`);
  } catch (error) {
    console.log(`Scraper error: ${error}`);
    await scraper.cleanup();
    return;
  } finally {
    await scraper.cleanup();
  }

  if (scrapedLiens.length === 0) {
    console.log('No liens found for this date');
    return;
  }

  // Step 2: Save liens to database with PDFs
  console.log('--- STEP 2: DOWNLOADING PDFs AND SAVING TO DATABASE ---\n');
  
  let savedCount = 0;
  let existingCount = 0;
  let pdfSuccessCount = 0;
  let pdfFailCount = 0;
  
  for (let i = 0; i < scrapedLiens.length; i++) {
    const lien = scrapedLiens[i];
    console.log(`[${i + 1}/${scrapedLiens.length}] ${lien.recordingNumber}...`);
    
    // Check if already exists
    const existing = await db.select().from(liens)
      .where(eq(liens.recordingNumber, lien.recordingNumber))
      .limit(1);
    
    if (existing.length > 0) {
      existingCount++;
      console.log(`    Already exists`);
      // Still check if PDF needs to be downloaded
      if (!existing[0].pdfUrl || existing[0].status === 'no_pdf') {
        const pdfBuffer = await downloadPdfDirect(lien.recordingNumber);
        if (pdfBuffer && pdfBuffer.length > 20000) {
          const pdfId = pdfStorage.storePdf(pdfBuffer, lien.recordingNumber);
          const pdfUrl = `${baseUrl}/api/pdf/${pdfId}`;
          await db.update(liens)
            .set({ pdfUrl, status: 'pending' })
            .where(eq(liens.id, existing[0].id));
          pdfSuccessCount++;
          console.log(`    ✅ PDF downloaded (${pdfBuffer.length} bytes)`);
        }
      } else {
        console.log(`    Already has PDF`);
      }
      continue;
    }
    
    // Download PDF directly
    let pdfUrl: string | null = null;
    const pdfBuffer = await downloadPdfDirect(lien.recordingNumber);
    
    if (pdfBuffer && pdfBuffer.length > 20000) {
      const pdfId = pdfStorage.storePdf(pdfBuffer, lien.recordingNumber);
      pdfUrl = `${baseUrl}/api/pdf/${pdfId}`;
      pdfSuccessCount++;
      console.log(`    ✅ PDF downloaded (${pdfBuffer.length} bytes)`);
    } else {
      pdfFailCount++;
      console.log(`    ❌ PDF not available yet`);
    }
    
    // Save to database
    try {
      await db.insert(liens).values({
        id: crypto.randomUUID(),
        recordingNumber: lien.recordingNumber,
        recordDate: lien.recordDate || TARGET_DATE,
        documentType: lien.documentType || 'HL',
        grantorGrantee: lien.grantorGrantee || '',
        documentUrl: lien.documentUrl || '',
        pdfUrl: pdfUrl,
        status: pdfUrl ? 'pending' : 'no_pdf',
        createdAt: new Date()
      });
      savedCount++;
    } catch (err) {
      console.log(`    DB error: ${err}`);
    }
    
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\nNew: ${savedCount}, Existing: ${existingCount}, PDFs: ${pdfSuccessCount} success, ${pdfFailCount} failed\n`);

  // Step 3: Verify all PDFs before Airtable sync
  console.log('--- STEP 3: VERIFYING PDFs ---\n');
  
  const allLiens = await db.select().from(liens)
    .where(sql`${liens.recordDate} = ${TARGET_DATE}`);
  
  const liensWithValidPdfs: typeof allLiens = [];
  const liensWithoutPdfs: typeof allLiens = [];
  
  for (const lien of allLiens) {
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
        liensWithoutPdfs.push(lien);
      }
    } else {
      liensWithoutPdfs.push(lien);
    }
  }
  
  console.log(`Total liens: ${allLiens.length}`);
  console.log(`With valid PDFs: ${liensWithValidPdfs.length}`);
  console.log(`Without PDFs: ${liensWithoutPdfs.length}`);
  
  if (liensWithoutPdfs.length > 0) {
    console.log(`\n⚠️  WARNING: ${liensWithoutPdfs.length} liens do not have valid PDFs!`);
    console.log(`These will NOT be synced to Airtable.\n`);
    console.log(`Missing PDFs for: ${liensWithoutPdfs.map(l => l.recordingNumber).join(', ')}`);
  }
  
  if (liensWithValidPdfs.length === 0) {
    console.log('\n❌ No liens have valid PDFs - cannot sync to Airtable');
    return;
  }

  // Step 4: Sync to Airtable
  console.log('\n--- STEP 4: SYNCING TO AIRTABLE ---\n');
  
  const airtableService = new AirtableService();
  const batchSize = 10;
  let syncedCount = 0;
  
  // Only sync liens that don't already have an Airtable ID
  const liensToSync = liensWithValidPdfs.filter(l => !l.airtableRecordId);
  
  console.log(`Liens to sync (with PDFs, not already synced): ${liensToSync.length}\n`);
  
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
    }
    
    await new Promise(r => setTimeout(r, 1500));
  }

  // Final summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`FINAL SUMMARY FOR ${TARGET_DATE}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total liens scraped: ${scrapedLiens.length}`);
  console.log(`Liens with valid PDFs: ${liensWithValidPdfs.length}`);
  console.log(`Liens without PDFs: ${liensWithoutPdfs.length}`);
  console.log(`Synced to Airtable: ${syncedCount}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(console.error);
