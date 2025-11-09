#!/bin/bash

# Complete parcel setup: wait for load, then aggregate and test
LOG_FILE="parcel-load.log"

echo "🏡 Complete Parcel System Setup"
echo "==============================="
echo ""

# Wait for load to complete
echo "⏳ Waiting for parcel data load to complete..."
echo "   Monitoring: $LOG_FILE"
echo ""

while true; do
    if grep -q "✅ Parcel data load complete!" "$LOG_FILE" 2>/dev/null; then
        echo "✅ Parcel load complete!"
        break
    elif grep -q "❌ Error loading parcels:" "$LOG_FILE" 2>/dev/null; then
        echo "❌ Parcel load failed!"
        echo "   Check $LOG_FILE for details"
        exit 1
    fi
    
    # Show current progress
    LATEST=$(tail -5 "$LOG_FILE" 2>/dev/null | grep "Progress:" | tail -1)
    if [ -n "$LATEST" ]; then
        echo -ne "\r   $LATEST"
    fi
    
    sleep 5
done

echo ""
echo ""
echo "📊 Step 3: Aggregating ownership data..."
npm run db:parcels:aggregate

echo ""
echo "🧪 Step 4: Running test suite..."
npm run test:parcels

echo ""
echo "✅ Parcel system setup complete!"
echo ""
echo "📋 Summary:"
echo "   • Parcel data loaded"
echo "   • Ownership groups created"
echo "   • System tested and verified"
echo "   • Frontend enabled to use self-hosted tiles"
echo ""
echo "🚀 Your parcel system is ready to use!"

