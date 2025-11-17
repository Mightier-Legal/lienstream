import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import fs from 'fs';

async function testPdfFix() {
  let browser;
  try {
    // Find Chrome/Chromium path
    let executablePath = undefined;
    const possiblePaths = [
      'chromium',
      'chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ];
    
    for (const path of possiblePaths) {
      try {
        const result = execSync(`which ${path}`, { encoding: 'utf8' }).trim();
        if (result) {
          executablePath = result;
          console.log(`Found Chrome at: ${executablePath}`);
          break;
        }
      } catch {}
    }
    
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials',
        '--disable-web-security',
        '--disable-features=IsolateOrigins',
        '--disable-site-isolation-trials'
      ]
    });
    
    const page = await browser.newPage();
    
    // Test PDFs that should be available
    const testUrls = [
      '20250659082', // Failed in scraper but works with curl
      '20250659083', // Failed in scraper but works with curl
    ];
    
    console.log('\nTesting alternative PDF download methods:');
    console.log('=' .repeat(50));
    
    for (const recordingNumber of testUrls) {
      const pdfUrl = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
      console.log(`\nTesting ${recordingNumber}:`);
      
      // Method 1: Direct Node.js fetch (not in browser context)
      try {
        console.log('  Direct Node.js fetch (outside browser):');
        const response = await fetch(pdfUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/pdf,*/*'
          }
        });
        
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          console.log(`    ✅ Success! Status: ${response.status}, Size: ${buffer.byteLength} bytes`);
          
          // Save to test file
          fs.writeFileSync(`test-${recordingNumber}.pdf`, Buffer.from(buffer));
          console.log(`    ✅ Saved to test-${recordingNumber}.pdf`);
        } else {
          console.log(`    ❌ Failed: HTTP ${response.status}`);
        }
      } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
      }
      
      // Method 2: Navigate to the page first to establish session
      try {
        console.log('  Browser download with session:');
        
        // First navigate to the main site to get cookies
        await page.goto('https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataDetail.aspx?rec=' + recordingNumber, {
          waitUntil: 'networkidle2'
        });
        console.log('    ✓ Navigated to detail page');
        
        // Now try to fetch the PDF in the browser context
        const result = await page.evaluate(async (url) => {
          try {
            const response = await fetch(url, {
              credentials: 'include', // Include cookies
              headers: {
                'Accept': 'application/pdf,*/*'
              }
            });
            
            return { 
              success: response.ok, 
              status: response.status,
              headers: Object.fromEntries(response.headers.entries())
            };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }, pdfUrl);
        
        if (result.success) {
          console.log(`    ✅ Browser fetch succeeded! Status: ${result.status}`);
        } else {
          console.log(`    ❌ Browser fetch failed: ${result.error || `HTTP ${result.status}`}`);
        }
      } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
      }
      
      // Method 3: Use CDP to download
      try {
        console.log('  CDP download method:');
        
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: './'
        });
        
        // Navigate directly to PDF
        const response = await page.goto(pdfUrl, {
          waitUntil: 'networkidle0',
          timeout: 10000
        });
        
        if (response && response.ok()) {
          console.log(`    ✅ CDP navigation succeeded! Status: ${response.status()}`);
        } else {
          console.log(`    ❌ CDP navigation failed: ${response ? response.status() : 'No response'}`);
        }
      } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
      }
    }
    
    // Check what's blocking the browser context
    console.log('\n\nAnalyzing browser security context:');
    console.log('=' .repeat(50));
    
    const securityDetails = await page.evaluate(() => {
      return {
        origin: window.location.origin,
        protocol: window.location.protocol,
        crossOriginIsolated: window.crossOriginIsolated,
        isSecureContext: window.isSecureContext
      };
    });
    
    console.log('Security context:', securityDetails);
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
    
    // Cleanup test files
    ['20250659082', '20250659083'].forEach(num => {
      try {
        fs.unlinkSync(`test-${num}.pdf`);
        console.log(`Cleaned up test-${num}.pdf`);
      } catch {}
    });
  }
}

testPdfFix();