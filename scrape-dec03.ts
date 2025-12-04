import { db } from './server/db';
import { liens } from './shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { pdfStorage } from './server/services/pdf-storage';
import { AirtableService } from './server/services/airtable';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const DEC03_HL_RECORDS = [
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

const PDF_DIR = 'stored_pdfs';
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
      console.log(`  HTTP ${response.status}`);
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    if (buffer.length < 20000) {
      console.log(`  PDF too small: ${buffer.length} bytes`);
      return null;
    }
    
    return buffer;
  } catch (e) {
    console.log(`  Error: ${e}`);
    return null;
  }
}

function verifyPdf(pdfUrl: string): boolean {
  if (!pdfUrl || !pdfUrl.includes('/api/pdf/')) return false;
  
  const pdfId = pdfUrl.split('/api/pdf/')[1];
  const pdfPath = path.join(PDF_DIR, `${pdfId}.pdf`);
  
  if (!fs.existsSync(pdfPath)) return false;
  
  const stats = fs.statSync(pdfPath);
  return stats.size > 20000;
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SCRAPING DEC 3, 2025 MEDICAL LIENS (HL)`);
  console.log(`${'='.repeat(60)}\n`);

  console.log(`Total HL records from county: ${DEC03_HL_RECORDS.length}\n`);

  // Check which ones already exist in database
  const existing = await db.select().from(liens)
    .where(inArray(liens.recordingNumber, DEC03_HL_RECORDS));
  
  const existingNumbers = new Set(existing.map(l => l.recordingNumber));
  const toDownload = DEC03_HL_RECORDS.filter(r => !existingNumbers.has(r));
  
  console.log(`Already in database: ${existing.length}`);
  console.log(`Need to download: ${toDownload.length}\n`);

  // STEP 1: Download PDFs and save to database
  console.log(`--- STEP 1: DOWNLOADING PDFs ---\n`);
  
  let downloaded = 0;
  let failed = 0;
  const failedNumbers: string[] = [];

  for (let i = 0; i < toDownload.length; i++) {
    const recordingNumber = toDownload[i];
    process.stdout.write(`[${i + 1}/${toDownload.length}] ${recordingNumber}... `);
    
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
      failedNumbers.push(recordingNumber);
    }
    
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nDownload complete: ${downloaded} success, ${failed} failed`);
  
  if (failedNumbers.length > 0) {
    console.log(`Failed recording numbers: ${failedNumbers.join(', ')}`);
  }

  // STEP 2: Verify ALL liens have valid PDFs
  console.log(`\n--- STEP 2: VERIFYING PDFs ---\n`);
  
  const allDec03Liens = await db.select().from(liens)
    .where(inArray(liens.recordingNumber, DEC03_HL_RECORDS));
  
  const liensWithValidPdfs: typeof allDec03Liens = [];
  const liensWithoutPdfs: typeof allDec03Liens = [];
  
  for (const lien of allDec03Liens) {
    if (lien.pdfUrl && verifyPdf(lien.pdfUrl)) {
      liensWithValidPdfs.push(lien);
    } else {
      liensWithoutPdfs.push(lien);
    }
  }
  
  console.log(`Total liens: ${allDec03Liens.length}`);
  console.log(`With valid PDFs: ${liensWithValidPdfs.length}`);
  console.log(`Without valid PDFs: ${liensWithoutPdfs.length}`);
  
  if (liensWithoutPdfs.length > 0) {
    console.log(`\n❌ ERROR: ${liensWithoutPdfs.length} liens are missing valid PDFs!`);
    console.log(`Cannot proceed with Airtable sync until ALL liens have PDFs.`);
    console.log(`Missing: ${liensWithoutPdfs.map(l => l.recordingNumber).join(', ')}`);
    return;
  }

  // STEP 3: Sync to Airtable
  console.log(`\n--- STEP 3: SYNCING TO AIRTABLE ---\n`);
  
  const liensToSync = liensWithValidPdfs.filter(l => !l.airtableRecordId);
  console.log(`Liens to sync: ${liensToSync.length}`);
  
  if (liensToSync.length === 0) {
    console.log('All liens already synced!');
  } else {
    const airtableService = new AirtableService();
    const batchSize = 10;
    let synced = 0;
    let syncFailed = 0;
    
    for (let i = 0; i < liensToSync.length; i += batchSize) {
      const batch = liensToSync.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(liensToSync.length / batchSize);
      
      try {
        await airtableService.syncLiensToAirtable(batch);
        synced += batch.length;
        console.log(`✅ Batch ${batchNum}/${totalBatches}: ${batch.length} synced`);
      } catch (e) {
        console.log(`❌ Batch ${batchNum}/${totalBatches} failed: ${e}`);
        syncFailed += batch.length;
      }
      
      await new Promise(r => setTimeout(r, 1500));
    }
    
    console.log(`\nSync complete: ${synced} success, ${syncFailed} failed`);
  }

  // FINAL SUMMARY
  console.log(`\n${'='.repeat(60)}`);
  console.log(`FINAL SUMMARY - DEC 3, 2025`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Expected HL records: ${DEC03_HL_RECORDS.length}`);
  console.log(`In database: ${allDec03Liens.length}`);
  console.log(`With valid PDFs: ${liensWithValidPdfs.length}`);
  console.log(`PDF success rate: ${Math.round(liensWithValidPdfs.length / allDec03Liens.length * 100)}%`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(console.error);
