#!/bin/bash

# Monitor scraping and enrichment progress

echo "╔════════════════════════════════════════════════════╗"
echo "║     Auction Scrape & Enrichment Monitor            ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

while true; do
  clear
  echo "╔════════════════════════════════════════════════════╗"
  echo "║     Auction Scrape & Enrichment Monitor            ║"
  echo "╚════════════════════════════════════════════════════╝"
  echo ""
  echo "🕐 $(date '+%H:%M:%S')"
  echo ""
  
  # Check scrape progress
  echo "📡 SCRAPING PROGRESS:"
  echo "─────────────────────────────────────────────────────"
  SCRAPE_DATA=$(curl -s http://localhost:5001/api/auctions/scrape-progress)
  echo "$SCRAPE_DATA" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('isActive'):
        completed = data.get('completedSources', 0)
        total = data.get('totalSources', 50)
        pct = int((completed / total) * 100) if total > 0 else 0
        print(f\"  Status: 🟢 ACTIVE\")
        print(f\"  Current: {data.get('currentSource', 'Unknown')}\")
        print(f\"  Progress: {completed}/{total} sources ({pct}%)\")
    else:
        print(f\"  Status: ✅ COMPLETE\")
except:
    print('  Status: ⚠️  Unknown')
"
  echo ""
  
  # Check enrichment status
  echo "✨ ENRICHMENT PROGRESS:"
  echo "─────────────────────────────────────────────────────"
  npm run auctions:enrich:status 2>/dev/null | grep -A 6 "Overall Statistics" | tail -6
  
  echo ""
  echo "Press Ctrl+C to stop monitoring"
  echo ""
  
  sleep 30
done

