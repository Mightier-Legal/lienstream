/**
 * Script to fix localhost:5000 URLs in the database
 *
 * This script:
 * 1. Finds all liens with localhost:5000 in pdf_url or document_url
 * 2. Replaces with the correct Replit dev domain
 * 3. Sets status to 'pending' so they can be re-synced to Airtable
 *
 * Usage: node scripts/fix-localhost-urls.js
 */

import { db } from '../server/db';
import { liens } from '../shared/schema';
import { like, or, sql } from 'drizzle-orm';

// The correct Replit dev domain base URL
const CORRECT_BASE_URL = 'https://aa4a665c-e258-4b34-bc94-cd256e00d210-00-3m6x629whoohy.kirk.replit.dev';
const LOCALHOST_PATTERN = 'http://localhost:5000';

async function fixLocalhostUrls() {
  console.log('='.repeat(60));
  console.log('Fix Localhost URLs Script');
  console.log('='.repeat(60));
  console.log(`\nReplacing: ${LOCALHOST_PATTERN}`);
  console.log(`With: ${CORRECT_BASE_URL}\n`);

  try {
    // Step 1: Find all liens with localhost:5000 in their URLs
    console.log('Step 1: Finding liens with localhost:5000 URLs...\n');

    const affectedLiens = await db.select()
      .from(liens)
      .where(
        or(
          like(liens.pdfUrl, '%localhost:5000%'),
          like(liens.documentUrl, '%localhost:5000%')
        )
      );

    console.log(`Found ${affectedLiens.length} liens with localhost:5000 URLs\n`);

    if (affectedLiens.length === 0) {
      console.log('No liens to fix. Exiting.');
      process.exit(0);
    }

    // Step 2: Display what will be changed
    console.log('Step 2: Preview of changes:\n');
    console.log('-'.repeat(60));

    for (const lien of affectedLiens) {
      console.log(`Recording: ${lien.recordingNumber}`);
      console.log(`  Current Status: ${lien.status}`);
      console.log(`  PDF URL: ${lien.pdfUrl || 'null'}`);
      console.log(`  Doc URL: ${lien.documentUrl || 'null'}`);
      console.log('');
    }

    console.log('-'.repeat(60));
    console.log(`\nTotal liens to update: ${affectedLiens.length}`);
    console.log('All will have status set to: pending\n');

    // Step 3: Perform the updates
    console.log('Step 3: Updating records...\n');

    let updated = 0;
    let errors = 0;

    for (const lien of affectedLiens) {
      try {
        const newPdfUrl = lien.pdfUrl?.replace(LOCALHOST_PATTERN, CORRECT_BASE_URL) || null;
        const newDocUrl = lien.documentUrl?.replace(LOCALHOST_PATTERN, CORRECT_BASE_URL) || null;

        await db.update(liens)
          .set({
            pdfUrl: newPdfUrl,
            documentUrl: newDocUrl,
            status: 'pending',
            updatedAt: new Date()
          })
          .where(sql`${liens.id} = ${lien.id}`);

        console.log(`✓ Updated ${lien.recordingNumber}`);
        console.log(`    New PDF URL: ${newPdfUrl}`);
        console.log(`    Status: pending`);
        updated++;
      } catch (error) {
        console.error(`✗ Failed to update ${lien.recordingNumber}: ${error.message}`);
        errors++;
      }
    }

    // Step 4: Summary
    console.log('\n' + '='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`Total processed: ${affectedLiens.length}`);
    console.log(`Successfully updated: ${updated}`);
    console.log(`Errors: ${errors}`);
    console.log('\nThese liens now have status "pending" and can be re-synced to Airtable.');
    console.log('='.repeat(60));

    process.exit(errors > 0 ? 1 : 0);

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

fixLocalhostUrls();
