# Sagrada Familia Ticket Monitor

Automated ticket availability checker for Sagrada Familia that monitors the official website and sends instant notifications when your desired dates become available.

## Features

- ✅ Visual detection of available vs unavailable dates
- 🎯 Priority alerts for your specific dates (Oct 12-15)
- 📱 Desktop notifications (macOS)
- 🔊 Voice announcements
- 🎵 Sound alerts
- ⏱️ Automatic checking every 5 minutes
- 📝 Availability logging

## Setup

Install dependencies:
```bash
npm install
```

## Usage

Start the monitor:
```bash
npm start
```

The monitor will:
- Check every 5 minutes for ticket availability
- Send urgent notifications if Oct 12-15 become available
- Show status of all October dates

## Current Availability Status

Based on the official Sagrada Familia website:
- **October 1-20**: ❌ Unavailable (including dates 12-15)
- **October 21-31**: ✅ Available

## How It Works

The monitor uses visual detection to identify available dates:
- **Gray underlined text** = Unavailable dates
- **Black text on white** = Available dates

When your priority dates (Oct 12-15) become available, you'll receive:
1. 🖥️ Large console alert
2. 📱 macOS desktop notification
3. 🔊 Voice announcement: "URGENT! Your requested date is available!"
4. 🎵 Multiple sound alerts

## Configuration

Edit `monitor.js` to change:
- `PRIORITY_DATES`: Your desired dates (default: 12, 13, 14, 15)
- `CHECK_INTERVAL`: Check frequency (default: 5 minutes)

## Tips

- Keep the monitor running 24/7 to catch cancellations
- Tickets can become available at any time
- Act quickly when notified - tickets sell out fast
- The official site has the best prices

## Requirements

- Node.js
- macOS (for notifications)
- Internet connection