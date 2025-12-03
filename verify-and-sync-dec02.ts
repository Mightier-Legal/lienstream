import { db } from './server/db';
import { liens } from './shared/schema';
import { sql, eq } from 'drizzle-orm';
import { AirtableService } from './server/services/airtable';
import * as fs from 'fs';
import * as path from 'path';

const PDF_DIR = 'stored_pdfs';

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`VERIFYING AND SYNCING DEC 2, 2025 LIENS`);
  console.log(`${'='.repeat(60)}\n`);

  // Get all Dec 2 liens
  const dec2Liens = await db.select().from(liens)
    .where(sql`${liens.recordingNumber} >= '20250692000' AND ${liens.recordingNumber} < '20250699999'`);
  
  console.log(`Total Dec 2 liens in database: ${dec2Liens.length}\n`);

  // Verify PDFs
  console.log('--- VERIFYING PDFs ---\n');
  
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
  
  console.log(`\nWith valid PDFs: ${liensWithValidPdfs.length}`);
  console.log(`Without valid PDFs: ${liensWithoutPdfs.length}`);
  
  if (liensWithoutPdfs.length > 0) {
    console.log(`\n⚠️ WARNING: ${liensWithoutPdfs.length} liens without valid PDFs!`);
    console.log(`These will NOT be synced to Airtable.`);
    console.log(`Missing: ${liensWithoutPdfs.map(l => l.recordingNumber).join(', ')}`);
  }
  
  if (liensWithValidPdfs.length === 0) {
    console.log('\n❌ No liens have valid PDFs - cannot sync to Airtable');
    return;
  }

  // Check if ALL liens have valid PDFs
  if (liensWithoutPdfs.length > 0) {
    console.log(`\n❌ STOPPING - ${liensWithoutPdfs.length} liens are missing valid PDFs.`);
    console.log('Per requirements, all liens must have PDFs before syncing.');
    console.log('\nTo proceed, either:');
    console.log('1. Re-download missing PDFs');
    console.log('2. Or remove the liens without PDFs from database');
    return;
  }

  // Sync to Airtable
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
  console.log(`FINAL SUMMARY FOR DEC 2, 2025`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total liens in database: ${dec2Liens.length}`);
  console.log(`With valid PDFs: ${liensWithValidPdfs.length}`);
  console.log(`Synced to Airtable: ${syncedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(console.error);
