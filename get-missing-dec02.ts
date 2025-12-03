import { db } from './server/db';
import { liens } from './shared/schema';
import { sql, eq } from 'drizzle-orm';
import { pdfStorage } from './server/services/pdf-storage';
import * as https from 'https';

const PDF_DIR = 'stored_pdfs';

async function downloadPDF(recordingNumber: string): Promise<Buffer | null> {
  const url = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log(`  Timeout downloading ${recordingNumber}`);
      resolve(null);
    }, 15000);
    
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timeout);
        console.log(`  HTTP ${res.statusCode} for ${recordingNumber}`);
        resolve(null);
        return;
      }
      
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timeout);
        const buffer = Buffer.concat(chunks);
        if (buffer.length > 20000) {
          resolve(buffer);
        } else {
          console.log(`  PDF too small for ${recordingNumber}: ${buffer.length} bytes`);
          resolve(null);
        }
      });
      res.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
    }).on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`FETCHING MISSING DEC 2, 2025 LIENS`);
  console.log(`${'='.repeat(60)}\n`);

  // Get the 188 recording numbers from the search results
  // These are the recording numbers from Dec 2, 2025
  const allRecordingNumbers = [
    '20250692158', '20250692159', '20250692160', '20250692161', '20250692162',
    '20250692163', '20250692164', '20250692165', '20250692166', '20250692167',
    '20250692168', '20250692169', '20250692170', '20250692171', '20250692172',
    '20250692173', '20250692174', '20250692175', '20250692176', '20250692177',
    '20250692178', '20250692179', '20250692180', '20250692181', '20250692182',
    '20250692183', '20250692184', '20250692185', '20250692186', '20250692187',
    '20250692188', '20250692189', '20250692190', '20250692191', '20250692192',
    '20250692193', '20250692194', '20250692195', '20250692196', '20250692197',
    '20250692198', '20250692199', '20250692200', '20250692201', '20250692202',
    '20250692203', '20250692204', '20250692205', '20250692206', '20250692207',
    '20250692208', '20250692209', '20250692210', '20250692211', '20250692212',
    '20250692213', '20250692214', '20250692215', '20250692216', '20250692217',
    '20250692218', '20250692219', '20250692220', '20250692221', '20250692222',
    '20250692223', '20250692224', '20250692225', '20250692226', '20250692227',
    '20250692228', '20250692229', '20250692230', '20250692231', '20250692232',
    '20250692233', '20250692234', '20250692235', '20250692236', '20250692658',
    '20250692659', '20250692660', '20250692661', '20250692662', '20250692675',
    '20250692934', '20250692935', '20250692936', '20250692937', '20250692938',
    '20250692939', '20250692940', '20250692941', '20250692942', '20250692943',
    '20250692944', '20250692945', '20250692946', '20250692947', '20250692948',
    '20250692949', '20250692950', '20250692951', '20250692952', '20250692953',
    '20250692954', '20250692955', '20250692956', '20250692957', '20250692958',
    '20250692959', '20250692960', '20250692961', '20250692962', '20250692963',
    '20250692964', '20250692965', '20250692966', '20250692967', '20250692968',
    '20250692969', '20250692970', '20250692971', '20250692972', '20250692973',
    '20250692974', '20250692975', '20250692976', '20250692977', '20250692978',
    '20250692979', '20250692980', '20250692981', '20250692982', '20250692983',
    '20250692984', '20250692985', '20250693310', '20250693311', '20250693312',
    '20250693313', '20250693314', '20250693315', '20250693316', '20250693569',
    '20250693570', '20250693571', '20250693572', '20250693573', '20250693574',
    '20250693575', '20250693576', '20250693977', '20250693978', '20250694260',
    '20250694261', '20250694262', '20250694264', '20250694311', '20250694312',
    '20250694313', '20250694314', '20250694315', '20250694316', '20250694317',
    '20250694318', '20250694319', '20250694320', '20250694321', '20250694322',
    '20250694323', '20250694324', '20250694325', '20250694326', '20250694327',
    '20250694328', '20250694329', '20250694330', '20250694331', '20250694332',
    '20250694333', '20250694334', '20250694335', '20250694336', '20250694337',
    '20250694338', '20250694339', '20250694340'
  ];

  console.log(`Total expected: ${allRecordingNumbers.length}`);

  // Get existing liens from database
  const existingLiens = await db.select({ recordingNumber: liens.recordingNumber })
    .from(liens)
    .where(sql`${liens.recordingNumber} >= '20250692000' AND ${liens.recordingNumber} < '20250699999'`);
  
  const existingSet = new Set(existingLiens.map(l => l.recordingNumber));
  console.log(`Already in database: ${existingSet.size}`);

  // Find missing
  const missing = allRecordingNumbers.filter(rn => !existingSet.has(rn));
  console.log(`Missing: ${missing.length}`);
  
  if (missing.length === 0) {
    console.log('All liens already in database!');
    return;
  }

  console.log(`\nMissing recording numbers: ${missing.join(', ')}\n`);

  // Try to download each missing PDF
  let downloaded = 0;
  let failed = 0;

  for (const recordingNumber of missing) {
    console.log(`[${downloaded + failed + 1}/${missing.length}] Downloading ${recordingNumber}...`);
    
    const pdfBuffer = await downloadPDF(recordingNumber);
    
    if (pdfBuffer) {
      // Store PDF - storePdf returns the id as a string
      const pdfId = pdfStorage.storePdf(pdfBuffer, `${recordingNumber}.pdf`, recordingNumber);
      const localUrl = `https://aa4a665c-e258-4b34-bc94-cd256e00d210-00-3m6x629whoohy.kirk.replit.dev/api/pdf/${pdfId}`;
      
      // Save to database
      try {
        await db.insert(liens).values({
          id: crypto.randomUUID(),
          recordingNumber,
          countyId: 'maricopa-county',
          recordDate: new Date(),
          debtorName: 'PENDING EXTRACTION',
          amount: '0',
          pdfUrl: localUrl,
          status: 'pending'
        });
        console.log(`  ✅ Saved with PDF`);
        downloaded++;
      } catch (e) {
        console.log(`  ❌ DB error: ${e}`);
        failed++;
      }
    } else {
      console.log(`  ❌ Failed to download PDF`);
      failed++;
    }

    // Small delay
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total missing: ${missing.length}`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(console.error);
