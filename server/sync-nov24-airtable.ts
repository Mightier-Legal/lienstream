import { db } from './db';
import { liens } from '@shared/schema';
import { eq, and, gte, lt, ne } from 'drizzle-orm';
import { AirtableService } from './services/airtable';

async function syncNov24ToAirtable() {
  console.log('Starting sync of November 24, 2025 liens to Airtable...');
  
  const airtableService = new AirtableService();
  
  const nov24Liens = await db.select().from(liens)
    .where(and(
      gte(liens.recordDate, new Date('2025-11-24')),
      lt(liens.recordDate, new Date('2025-11-25')),
      ne(liens.status, 'synced')
    ));
  
  console.log(`Found ${nov24Liens.length} pending liens from November 24, 2025`);
  
  if (nov24Liens.length === 0) {
    console.log('All liens already synced!');
    process.exit(0);
  }

  const liensWithPdf = nov24Liens.filter(l => l.pdfUrl);
  const liensWithoutPdf = nov24Liens.filter(l => !l.pdfUrl);
  
  console.log(`Liens with PDF: ${liensWithPdf.length}`);
  console.log(`Liens without PDF: ${liensWithoutPdf.length}`);
  
  const pdfSuccessRate = (liensWithPdf.length / nov24Liens.length) * 100;
  console.log(`PDF success rate: ${pdfSuccessRate.toFixed(1)}%`);
  
  if (pdfSuccessRate < 50) {
    console.error('ERROR: Less than 50% of liens have PDFs. Aborting sync.');
    process.exit(1);
  }

  const BATCH_SIZE = 10;
  const batches = [];
  for (let i = 0; i < liensWithPdf.length; i += BATCH_SIZE) {
    batches.push(liensWithPdf.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`Processing ${batches.length} batches...`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    try {
      await airtableService.syncLiensToAirtable(batch);
      
      for (const lien of batch) {
        await db.update(liens)
          .set({ status: 'synced' })
          .where(eq(liens.id, lien.id));
      }
      
      successCount += batch.length;
      console.log(`✅ Batch ${i + 1}/${batches.length}: ${batch.length} liens synced`);
      
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      failCount += batch.length;
      console.error(`❌ Batch ${i + 1}/${batches.length} failed:`, error);
    }
  }
  
  console.log('\n=== SYNC COMPLETE ===');
  console.log(`Successfully synced: ${successCount} liens`);
  console.log(`Failed: ${failCount} liens`);
  console.log(`Skipped (no PDF): ${liensWithoutPdf.length} liens`);
  
  process.exit(0);
}

syncNov24ToAirtable().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
