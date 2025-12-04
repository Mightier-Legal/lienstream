import { db } from './server/db';
import { liens } from './shared/schema';
import { inArray } from 'drizzle-orm';
import { pdfStorage } from './server/services/pdf-storage';
import { AirtableService } from './server/services/airtable';
import * as crypto from 'crypto';

const ALL_DEC03_HL = [
  '20250694904', '20250694906', '20250694907', '20250694908', '20250694912', '20250694913',
  '20250694914', '20250694915', '20250694916', '20250694917', '20250694918', '20250694919',
  '20250694920', '20250694921', '20250694922', '20250694923', '20250694924', '20250694925',
  '20250694926', '20250694927', '20250694938', '20250695395', '20250695396', '20250695397',
  '20250695398', '20250695591', '20250695592', '20250695594', '20250695595', '20250695598',
  '20250695632', '20250695633', '20250695634', '20250695635', '20250695636', '20250695637',
  '20250695638', '20250695639', '20250695640', '20250695641', '20250695688', '20250695689',
  '20250695690', '20250695691', '20250695692', '20250695693', '20250695694', '20250695695',
  '20250695696', '20250695697', '20250695743', '20250695756', '20250695757', '20250695758',
  '20250695759', '20250695760', '20250695761', '20250695762', '20250695763', '20250695764',
  '20250695765', '20250695772', '20250696002', '20250696003', '20250696004', '20250696005',
  '20250696006', '20250696007', '20250696008', '20250696009', '20250696010', '20250696011',
  '20250696032', '20250696041', '20250696042', '20250696043', '20250696044', '20250696045',
  '20250696046', '20250696047', '20250696048', '20250696049', '20250696050', '20250696556',
  '20250696557', '20250696558', '20250696559', '20250696560', '20250696561', '20250696562',
  '20250696563', '20250696564', '20250696637', '20250696648', '20250696823', '20250696905',
  '20250696982', '20250697095', '20250697294', '20250697295', '20250697297', '20250697298',
  '20250697300', '20250697302', '20250697303', '20250697304', '20250697350', '20250697384',
  '20250697385', '20250697386', '20250697387', '20250697505', '20250697633', '20250697647',
  '20250697651', '20250697652', '20250697653', '20250697654', '20250697657', '20250697660',
  '20250697661', '20250697662', '20250697663', '20250697664', '20250697665', '20250697666',
  '20250697772', '20250697773', '20250697774', '20250697775', '20250697776', '20250697777',
  '20250697778', '20250697779', '20250697780', '20250697781', '20250697782', '20250697783',
  '20250697784', '20250697785', '20250697786', '20250697787', '20250697788', '20250697789',
  '20250697790', '20250697791', '20250697792', '20250697793', '20250697794', '20250697795',
  '20250697796', '20250697797', '20250697798', '20250697799', '20250697800', '20250697801',
  '20250697995', '20250697996', '20250698007', '20250698032', '20250698033', '20250698034',
  '20250698044', '20250698045', '20250698047', '20250698052', '20250698053', '20250698056',
  '20250698057', '20250698058', '20250698059', '20250698060', '20250698061', '20250698063',
  '20250698064', '20250698065', '20250698066', '20250698067', '20250698081', '20250698096',
  '20250698100', '20250698104', '20250698105', '20250698128', '20250698133', '20250698139',
  '20250698140', '20250698141', '20250698142', '20250698143', '20250698156', '20250698157',
  '20250698158', '20250698159'
];

const BASE_URL = 'https://aa4a665c-e258-4b34-bc94-cd256e00d210-00-3m6x629whoohy.kirk.replit.dev';

async function downloadPdf(recordingNumber: string): Promise<Buffer | null> {
  const url = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/pdf,*/*'
      }
    });
    
    if (!response.ok) {
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length >= 20000 ? buffer : null;
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RETRYING MISSING DEC 3, 2025 LIENS`);
  console.log(`${'='.repeat(60)}\n`);

  // Find missing liens
  const existing = await db.select().from(liens)
    .where(inArray(liens.recordingNumber, ALL_DEC03_HL));
  
  const existingNumbers = new Set(existing.map(l => l.recordingNumber));
  const missing = ALL_DEC03_HL.filter(r => !existingNumbers.has(r));
  
  console.log(`Expected: ${ALL_DEC03_HL.length}`);
  console.log(`In database: ${existing.length}`);
  console.log(`Missing: ${missing.length}`);
  
  if (missing.length === 0) {
    console.log('\nAll liens already in database!');
    return;
  }
  
  console.log(`\nMissing recording numbers: ${missing.join(', ')}\n`);

  // Download missing PDFs
  let downloaded = 0;
  let failed = 0;
  const stillMissing: string[] = [];

  for (let i = 0; i < missing.length; i++) {
    const recordingNumber = missing[i];
    process.stdout.write(`[${i + 1}/${missing.length}] ${recordingNumber}... `);
    
    const pdfBuffer = await downloadPdf(recordingNumber);
    
    if (pdfBuffer) {
      const pdfId = pdfStorage.storePdf(pdfBuffer, `${recordingNumber}.pdf`, recordingNumber);
      const localUrl = `${BASE_URL}/api/pdf/${pdfId}`;
      
      await db.insert(liens).values({
        id: crypto.randomUUID(),
        recordingNumber,
        countyId: 'maricopa-county',
        recordDate: new Date('2025-12-03'),
        debtorName: 'PENDING EXTRACTION',
        amount: '0',
        pdfUrl: localUrl,
        status: 'pending'
      });
      
      console.log(`✅`);
      downloaded++;
    } else {
      console.log(`❌`);
      failed++;
      stillMissing.push(recordingNumber);
    }
    
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDownloaded: ${downloaded}, Still missing: ${failed}`);
  
  if (stillMissing.length > 0) {
    console.log(`\n⚠️ PDFs not available for: ${stillMissing.join(', ')}`);
    console.log(`These may not be available yet from the county.`);
  }

  // Sync new liens to Airtable
  if (downloaded > 0) {
    console.log(`\n--- SYNCING NEW LIENS TO AIRTABLE ---\n`);
    
    const newLiens = await db.select().from(liens)
      .where(inArray(liens.recordingNumber, missing.filter(r => !stillMissing.includes(r))));
    
    const airtableService = new AirtableService();
    const batchSize = 10;
    let synced = 0;
    
    for (let i = 0; i < newLiens.length; i += batchSize) {
      const batch = newLiens.slice(i, i + batchSize);
      try {
        await airtableService.syncLiensToAirtable(batch);
        synced += batch.length;
        console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}: ${batch.length} synced`);
      } catch (e) {
        console.log(`❌ Batch failed: ${e}`);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    
    console.log(`\nSynced: ${synced}`);
  }

  // Final count
  const finalCount = await db.select().from(liens)
    .where(inArray(liens.recordingNumber, ALL_DEC03_HL));
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`FINAL STATUS - DEC 3, 2025`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Expected: ${ALL_DEC03_HL.length}`);
  console.log(`In database: ${finalCount.length}`);
  console.log(`Still missing: ${ALL_DEC03_HL.length - finalCount.length}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(console.error);
