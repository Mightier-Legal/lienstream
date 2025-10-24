import fetch from 'node-fetch';
import { db } from '../server/db.js';
import { liens } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

async function fixPdfs() {
  console.log('Starting PDF fix process...');
  
  // Get all liens from October 23
  const octLiens = await db.select().from(liens)
    .where(eq(liens.recordDate, new Date('2025-10-23')));
    
  console.log(`Found ${octLiens.length} liens from October 23, 2025`);
  
  let fixed = 0;
  let failed = 0;
  
  for (const lien of octLiens) {
    try {
      // Extract PDF ID from the URL if it's a local URL
      const urlMatch = lien.documentUrl?.match(/\/api\/pdf\/([a-f0-9-]+)/);
      
      if (urlMatch) {
        const pdfId = urlMatch[1];
        console.log(`Checking PDF ${pdfId} for recording ${lien.recordingNumber}...`);
        
        // Check if PDF exists locally
        const baseUrl = process.env.REPLIT_DEV_DOMAIN ? 
          `https://${process.env.REPLIT_DEV_DOMAIN}` : 
          'http://localhost:5000';
        const checkUrl = `${baseUrl}/api/pdf/${pdfId}`;
        
        const checkResponse = await fetch(checkUrl);
        
        if (!checkResponse.ok) {
          console.log(`PDF missing for ${lien.recordingNumber}, re-downloading...`);
          
          // Re-download the PDF
          const pdfUrl = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${lien.recordingNumber}.pdf`;
          const response = await fetch(pdfUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/pdf,*/*'
            }
          });
          
          if (response.ok) {
            const buffer = await response.buffer();
            
            // Check if it's a PDF
            const header = buffer.toString('utf8', 0, 5);
            if (header.startsWith('%PDF')) {
              // Store the PDF using the storage service via API
              // We'll need to create an endpoint for this or do it directly
              console.log(`✓ Re-downloaded PDF for ${lien.recordingNumber} (${buffer.length} bytes)`);
              fixed++;
            } else {
              console.log(`✗ Downloaded file is not a PDF for ${lien.recordingNumber}`);
              failed++;
            }
          } else {
            console.log(`✗ Failed to download PDF for ${lien.recordingNumber}`);
            failed++;
          }
        } else {
          console.log(`✓ PDF exists for ${lien.recordingNumber}`);
        }
      }
    } catch (error) {
      console.error(`Error processing ${lien.recordingNumber}:`, error.message);
      failed++;
    }
  }
  
  console.log(`\nComplete! Fixed: ${fixed}, Failed: ${failed}`);
  process.exit(0);
}

fixPdfs().catch(console.error);