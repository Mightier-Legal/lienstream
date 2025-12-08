import puppeteer from 'puppeteer';
import { promises as fs } from 'fs';

async function debugPDFDownload(recordingNumber) {
  console.log(`\n=== Debugging PDF download for ${recordingNumber} ===\n`);
  
  // Find Chrome path (same as county-scraper)
  const fs2 = await import('fs');
  const possiblePaths = [
    '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
  ];
  
  let chromePath = null;
  for (const path of possiblePaths) {
    if (fs2.existsSync(path)) {
      chromePath = path;
      break;
    }
  }
  
  console.log(`Using Chrome at: ${chromePath}`);
  
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Visit the detail page
    const detailUrl = `https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataDetail.aspx?rec=${recordingNumber}&suf=&nm=`;
    console.log(`1. Visiting detail page: ${detailUrl}`);
    await page.goto(detailUrl, { waitUntil: 'networkidle2' });
    
    // Look for the Pages link
    const pagesLink = await page.evaluate(() => {
      const link = document.querySelector('a[href*="unofficialpdfdocs.aspx"]');
      return link ? link.href : null;
    });
    console.log(`2. Found Pages link: ${pagesLink}`);
    
    if (!pagesLink) {
      console.log('ERROR: No Pages link found');
      return;
    }
    
    // Try direct PDF URL first
    const directPdfUrl = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
    console.log(`\n3. Testing direct PDF URL: ${directPdfUrl}`);
    
    const directResponse = await fetch(directPdfUrl);
    console.log(`   Direct PDF response status: ${directResponse.status}`);
    
    // Visit the viewer page
    console.log(`\n4. Visiting viewer page: ${pagesLink}`);
    
    // Track PDF responses
    let detectedPdfUrl = null;
    page.on('response', response => {
      const url = response.url();
      if (url.includes('.pdf')) {
        console.log(`   🎯 PDF response detected: ${url} (status: ${response.status()})`);
        if (response.status() === 200) {
          detectedPdfUrl = url;
        }
      }
    });
    
    await page.goto(pagesLink, { waitUntil: 'networkidle2' });
    
    // Wait a bit for any redirects or dynamic loading
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check page content
    console.log(`\n5. Analyzing page content...`);
    
    const pageAnalysis = await page.evaluate(() => {
      const result = {
        title: document.title,
        iframes: [],
        embedElements: [],
        objectElements: [],
        links: [],
        scripts: [],
        bodyText: document.body ? document.body.innerText.substring(0, 500) : 'No body'
      };
      
      // Find iframes
      document.querySelectorAll('iframe').forEach(iframe => {
        result.iframes.push({
          id: iframe.id,
          src: iframe.src,
          name: iframe.name
        });
      });
      
      // Find embed elements
      document.querySelectorAll('embed').forEach(embed => {
        result.embedElements.push({
          src: embed.src,
          type: embed.type
        });
      });
      
      // Find object elements  
      document.querySelectorAll('object').forEach(obj => {
        result.objectElements.push({
          data: obj.data,
          type: obj.type
        });
      });
      
      // Find PDF links
      document.querySelectorAll('a').forEach(link => {
        if (link.href && link.href.includes('.pdf')) {
          result.links.push(link.href);
        }
      });
      
      // Check for PDF viewer scripts
      document.querySelectorAll('script').forEach(script => {
        if (script.src && (script.src.includes('pdf') || script.src.includes('viewer'))) {
          result.scripts.push(script.src);
        }
      });
      
      return result;
    });
    
    console.log('   Page title:', pageAnalysis.title);
    console.log('   Iframes found:', pageAnalysis.iframes.length);
    pageAnalysis.iframes.forEach(iframe => {
      console.log(`     - ID: ${iframe.id}, SRC: ${iframe.src}`);
    });
    console.log('   Embed elements:', pageAnalysis.embedElements.length);
    pageAnalysis.embedElements.forEach(embed => {
      console.log(`     - ${embed.src}`);
    });
    console.log('   Object elements:', pageAnalysis.objectElements.length);
    pageAnalysis.objectElements.forEach(obj => {
      console.log(`     - ${obj.data}`);
    });
    console.log('   PDF links found:', pageAnalysis.links.length);
    pageAnalysis.links.forEach(link => {
      console.log(`     - ${link}`);
    });
    console.log('   Body text preview:', pageAnalysis.bodyText);
    
    // Check if PDF was detected in network
    console.log(`\n6. PDF URL detected from network: ${detectedPdfUrl || 'NONE'}`);
    
    // If we detected a PDF URL, try to download it
    if (detectedPdfUrl) {
      console.log(`\n7. Attempting to download detected PDF...`);
      const pdfResponse = await fetch(detectedPdfUrl);
      console.log(`   Response status: ${pdfResponse.status}`);
      if (pdfResponse.ok) {
        const buffer = await pdfResponse.arrayBuffer();
        console.log(`   ✅ Successfully downloaded ${buffer.byteLength} bytes`);
      }
    }
    
    // Take a screenshot for debugging
    await page.screenshot({ path: `debug-${recordingNumber}.png`, fullPage: true });
    console.log(`\n8. Screenshot saved as debug-${recordingNumber}.png`);
    
  } finally {
    await browser.close();
  }
}

// Test with multiple failed liens
async function testMultiple() {
  const failedLiens = ['20250665584', '20250665590', '20250665537'];
  for (const lien of failedLiens) {
    await debugPDFDownload(lien);
    console.log('\n' + '='.repeat(60) + '\n');
  }
}

testMultiple().catch(console.error);