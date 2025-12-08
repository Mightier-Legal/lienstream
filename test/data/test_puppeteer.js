const puppeteer = require('puppeteer');

async function testBrowser() {
  console.log('Testing Puppeteer browser launch...');
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote'
      ],
      timeout: 60000
    });
    console.log('✅ Browser launched successfully!');
    
    const page = await browser.newPage();
    await page.goto('https://www.google.com', { timeout: 30000 });
    console.log('✅ Page loaded successfully!');
    
    await browser.close();
    console.log('✅ Browser closed successfully!');
  } catch (error) {
    console.error('❌ Failed to launch browser:', error.message);
  }
}

testBrowser();
