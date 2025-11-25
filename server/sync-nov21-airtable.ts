import { AirtableService } from './services/airtable';
import { Logger } from './services/logger';
import { db } from './db';
import { liens } from '@shared/schema';
import { desc, gte, and, sql, isNotNull } from 'drizzle-orm';

async function syncNov21LiensToAirtable() {
  try {
    console.log('========================================');
    console.log('🚀 Syncing November 21, 2025 liens to Airtable');
    console.log('========================================\n');
    
    await Logger.info('🚀 Starting Nov 21 liens sync to Airtable', 'sync-nov21');

    const airtableService = new AirtableService();

    // Get liens from November 21, 2025 that have PDF URLs
    const startDate = new Date('2025-11-21');
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date('2025-11-21');
    endDate.setHours(23, 59, 59, 999);

    const nov21Liens = await db.select()
      .from(liens)
      .where(and(
        gte(liens.recordDate, startDate),
        sql`${liens.recordDate} <= ${endDate}`,
        isNotNull(liens.pdfUrl)
      ))
      .orderBy(desc(liens.recordDate));

    console.log(`📊 Found ${nov21Liens.length} liens from Nov 21 with PDFs\n`);

    if (nov21Liens.length === 0) {
      console.log('❌ No liens found for November 21, 2025 with PDF URLs');
      return;
    }

    // Transform liens to Airtable format
    const liensForAirtable = nov21Liens.map((lien: any) => ({
      recordingNumber: lien.recordingNumber,
      recordingDate: lien.recordDate,
      documentUrl: lien.documentUrl,
      pdfUrl: lien.pdfUrl,
      debtor: lien.debtorName || 'Unknown',
      amount: lien.amount || 0,
      county: 'maricopa-county',
      scrapedAt: lien.createdAt?.toISOString() || new Date().toISOString(),
      documentCode: 'HL'
    }));

    console.log(`📤 Starting Airtable sync for ${liensForAirtable.length} liens...\n`);

    // Sync to Airtable in batches (Airtable API limits to 10 records per request)
    const batchSize = 10;
    let totalSynced = 0;
    let totalFailed = 0;

    for (let i = 0; i < liensForAirtable.length; i += batchSize) {
      const batch = liensForAirtable.slice(i, i + batchSize);
      const batchNum = Math.floor(i/batchSize) + 1;
      const totalBatches = Math.ceil(liensForAirtable.length/batchSize);
      
      try {
        await airtableService.syncLiensToAirtable(batch);
        totalSynced += batch.length;
        console.log(`✅ Batch ${batchNum}/${totalBatches}: ${batch.length} liens synced`);
      } catch (error: any) {
        totalFailed += batch.length;
        console.error(`❌ Batch ${batchNum}/${totalBatches} failed:`, error.message);
        await Logger.error(`Failed to sync batch ${batchNum}: ${error.message}`, 'sync-nov21');
      }
    }

    await Logger.success(`✨ Nov 21 sync completed: ${totalSynced} liens synced, ${totalFailed} failed`, 'sync-nov21');
    
    console.log('\n========================================');
    console.log('✨ AIRTABLE SYNC COMPLETE!');
    console.log('========================================');
    console.log(`📊 Total liens synced: ${totalSynced}`);
    console.log(`❌ Failed: ${totalFailed}`);
    console.log(`📈 Success rate: ${((totalSynced / liensForAirtable.length) * 100).toFixed(1)}%`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Error during Airtable sync:', error);
    await Logger.error(`Nov 21 Airtable sync failed: ${error}`, 'sync-nov21');
  }
}

// Run the sync
syncNov21LiensToAirtable().catch(console.error);