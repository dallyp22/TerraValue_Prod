#!/bin/bash

echo "🚀 Production Database Optimization"
echo "==================================="
echo ""
echo "⚠️  IMPORTANT: Make sure DATABASE_URL is set to your PRODUCTION database"
echo ""
read -p "Is DATABASE_URL set to PRODUCTION? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Aborted. Set DATABASE_URL first:"
    echo "   export DATABASE_URL='your-production-database-url'"
    exit 1
fi

echo ""
echo "DATABASE_URL: ${DATABASE_URL:0:30}..."
echo ""
read -p "Proceed with optimization? (yes/no): " proceed

if [ "$proceed" != "yes" ]; then
    echo "❌ Aborted"
    exit 1
fi

echo ""
echo "🔧 Running optimization (this will take 5-10 minutes)..."
echo ""

npx tsx scripts/optimize-parcel-tiles.ts

echo ""
echo "✅ DONE!"
echo ""
echo "Next steps:"
echo "1. Hard refresh your production site (Cmd + Shift + R)"
echo "2. Test parcel display and performance"
echo "3. Verify all features working"

