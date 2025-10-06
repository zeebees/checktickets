const puppeteer = require('puppeteer');

async function testOct16() {
  console.log('Testing October 16 detection on GetYourGuide...\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    console.log('1. Loading GetYourGuide page...');
    await page.goto('https://www.getyourguide.com/barcelona-l45/sagrada-familia-skip-the-line-ticket-t50027', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Handle cookie consent modal
    console.log('   Handling cookie consent...');
    try {
      // Wait for and click "I agree" button
      const consentButton = await page.waitForSelector('button:has-text("I agree"), button:has-text("Only essential")', { timeout: 5000 });
      if (consentButton) {
        await consentButton.click();
        console.log('   Cookie consent handled');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (e) {
      // Try alternative method
      try {
        await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const agreeBtn = buttons.find(b =>
            b.textContent.includes('I agree') ||
            b.textContent.includes('Only essential') ||
            b.textContent.includes('Accept')
          );
          if (agreeBtn) {
            agreeBtn.click();
          }
        });
        console.log('   Cookie consent handled (alternative method)');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e2) {
        console.log('   No cookie consent modal found');
      }
    }

    console.log('2. Scrolling to and clicking Check availability button...');

    // First scroll down to make sure the button is visible
    await page.evaluate(() => {
      window.scrollBy(0, 300);
    });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Try to click the Check availability button
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.includes('Check availability') ||
        b.textContent.includes('Select date')
      );
      if (btn) {
        btn.scrollIntoView();
        btn.click();
        return true;
      }
      return false;
    });

    if (!clicked) {
      console.log('   Button not found, trying alternative selectors...');
      try {
        await page.click('[data-testid*="date"]');
      } catch (e) {
        console.log('   Could not find date selector');
      }
    } else {
      console.log('   Button clicked');
    }

    console.log('3. Waiting for calendar to load...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Take screenshot to see what's happening
    await page.screenshot({ path: 'calendar-state-1.png' });
    console.log('   Screenshot saved: calendar-state-1.png');

    // Try to ensure calendar is open
    await page.evaluate(() => {
      // Click on date input if calendar not open
      const dateInputs = document.querySelectorAll('input');
      for (const input of dateInputs) {
        if (input.placeholder && input.placeholder.toLowerCase().includes('date')) {
          input.click();
          break;
        }
      }
    });

    await new Promise(resolve => setTimeout(resolve, 5000));

    // Take another screenshot after waiting
    await page.screenshot({ path: 'calendar-state-2.png' });
    console.log('   Screenshot saved: calendar-state-2.png');

    console.log('4. Looking for October calendar and checking dates...\n');

    // Scroll to make sure calendar is visible
    await page.evaluate(() => {
      const calendar = document.querySelector('[class*="calendar"], [class*="datepicker"]');
      if (calendar) {
        calendar.scrollIntoView();
      }
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Take a final screenshot to see the calendar state
    await page.screenshot({ path: 'calendar-final.png', fullPage: true });
    console.log('   Final screenshot saved: calendar-final.png');

    const results = await page.evaluate(() => {
      const cells = document.querySelectorAll('td');
      const dateResults = {};

      ['12', '13', '14', '15', '16'].forEach(dateNum => {
        const cell = Array.from(cells).find(c => c.textContent.trim() === dateNum && !c.textContent.includes('Nov'));
        if (cell) {
          const innerDiv = cell.querySelector('.c-datepicker-day__container');
          if (innerDiv) {
            const hasDisabledClass = innerDiv.classList.contains('c-datepicker-day--disabled');
            dateResults[dateNum] = {
              available: !hasDisabledClass,
              classes: innerDiv.className
            };
          } else {
            dateResults[dateNum] = { available: false, reason: 'No inner div found' };
          }
        } else {
          dateResults[dateNum] = { available: false, reason: 'Date not found' };
        }
      });

      return dateResults;
    });

    console.log('RESULTS:');
    console.log('========');
    Object.entries(results).forEach(([date, info]) => {
      if (info.available) {
        console.log(`✅ October ${date}: AVAILABLE`);
      } else {
        console.log(`❌ October ${date}: Not available ${info.reason ? `(${info.reason})` : ''}`);
      }
    });

    console.log('\n🎯 OCTOBER 16 STATUS:', results['16'].available ? 'AVAILABLE!' : 'NOT AVAILABLE');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await browser.close();
  }
}

testOct16().catch(console.error);