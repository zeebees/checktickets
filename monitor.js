#!/usr/bin/env node

const { chromium } = require('playwright');
const { exec } = require('child_process');
const fs = require('fs').promises;
const readline = require('readline');

const CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes

let CONFIG = null;

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

async function promptConfig() {
  // Support CLI args: node monitor.js --gyg-url=X --tiqets-url=X --date=X --adults=N --children=N --infants=N
  const args = Object.fromEntries(
    process.argv.slice(2)
      .filter(a => a.startsWith('--'))
      .map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)]; })
  );

  if (args['gyg-url'] && args['tiqets-url'] && args.date) {
    return {
      gygUrl: args['gyg-url'],
      tiqetsUrl: args['tiqets-url'],
      dateStr: args.date,
      ...parseDateStr(args.date),
      timeSlot: args.time || 'any',
      adults: parseInt(args.adults || '0', 10),
      children: parseInt(args.children || '0', 10),
      infants: parseInt(args.infants || '0', 10),
    };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n🎫 Ticket Availability Monitor');
  console.log('================================\n');

  const gygUrl = await ask(rl, '🌐 GetYourGuide URL: ');
  const tiqetsUrl = await ask(rl, '🎫 Tiqets URL: ');
  const dateStr = await ask(rl, '📅 Date (e.g. "October 13 2026"): ');
  const timeSlot = await ask(rl, '⏰ Preferred time (e.g. "9:00 AM", or leave blank for any): ') || 'any';
  const adults = parseInt((await ask(rl, '👨 Adults (11-99, 0 if none): ')) || '0', 10);
  const children = parseInt((await ask(rl, '👧 Children (5-10, 0 if none): ')) || '0', 10);
  const infants = parseInt((await ask(rl, '👶 Infants (4 and under, 0 if none): ')) || '0', 10);
  rl.close();

  return { gygUrl, tiqetsUrl, dateStr, ...parseDateStr(dateStr), timeSlot, adults, children, infants };
}

function parseDateStr(dateStr) {
  const parts = dateStr.match(/(\w+)\s+(\d{1,2})(?:\s+(\d{4}))?/);
  return {
    month: parts?.[1] || '',
    day: parts?.[2] || '',
    year: parts?.[3] || String(new Date().getFullYear()),
  };
}

function peopleStr() {
  const { adults, children, infants } = CONFIG;
  return [
    adults > 0 ? `${adults} adult${adults !== 1 ? 's' : ''}` : '',
    children > 0 ? `${children} child${children !== 1 ? 'ren' : ''}` : '',
    infants > 0 ? `${infants} infant${infants !== 1 ? 's' : ''}` : '',
  ].filter(Boolean).join(', ') || 'unspecified';
}

function sendNotification(site, url) {
  const { dateStr } = CONFIG;
  console.log('\n🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨');
  console.log('TICKETS AVAILABLE!!!');
  console.log(`📅 Date:   ${dateStr}`);
  console.log(`⏰ Time:   ${CONFIG.timeSlot}`);
  console.log(`👥 People: ${peopleStr()}`);
  console.log(`🌐 Site:   ${site}`);
  console.log(`🔗 URL:    ${url}`);
  console.log('🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n');

  const msg = `${dateStr} tickets available on ${site}`;
  exec(`osascript -e 'display notification "${msg}" with title "🎫 Tickets Available!" sound name "Glass"'`);
  exec(`say "Tickets available for ${dateStr} on ${site}!"`);
  exec('afplay /System/Library/Sounds/Glass.aiff');
  logAvailability(site, dateStr);
}

// Returns true if targetTime is found among available time slots on the page.
// Returns null if no time slot UI is detected (caller falls back to date-only result).
function evalTimeSlot(targetTime) {
  const norm = t => t.toLowerCase().replace(/\s+/g, '').replace(':', '');
  const target = norm(targetTime);

  const timeSelectors = [
    '[class*="timeslot"]', '[class*="time-slot"]', '[class*="time_slot"]',
    '[class*="session"]', '[class*="departure"]', '[class*="starting-time"]',
    '[data-testid*="time"]', 'li[class*="time"]', 'button[class*="time"]',
    '[role="option"]', '[class*="availability-time"]',
  ];

  let anyTimeFound = false;
  for (const sel of timeSelectors) {
    for (const el of document.querySelectorAll(sel)) {
      const text = el.textContent.trim();
      if (!text) continue;
      anyTimeFound = true;
      if (norm(text).includes(target)) {
        const disabled = el.classList.contains('disabled') ||
          el.classList.contains('sold-out') ||
          el.getAttribute('aria-disabled') === 'true' ||
          el.hasAttribute('disabled');
        return !disabled;
      }
    }
  }
  return anyTimeFound ? false : null; // null = no time UI detected
}

async function checkTimeSlot(page, timeSlot) {
  if (timeSlot === 'any') return true;
  console.log(`  Checking time slot: ${timeSlot}...`);
  await page.waitForTimeout(3000);
  const result = await page.evaluate(evalTimeSlot, timeSlot);
  if (result === null) {
    console.log('  No time slot UI detected — reporting date as available');
    return true;
  }
  return result;
}

