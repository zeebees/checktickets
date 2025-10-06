#!/usr/bin/env node

const puppeteer = require('puppeteer');
const { exec } = require('child_process');
const fs = require('fs').promises;

// Configuration
const PRIORITY_DATES = ['13']; // Only checking October 13
const ALL_DATES = ['13'];
const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes
const SEPTEMBER_DATE = '13'; // September 13 for tower tour
const ALHAMBRA_DATES = []; // Skipping Alhambra checks per user request

function sendNotification(site, date, url, isPriority = false) {
  const urgency = isPriority ? '🚨🎯 PRIORITY DATE' : '✅ DATE';

  // Console notification
  console.log('\n🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
  console.log(`${urgency} AVAILABLE!!!`);
  console.log(`📅 Date: October ${date}`);
  console.log(`🌐 Site: ${site}`);
  console.log(`🔗 URL: ${url}`);
  if (isPriority) {
    console.log('⚡ THIS IS ONE OF YOUR REQUESTED DATES!');
  }
  console.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n');

  // Desktop notification
  const title = isPriority ? '🎯 YOUR DATE AVAILABLE!' : '🎫 Tickets Available';
  const message = `October ${date} on ${site}`;
  const appleScript = `display notification "${message}" with title "${title}" sound name "Glass"`;
  exec(`osascript -e '${appleScript}'`);

  // Voice alert
  const voiceMessage = isPriority ?
    `URGENT! Your requested date October ${date} is available!` :
    `October ${date} tickets available`;
  exec(`say "${voiceMessage}"`);

  // Sound effect - multiple for priority
  if (isPriority) {
    exec('afplay /System/Library/Sounds/Glass.aiff && sleep 1 && afplay /System/Library/Sounds/Glass.aiff');
  } else {
    exec('afplay /System/Library/Sounds/Glass.aiff');
  }
}

async function checkOfficialSite(page, dates) {
  try {
    await page.goto('https://tickets.sagradafamilia.org/en-FR/1/4375', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await page.waitForSelector('td', { timeout: 10000 });

    // NEW DETECTION: Based on visual analysis
    // Unavailable dates have gray underlined text
    // Available dates have black text without underlines
    const availability = await page.evaluate((checkDates) => {
      const results = {};
      const cells = document.querySelectorAll('td');
      const seenDates = new Set();

      cells.forEach(cell => {
        const text = (cell.textContent || '').trim();

        if (checkDates.includes(text) && !seenDates.has(text)) {
          // Get the first link or span inside the cell
          const dateElement = cell.querySelector('a, span');

          if (dateElement) {
            const style = window.getComputedStyle(dateElement);
            const textDecoration = style.textDecoration || '';
            const color = style.color || '';

            // Check if it has underline (indicates unavailable)
            const hasUnderline = textDecoration.includes('underline');

            // Check if text color is gray (rgb values less than 100)
            const isGrayText = color.includes('rgb') &&
                              color.match(/\d+/g).some(val => parseInt(val) < 100);

            // Available = NO underline and NOT gray
            const isAvailable = !hasUnderline && !isGrayText;

            results[text] = {
              available: isAvailable,
              hasUnderline: hasUnderline,
              color: color.substring(0, 20)
            };

            seenDates.add(text);
          } else {
            // If no inner element, check the cell itself
            const hasBlockedClass = cell.classList.contains('CalendarDay__blocked_calendar');
            const hasDefaultClass = cell.classList.contains('CalendarDay__default');
            const hasDefaultCursor = cell.classList.contains('CalendarDay__defaultCursor');

            // Use class-based detection as fallback
            const isAvailable = hasDefaultClass && !hasDefaultCursor && !hasBlockedClass;

            results[text] = {
              available: isAvailable,
              method: 'class-based'
            };

            seenDates.add(text);
          }
        }
      });

      return results;
    }, dates);

    return availability;
  } catch (error) {
    console.error('Error checking official site:', error.message);
    return {};
  }
}

async function checkTiqets(page, dates) {
  try {
    console.log('  Checking Tiqets for October 12-13...');

    // Navigate to Tiqets page
    await page.goto('https://www.tiqets.com/en/tickets-for-sagrada-familia-fast-track-p918256/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for calendar or date selector to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Click on date selector
    await page.evaluate(() => {
      const dateButtons = document.querySelectorAll('button[data-testid*="date"], button[aria-label*="date"], [class*="date"]');
      if (dateButtons.length > 0) {
        dateButtons[0].click();
      }
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check for October dates
    const results = await page.evaluate((checkDates) => {
      const dateResults = {};

      // Look for October 2025 dates
      const cells = document.querySelectorAll('[role="gridcell"], td, [class*="calendar-day"]');

      for (const date of checkDates) {
        let found = false;
        for (const cell of cells) {
          const text = cell.textContent || '';
          if (text.trim() === date) {
            // Check if it's October 2025
            const monthText = document.body.textContent || '';
            if (monthText.includes('October') && monthText.includes('2025')) {
              // Check if available (not disabled)
              const isDisabled = cell.classList.contains('disabled') ||
                               cell.classList.contains('unavailable') ||
                               cell.getAttribute('aria-disabled') === 'true' ||
                               cell.hasAttribute('disabled');
              dateResults[date] = { available: !isDisabled };
              found = true;
              break;
            }
          }
        }
        if (!found) {
          dateResults[date] = { available: false };
        }
      }

      return dateResults;
    }, dates);

    return results;

  } catch (error) {
    console.error('Error checking Tiqets:', error.message);
    const results = {};
    dates.forEach(date => {
      results[date] = { available: false };
    });
    return results;
  }
}

async function checkTripAdvisorAlhambra(page, dates) {
  try {
    console.log('  Checking TripAdvisor for Alhambra tours...');

    const urls = [
      'https://www.tripadvisor.com/AttractionProductReview-g187441-d28110599-Granada_Alhambra_Guided_Tour_including_Nasrid_Palaces-Granada_Province_of_Granada_.html',
      'https://www.tripadvisor.com/AttractionProductReview-g187441-d14138327-Alhambra_and_Nasrid_Palaces_Ticket_with_Audioguide-Granada_Province_of_Granada_And.html',
      'https://www.tripadvisor.com/AttractionProductReview-g187441-d33413295-Alhambra_Ticket_with_Audio_Guide_in_Granada-Granada_Province_of_Granada_Andalucia.html'
    ];

    const allResults = {};
    dates.forEach(date => {
      allResults[date] = { available: false };
    });

    for (const url of urls) {
      try {
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Click on date selector if present
    await page.evaluate(() => {
      const dateButtons = document.querySelectorAll('[data-testid*="date"], button[aria-label*="date"], [class*="date-picker"], [class*="calendar"]');
      if (dateButtons.length > 0) {
        dateButtons[0].click();
      }
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check for October dates
    const results = await page.evaluate((checkDates) => {
      const dateResults = {};

      // Look for calendar cells
      const cells = document.querySelectorAll('[role="gridcell"], td, [class*="calendar-day"], [class*="date-cell"]');

      for (const date of checkDates) {
        let found = false;
        for (const cell of cells) {
          const text = cell.textContent || '';
          if (text.trim() === date) {
            // Check if it's October 2025
            const monthText = document.body.textContent || '';
            if (monthText.includes('October') && monthText.includes('2025')) {
              // Check if available
              const isDisabled = cell.classList.contains('disabled') ||
                               cell.classList.contains('unavailable') ||
                               cell.classList.contains('sold-out') ||
                               cell.getAttribute('aria-disabled') === 'true' ||
                               cell.hasAttribute('disabled');
              dateResults[date] = { available: !isDisabled };
              found = true;
              break;
            }
          }
        }
        if (!found) {
          dateResults[date] = { available: false };
        }
      }

      return dateResults;
    }, dates);

        // Merge results - if any site has availability, mark as available
        for (const date of dates) {
          if (results[date] && results[date].available) {
            allResults[date] = { available: true, source: url };
          }
        }
      } catch (error) {
        console.error(`Error checking TripAdvisor URL: ${error.message}`);
      }
    }

    return allResults;

  } catch (error) {
    console.error('Error checking TripAdvisor Alhambra:', error.message);
    const results = {};
    dates.forEach(date => {
      results[date] = { available: false };
    });
    return results;
  }
}

async function checkGetYourGuideAlhambra(page, dates) {
  try {
    console.log('  Checking GetYourGuide for Alhambra...');

    await page.goto('https://www.getyourguide.com/granada-l207/skip-the-line-alhambra-and-generalife-guided-tour-t54011/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try to open date picker
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

    if (clicked) {
      console.log('    Opened date picker');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Check for October dates
    const results = await page.evaluate((checkDates) => {
      const dateResults = {};

      // Look for calendar cells
      const cells = document.querySelectorAll('td');

      for (const date of checkDates) {
        const cell = Array.from(cells).find(c =>
          c.textContent.trim() === date && !c.textContent.includes('Nov')
        );

        if (cell) {
          const innerDiv = cell.querySelector('.c-datepicker-day__container');
          if (innerDiv) {
            const hasDisabledClass = innerDiv.classList.contains('c-datepicker-day--disabled');
            dateResults[date] = { available: !hasDisabledClass };
          } else {
            dateResults[date] = { available: false };
          }
        } else {
          dateResults[date] = { available: false };
        }
      }

      return dateResults;
    }, dates);

    return results;

  } catch (error) {
    console.error('Error checking GetYourGuide Alhambra:', error.message);
    const results = {};
    dates.forEach(date => {
      results[date] = { available: false };
    });
    return results;
  }
}

async function checkAlhambra(page, dates) {
  try {
    await page.goto('https://compratickets.alhambra-patronato.es/reservarEntradas.aspx?opc=142&gid=432&lg=en-GB&ca=0&m=GENERAL', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('  Checking Alhambra dates...');

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check which October dates are available
    const availability = {};

    for (const date of dates) {
      // Check if the date is available in the calendar
      const dateAvailable = await page.evaluate((targetDate) => {
        // Look for October dates in the calendar
        const cells = document.querySelectorAll('td, div[class*="calendar"], div[class*="date"]');

        for (const cell of cells) {
          const text = cell.textContent || '';
          // Look for the date number
          if (text.trim() === targetDate) {
            // Check if it's October (not September or November)
            const pageText = document.body.textContent || '';
            if (pageText.includes('October') || pageText.includes('octubre')) {
              // Check if the cell has any disabled/unavailable classes
              const classList = cell.className || '';
              const isDisabled =
                classList.includes('disabled') ||
                classList.includes('unavailable') ||
                classList.includes('no-disponible') ||
                classList.includes('sold-out') ||
                classList.includes('complete');

              // Also check if clickable
              const isClickable = cell.onclick || cell.querySelector('a') || cell.style.cursor === 'pointer';

              return !isDisabled && isClickable;
            }
          }
        }

        return false;
      }, date);

      availability[date] = {
        available: dateAvailable,
        note: dateAvailable ? 'Available' : 'Not available'
      };
    }

    return availability;

  } catch (error) {
    console.error('Error checking Alhambra:', error.message);
    const emptyResults = {};
    dates.forEach(d => {
      emptyResults[d] = { available: false, note: 'Error checking' };
    });
    return emptyResults;
  }
}

async function checkSeptember13TowerTour(page) {
  try {
    await page.goto('https://www.getyourguide.com/barcelona-l45/offical-sagrada-familia-guided-tour-with-tower-access-t959327', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('  Checking September 13 tower tour...');

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Handle cookie consent if present
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const consentBtn = buttons.find(b =>
          b.textContent.includes('I agree') ||
          b.textContent.includes('Only essential') ||
          b.textContent.includes('Accept')
        );
        if (consentBtn) {
          consentBtn.click();
        }
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {}

    // Click on the date selector to open calendar
    const dateOpened = await page.evaluate(() => {
      window.scrollBy(0, 300);
      const buttons = Array.from(document.querySelectorAll('button'));
      const checkBtn = buttons.find(b =>
        b.textContent.includes('Check availability') ||
        b.textContent.includes('Select date')
      );
      if (checkBtn) {
        checkBtn.scrollIntoView({behavior: 'smooth', block: 'center'});
        checkBtn.click();
        return true;
      }
      return false;
    });

    if (!dateOpened) {
      console.log('    Could not open date selector for September tower tour');
      return { available: false };
    }

    // Wait for calendar to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if September 13 is available
    const isAvailable = await page.evaluate(() => {
      // First try to navigate to September if we're in a different month
      const monthElements = document.querySelectorAll('*');
      for (const elem of monthElements) {
        if (elem.textContent && elem.textContent.includes('September 2025')) {
          // We're on September, good
          break;
        }
      }

      // Look for September 13
      const cells = document.querySelectorAll('td');
      for (const cell of cells) {
        const text = cell.textContent || '';
        if (text.trim() === '13') {
          // Check if it's in September (not October)
          const monthText = document.body.textContent || '';
          if (monthText.includes('September')) {
            // Check if disabled
            const innerDiv = cell.querySelector('.c-datepicker-day__container');
            if (innerDiv) {
              const hasDisabledClass = innerDiv.classList.contains('c-datepicker-day--disabled');
              return !hasDisabledClass;
            }
            // Fallback check
            return !cell.innerHTML.includes('disabled');
          }
        }
      }
      return false;
    });

    return { available: isAvailable };

  } catch (error) {
    console.error('Error checking September 13 tower tour:', error.message);
    return { available: false };
  }
}


async function checkGetYourGuide(page, dates) {
  try {
    await page.goto('https://www.getyourguide.com/barcelona-l45/sagrada-familia-skip-the-line-ticket-t50027', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('  Loaded GetYourGuide page...');

    // Wait a bit for page to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Handle cookie consent modal if present
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const consentBtn = buttons.find(b =>
          b.textContent.includes('I agree') ||
          b.textContent.includes('Only essential') ||
          b.textContent.includes('Accept')
        );
        if (consentBtn) {
          consentBtn.click();
          return true;
        }
        return false;
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      // Cookie consent may not be present
    }

    console.log('  Opening date picker...');

    // Scroll down and click the main Check availability button
    const datePickerOpened = await page.evaluate(() => {
      window.scrollBy(0, 300);
      const buttons = Array.from(document.querySelectorAll('button'));
      const checkBtn = buttons.find(b =>
        b.textContent.includes('Check availability') &&
        b.getBoundingClientRect().width > 200 // Get the main button
      );
      if (checkBtn) {
        checkBtn.scrollIntoView({behavior: 'smooth', block: 'center'});
        checkBtn.click();
        return true;
      }
      return false;
    });

    if (datePickerOpened) {
      console.log('  Clicked Check availability button');
    } else {
      console.log('  Could not find Check availability button');
      return {};
    }

    // Wait for calendar to appear
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Now check October dates
    const availability = {};

    for (const date of dates) {
      // Check if October dates are available in the calendar
      const isAvailable = await page.evaluate((targetDate) => {
        // Look for October dates in the GetYourGuide calendar
        const cells = document.querySelectorAll('td');

        for (const cell of cells) {
          const text = cell.textContent || '';

          // Find the specific date (avoid November dates)
          if (text.trim() === targetDate && !cell.textContent.includes('Nov')) {
            // Check for the disabled class in the inner div
            const innerDiv = cell.querySelector('.c-datepicker-day__container');
            if (innerDiv) {
              const hasDisabledClass = innerDiv.classList.contains('c-datepicker-day--disabled');
              // Available = NOT disabled
              return !hasDisabledClass;
            }
          }
        }
        return false;
      }, date);

      availability[date] = {
        available: isAvailable,
        note: isAvailable ? 'Date available' : 'Date not available'
      };
    }

    return availability;

  } catch (error) {
    console.error('Error checking GetYourGuide:', error.message);
    return {};
  }
}

async function runCheck() {
  console.log(`\n[${new Date().toLocaleString()}] Starting availability check...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    console.log('Checking Official Sagrada Familia site...');
    const officialResults = await checkOfficialSite(page, PRIORITY_DATES);

    console.log('Checking GetYourGuide...');
    const getYourGuideResults = await checkGetYourGuide(page, PRIORITY_DATES);

    console.log('Checking Tiqets...');
    const tiqetsResults = await checkTiqets(page, ['13']);

    console.log('Checking September 13 Tower Tour on GetYourGuide...');
    const sept13TowerResult = await checkSeptember13TowerTour(page);

    console.log('Checking Alhambra for October 15-20...');
    const alhambraResults = await checkAlhambra(page, ALHAMBRA_DATES);

    console.log('Checking GetYourGuide Alhambra...');
    const getYourGuideAlhambraResults = await checkGetYourGuideAlhambra(page, ALHAMBRA_DATES);

    console.log('Checking TripAdvisor Alhambra Tours...');
    const tripAdvisorAlhambraResults = await checkTripAdvisorAlhambra(page, ALHAMBRA_DATES);

    // Process priority dates from both sites
    let priorityAvailable = false;
    console.log('\n🎯 YOUR REQUESTED DATES:');

    // Check September 13 Tower Tour first
    console.log('\n🏛️ September 13 Tower Tour (GetYourGuide):');
    if (sept13TowerResult.available) {
      console.log('  ✅ September 13: AVAILABLE WITH TOWER ACCESS!');
      sendNotification('GetYourGuide Tower Tour', 'September 13',
        'https://www.getyourguide.com/barcelona-l45/offical-sagrada-familia-guided-tour-with-tower-access-t959327', true);
      priorityAvailable = true;
      await logAvailability('GetYourGuide Tower Tour', 'Sept 13', true);
    } else {
      console.log('  ❌ September 13: Not available');
    }

    // Check Official Site results for October
    console.log('\n📍 Official Site (October):');
    for (const date of PRIORITY_DATES) {
      const info = officialResults[date];
      if (info && info.available) {
        console.log(`  ✅ October ${date}: AVAILABLE!`);
        sendNotification('Official Sagrada Familia', date, 'https://tickets.sagradafamilia.org/en-FR/1/4375', true);
        priorityAvailable = true;
        await logAvailability('Official Site', date, true);
      } else {
        console.log(`  ❌ October ${date}: Not available`);
      }
    }

    // Check GetYourGuide results
    console.log('\n🌐 GetYourGuide (October):');
    for (const date of PRIORITY_DATES) {
      const info = getYourGuideResults[date];
      if (info && info.available) {
        console.log(`  ✅ October ${date}: AVAILABLE on GetYourGuide!`);
        sendNotification('GetYourGuide', date, 'https://www.getyourguide.com/barcelona-l45/sagrada-familia-skip-the-line-ticket-t50027', true);
        priorityAvailable = true;
        await logAvailability('GetYourGuide', date, true);
      } else {
        console.log(`  ❌ October ${date}: Not available`);
      }
    }

    // Check Tiqets results
    console.log('\n🎫 Tiqets (October 13):');
    for (const date of ['13']) {
      const info = tiqetsResults[date];
      if (info && info.available) {
        console.log(`  ✅ October ${date}: AVAILABLE on Tiqets!`);
        sendNotification('Tiqets', date, 'https://www.tiqets.com/en/tickets-for-sagrada-familia-fast-track-p918256/', true);
        priorityAvailable = true;
        await logAvailability('Tiqets', date, true);
      } else {
        console.log(`  ❌ October ${date}: Not available`);
      }
    }

    // Check Alhambra results
    console.log('\n🏰 Alhambra Official Site (October 15-20):');
    for (const date of ALHAMBRA_DATES) {
      const info = alhambraResults[date];
      if (info && info.available) {
        console.log(`  ✅ October ${date}: AVAILABLE!`);
        sendNotification('Alhambra', `October ${date}`,
          'https://compratickets.alhambra-patronato.es/reservarEntradas.aspx?opc=142&gid=432&lg=en-GB&ca=0&m=GENERAL', true);
        priorityAvailable = true;
        await logAvailability('Alhambra', date, true);
      } else {
        console.log(`  ❌ October ${date}: Not available`);
      }
    }

    // Check GetYourGuide Alhambra results
    console.log('\n🌐 GetYourGuide Alhambra (October 15-20):');
    for (const date of ALHAMBRA_DATES) {
      const info = getYourGuideAlhambraResults[date];
      if (info && info.available) {
        console.log(`  ✅ October ${date}: AVAILABLE on GetYourGuide!`);
        sendNotification('GetYourGuide Alhambra', `October ${date}`,
          'https://www.getyourguide.com/granada-l207/skip-the-line-alhambra-and-generalife-guided-tour-t54011/', true);
        priorityAvailable = true;
        await logAvailability('GetYourGuide Alhambra', date, true);
      } else {
        console.log(`  ❌ October ${date}: Not available`);
      }
    }

    // Check TripAdvisor Alhambra results
    console.log('\n🎫 TripAdvisor Alhambra Tours (October 15-20):');
    for (const date of ALHAMBRA_DATES) {
      const info = tripAdvisorAlhambraResults[date];
      if (info && info.available) {
        console.log(`  ✅ October ${date}: AVAILABLE on TripAdvisor!`);
        sendNotification('TripAdvisor Alhambra', `October ${date}`,
          info.source || 'https://www.tripadvisor.com', true);
        priorityAvailable = true;
        await logAvailability('TripAdvisor Alhambra', date, true);
      } else {
        console.log(`  ❌ October ${date}: Not available`);
      }
    }

    // Show other available dates from official site
    const otherResults = await checkOfficialSite(page, ALL_DATES.filter(d => !PRIORITY_DATES.includes(d)));
    const otherDates = ALL_DATES.filter(d => !PRIORITY_DATES.includes(d));
    const availableOther = otherDates.filter(d => otherResults[d]?.available);

    if (availableOther.length > 0) {
      console.log(`\n📅 Other available dates: October ${availableOther.join(', ')}`);
    }

    if (!priorityAvailable) {
      console.log('\n⏳ Your requested dates are not available yet:');
      console.log('   • Sept 13: Tower tour (GetYourGuide)');
      console.log('   • Oct 13: Sagrada Familia (more tickets)');
      console.log('   • Oct 15-20: Alhambra');
      console.log(`   The monitor will keep checking every ${CHECK_INTERVAL / 60000} minutes...`);
    }

  } catch (error) {
    console.error('Check error:', error);
  } finally {
    await browser.close();
  }
}

async function logAvailability(site, date, isPriority = false) {
  const type = isPriority ? 'PRIORITY' : 'REGULAR';
  const logEntry = `[${new Date().toISOString()}] ${type} - ${site} - October ${date} - AVAILABLE\n`;
  try {
    await fs.appendFile('availability.log', logEntry);
  } catch (error) {
    console.error('Error writing log:', error);
  }
}

async function main() {
  console.log('🏛️  Sagrada Familia Ticket Monitor');
  console.log('=====================================');
  console.log(`🎯 MONITORING DATES: October ${PRIORITY_DATES.join(', ')} (Testing both dates)`);
  console.log(`🌐 Sites: Official + GetYourGuide + Tiqets`);
  console.log(`⏱️  Check interval: ${CHECK_INTERVAL / 60000} minutes`);
  console.log(`📱 Notifications: Desktop + Voice + Sound`);
  console.log('=====================================\n');

  // Run initial check
  await runCheck();

  // Schedule regular checks
  setInterval(runCheck, CHECK_INTERVAL);

  console.log('\n📍 Monitor is running continuously.');
  console.log('💡 You\'ll be notified IMMEDIATELY when Oct 13 becomes available!');
  console.log('🎫 Checking for MORE tickets on Oct 13!');
  console.log('🛑 Press Ctrl+C to stop.\n');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping monitor...');
  process.exit(0);
});

// Start the monitor
main().catch(console.error);