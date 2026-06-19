---
name: checktickets
description: Monitor ticket availability on GetYourGuide and Tiqets for a given date and party size, sending notifications when tickets become available.
---

# Check Tickets Skill

Ask the user for the following — one question at a time — using AskUserQuestion:

1. **GetYourGuide URL** — the product page URL for the activity on GetYourGuide
2. **Tiqets URL** — the product page URL for the activity on Tiqets
3. **Date** — the date they want tickets for (e.g. "October 13 2026")
4. **Preferred time slot** — e.g. "9:00 AM", "afternoon", or "any"
5. **Party size** — number of adults (11-99), children (5-10), and infants (4 and under)

Once you have all the answers, launch the monitor by running:

```bash
node /Users/qh/Development/checktickets/monitor.js \
  --gyg-url="<GYG_URL>" \
  --tiqets-url="<TIQETS_URL>" \
  --date="<DATE>" \
  --time="<TIME_SLOT>" \
  --adults=<ADULTS> \
  --children=<CHILDREN> \
  --infants=<INFANTS>
```

The monitor will check both sites every 2 minutes and send a macOS notification + voice alert when tickets become available.
