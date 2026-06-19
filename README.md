# Ticket Availability Monitor

Monitors GetYourGuide and Tiqets for ticket availability on a specific date and time slot, sending instant macOS notifications when tickets become available.

## Setup

```bash
npm install
npx playwright install chromium
```

## Usage

### Interactive (prompts for input)

```bash
npm start
```

You'll be asked for:
- GetYourGuide URL
- Tiqets URL
- Date (e.g. `October 13 2026`)
- Preferred time slot (e.g. `9:00 AM`, or leave blank for any)
- Number of adults (11-99), children (5-10), infants (4 and under)

### CLI args

```bash
node monitor.js \
  --gyg-url="https://www.getyourguide.com/..." \
  --tiqets-url="https://www.tiqets.com/..." \
  --date="October 13 2026" \
  --time="9:00 AM" \
  --adults=2 \
  --children=1 \
  --infants=0
```

### As a Claude Code skill

Type `/checktickets` in Claude Code — it will ask you the questions and launch the monitor.

## How It Works

- Checks both sites every 2 minutes using a headless Playwright browser
- Opens the date picker on each site and looks for your target date
- If a time slot preference is set, clicks the date and checks the time slot UI
- Falls back to date-only availability if the site doesn't show time slots yet
- Sends a macOS desktop notification, voice alert, and sound when tickets are found

## When Notified

Act fast — book immediately at the URL shown in the notification. Tickets sell out quickly.

## Requirements

- Node.js
- macOS (for desktop notifications and voice alerts)
