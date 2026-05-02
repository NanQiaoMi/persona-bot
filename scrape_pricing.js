const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-web-security'
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  // Remove webdriver property
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  
  const page = await context.newPage();
  
  console.log('Navigating to pricing page...');
  try {
    await page.goto('https://www.mnapi.com/pricing', { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });
  } catch (e) {
    console.log('Initial navigation timeout, continuing...');
  }
  
  // Wait for potential Cloudflare challenge
  console.log('Waiting for page to load...');
  await page.waitForTimeout(10000);
  
  // Check if we're on Cloudflare challenge page
  const pageTitle = await page.title();
  console.log('Page title:', pageTitle);
  
  // Try to wait for actual content
  try {
    await page.waitForSelector('table, [class*="pricing"], [class*="model"], [class*="plan"]', { timeout: 15000 });
  } catch (e) {
    console.log('No pricing elements found, getting full page text...');
  }
  
  // Get page content
  const content = await page.evaluate(() => {
    const body = document.body;
    if (!body) return 'No body element';
    
    // Get all text content
    const fullText = body.innerText;
    
    // Try to find pricing tables
    const tables = document.querySelectorAll('table');
    const tableData = [];
    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        const rowData = Array.from(cells).map(cell => cell.textContent.trim());
        if (rowData.length > 0) {
          tableData.push(rowData);
        }
      });
    });
    
    // Try to find pricing cards or sections
    const pricingElements = document.querySelectorAll('[class*="price"], [class*="plan"], [class*="model"], [class*="tier"]');
    const pricingText = Array.from(pricingElements).map(el => el.textContent.trim());
    
    return { fullText, tables: tableData, pricingElements: pricingText };
  });
  
  console.log('\n=== Page Content ===');
  console.log(content.fullText);
  
  if (content.tables.length > 0) {
    console.log('\n=== Tables Found ===');
    console.log(JSON.stringify(content.tables, null, 2));
  }
  
  if (content.pricingElements.length > 0) {
    console.log('\n=== Pricing Elements ===');
    console.log(JSON.stringify(content.pricingElements, null, 2));
  }
  
  // Take a screenshot for debugging
  await page.screenshot({ path: 'D:\\26project\\chat api\\pricing_screenshot.png', fullPage: true });
  console.log('\nScreenshot saved to pricing_screenshot.png');
  
  await browser.close();
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
