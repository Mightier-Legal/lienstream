import { db } from './server/db';
import { liens } from './shared/schema';
import { sql, eq } from 'drizzle-orm';
import { AirtableService } from './server/services/airtable';
import * as fs from 'fs';
import * as path from 'path';

const PDF_DIR = 'stored_pdfs';

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SYNCING DEC 1, 2025 LIENS TO AIRTABLE`);
  console.log(`${'='.repeat(60)}\n`);

  // Get all Dec 1 liens (recording numbers in the 20250688xxx-20250691xxx range)
  const dec1Liens = await db.select().from(liens)
    .where(sql`${liens.recordingNumber} >= '20250688000' AND ${liens.recordingNumber} < '20250699999'`);
  
  console.log(`Total Dec 1 liens: ${dec1Liens.length}\n`);
  
  // Verify all have valid PDFs
  const liensWithValidPdfs: typeof dec1Liens = [];
  const liensWithoutPdfs: typeof dec1Liens = [];
  
  for (const lien of dec1Liens) {
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
    console.log(`\n⚠️ WARNING: ${liensWithoutPdfs.length} liens without valid PDFs will NOT be synced!`);
    console.log(`Missing: ${liensWithoutPdfs.map(l => l.recordingNumber).join(', ')}`);
  }
  
  if (liensWithValidPdfs.length === 0) {
    console.log('\n❌ No liens have valid PDFs - cannot sync to Airtable');
    return;
  }
  
  // Filter to only pending liens (not already synced)
  const liensToSync = liensWithValidPdfs.filter(l => !l.airtableRecordId);
  
  console.log(`\nLiens to sync (pending): ${liensToSync.length}\n`);
  
  if (liensToSync.length === 0) {
    console.log('All liens already synced!');
    return;
  }

  // Sync to Airtable
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
  console.log(`FINAL SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total liens: ${dec1Liens.length}`);
  console.log(`With valid PDFs: ${liensWithValidPdfs.length}`);
  console.log(`Synced to Airtable: ${syncedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(console.error);
