#!/bin/bash

# Monitor parcel load progress
LOG_FILE="parcel-load.log"

echo "📊 Parcel Load Monitor"
echo "====================="
echo ""

if [ ! -f "$LOG_FILE" ]; then
    echo "❌ Log file not found: $LOG_FILE"
    echo "   Make sure the load process is running"
    exit 1
fi

while true; do
    clear
    echo "📊 Parcel Load Monitor"
    echo "====================="
    echo ""
    echo "Last 15 lines of log:"
    echo ""
    tail -15 "$LOG_FILE"
    echo ""
    echo "---"
    echo "Press Ctrl+C to stop monitoring"
    echo "Refreshing in 10 seconds..."
    sleep 10
done

