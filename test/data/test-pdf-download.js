const puppeteer = require('puppeteer');
const { execSync } = require('child_process');

async function testPdfDownload() {
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
        '--disable-site-isolation-trials'
      ]
    });
    
    const page = await browser.newPage();
    
    // Test PDFs that should be available (based on curl tests)
    const testUrls = [
      '20250659081', // Known working
      '20250659082', // Failed in scraper but works with curl
      '20250659083', // Failed in scraper but works with curl
      '20250659084'  // Failed in scraper but works with curl
    ];
    
    console.log('\nTesting PDF downloads through browser context:');
    console.log('=' .repeat(50));
    
    for (const recordingNumber of testUrls) {
      const pdfUrl = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
      console.log(`\nTesting ${recordingNumber}:`);
      console.log(`URL: ${pdfUrl}`);
      
      try {
        // Method 1: Direct fetch (like the scraper)
        console.log('  Direct fetch test:');
        const response = await fetch(pdfUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/pdf,*/*'
          }
        });
        console.log(`    Status: ${response.status}`);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          console.log(`    Size: ${buffer.byteLength} bytes`);
          const header = Buffer.from(buffer).toString('utf8', 0, 5);
          console.log(`    Header: ${header} (${header === '%PDF' ? 'Valid PDF' : 'Not a PDF'})`);
        }
      } catch (error) {
        console.log(`    Error: ${error.message}`);
      }
      
      // Method 2: Browser context fetch (like scraper fallback)
      try {
        console.log('  Browser context fetch test:');
        const result = await page.evaluate(async (url) => {
          try {
            const response = await fetch(url, {
              headers: {
                'Accept': 'application/pdf,*/*'
              }
            });
            
            if (response.ok) {
              const arrayBuffer = await response.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              // Get first 5 bytes for PDF check
              const header = String.fromCharCode.apply(null, uint8Array.slice(0, 5));
              return { 
                success: true, 
                status: response.status, 
                size: arrayBuffer.byteLength,
                header: header
              };
            }
            return { success: false, status: response.status, error: `HTTP ${response.status}` };
          } catch (error) {
            return { success: false, error: error.message };
          }
        }, pdfUrl);
        
        if (result.success) {
          console.log(`    Status: ${result.status}`);
          console.log(`    Size: ${result.size} bytes`);
          console.log(`    Header: ${result.header} (${result.header === '%PDF' ? 'Valid PDF' : 'Not a PDF'})`);
        } else {
          console.log(`    Failed: ${result.error || result.status}`);
        }
      } catch (error) {
        console.log(`    Error: ${error.message}`);
      }
    }
    
    // Test CORS and cookies
    console.log('\n\nChecking browser context details:');
    console.log('=' .repeat(50));
    
    // Navigate to the Maricopa site first to establish context
    await page.goto('https://legacy.recorder.maricopa.gov', { waitUntil: 'networkidle2' });
    
    const cookies = await page.cookies();
    console.log(`Cookies set: ${cookies.length}`);
    cookies.forEach(cookie => {
      console.log(`  - ${cookie.name}: ${cookie.value.substring(0, 20)}...`);
    });
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testPdfDownload();