async function checkGetYourGuide(page) {
  try {
    const { gygUrl, day, timeSlot } = CONFIG;
    await page.goto(gygUrl, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('  Loaded GetYourGuide...');
    await page.waitForTimeout(3000);

    // Dismiss cookie consent if present
    try {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b =>
          b.textContent.includes('I agree') || b.textContent.includes('Accept')
        );
        if (btn) btn.click();
      });
      await page.waitForTimeout(1000);
    } catch (e) {}

    // Open the date picker
    const clicked = await page.evaluate(() => {
      window.scrollBy(0, 300);
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.includes('Check availability') && b.getBoundingClientRect().width > 200
      );
      if (btn) { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); btn.click(); return true; }
      return false;
    });

    if (!clicked) { console.log('  Could not open date picker'); return false; }
    console.log('  Opened date picker...');
    await page.waitForTimeout(3000);

    // Click the date if available
    const dateAvailable = await page.evaluate((targetDay) => {
      for (const cell of document.querySelectorAll('td')) {
        if (cell.textContent.trim() === targetDay) {
          const inner = cell.querySelector('.c-datepicker-day__container');
          if (inner && !inner.classList.contains('c-datepicker-day--disabled')) {
            cell.click();
            return true;
          }
          return false;
        }
      }
      return false;
    }, day);

    if (!dateAvailable) return false;
    return checkTimeSlot(page, timeSlot);

  } catch (error) {
    console.error('  Error:', error.message);
    return false;
  }
}

async function checkTiqets(page) {
  try {
    const { tiqetsUrl, day, month, year, timeSlot } = CONFIG;
    await page.goto(tiqetsUrl, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('  Loaded Tiqets...');
    await page.waitForTimeout(3000);

    // Try to open date picker
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-testid*="date"], button[aria-label*="date"], [class*="date"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);

    // Click the date if available
    const dateAvailable = await page.evaluate(({ targetDay, targetMonth, targetYear }) => {
      const bodyText = document.body.textContent || '';
      if (!bodyText.includes(targetMonth) || !bodyText.includes(targetYear)) return false;
      for (const cell of document.querySelectorAll('[role="gridcell"], td, [class*="calendar-day"]')) {
        if (cell.textContent.trim() === targetDay) {
          const isDisabled = cell.classList.contains('disabled') ||
            cell.classList.contains('unavailable') ||
            cell.getAttribute('aria-disabled') === 'true' ||
            cell.hasAttribute('disabled');
          if (!isDisabled) { cell.click(); return true; }
          return false;
        }
      }
      return false;
    }, { targetDay: day, targetMonth: month, targetYear: year });

    if (!dateAvailable) return false;
    return checkTimeSlot(page, timeSlot);

  } catch (error) {
    console.error('  Error:', error.message);
    return false;
  }
}

async function runCheck() {
  console.log(`\n[${new Date().toLocaleString()}] Checking availability...`);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });
    const page = await context.newPage();

    console.log('GetYourGuide...');
    const gyg = await checkGetYourGuide(page);
    console.log(gyg ? '  ✅ AVAILABLE!' : `  ❌ Not available`);
    if (gyg) sendNotification('GetYourGuide', CONFIG.gygUrl);

    console.log('Tiqets...');
    const tiqets = await checkTiqets(page);
    console.log(tiqets ? '  ✅ AVAILABLE!' : `  ❌ Not available`);
    if (tiqets) sendNotification('Tiqets', CONFIG.tiqetsUrl);

    if (!gyg && !tiqets) {
      console.log(`\n⏳ Not available yet. Next check in ${CHECK_INTERVAL / 60000} minutes...`);
    }
  } catch (error) {
    console.error('Check error:', error.message);
  } finally {
    await browser.close();
  }
}

async function logAvailability(site, date) {
  const entry = `[${new Date().toISOString()}] ${site} - ${date} - AVAILABLE\n`;
  try { await fs.appendFile('availability.log', entry); } catch (e) {}
}

async function main() {
  CONFIG = await promptConfig();

  console.log('\n🎫 Monitor starting');
  console.log('====================');
  console.log(`📅 Date:    ${CONFIG.dateStr}`);
  console.log(`⏰ Time:    ${CONFIG.timeSlot}`);
  console.log(`👥 People:  ${peopleStr()}`);
  console.log(`🌐 GYG:     ${CONFIG.gygUrl}`);
  console.log(`🎫 Tiqets:  ${CONFIG.tiqetsUrl}`);
  console.log(`⏱️  Every:   ${CHECK_INTERVAL / 60000} minutes`);
  console.log('====================\n');

  await runCheck();
  setInterval(runCheck, CHECK_INTERVAL);
  console.log('\n📍 Running. Press Ctrl+C to stop.\n');
}

process.on('SIGINT', () => { console.log('\n👋 Stopping.'); process.exit(0); });

main().catch(console.error);
