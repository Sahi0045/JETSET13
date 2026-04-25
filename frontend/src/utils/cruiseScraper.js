const puppeteer = require('puppeteer');

async function scrapeCruiseData() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Set viewport size
    await page.setViewport({ width: 1280, height: 800 });
    
    // Navigate to the cruise search page
    await page.goto('https://www.cruisemapper.com/cruise-search?portRegion=0&shipType=2&portDeparture=&portOfCall=&ship=&line=&departureFrom=&departureTo=&duration=0&type=0&price=0%2C2000&priceByNight=0%2C100&finder=cruise', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for the cruise listings to load
    await page.waitForSelector('.cruise-item', { timeout: 30000 });

    // Extract cruise data
    const cruises = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.cruise-item'));
      return items.map(item => {
        return {
          name: item.querySelector('.cruise-name')?.textContent.trim() || '',
          duration: item.querySelector('.cruise-duration')?.textContent.trim() || '',
          price: item.querySelector('.cruise-price')?.textContent.trim() || '',
          departurePort: item.querySelector('.departure-port')?.textContent.trim() || '',
          destinations: Array.from(item.querySelectorAll('.destination')).map(dest => dest.textContent.trim()),
          image: item.querySelector('.cruise-image img')?.src || '',
          cruiseLine: item.querySelector('.cruise-line')?.textContent.trim() || '',
          departureDate: item.querySelector('.departure-date')?.textContent.trim() || ''
        };
      });
    });

    return cruises;
  } catch (error) {
    console.error('Error scraping cruise data:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = scrapeCruiseData; 