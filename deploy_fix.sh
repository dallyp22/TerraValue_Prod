#!/bin/bash

# Deployment script for Vercel serverless fix
# Run this script to build, test, and deploy the fixes

set -e  # Exit on any error

echo "🔧 Auction Scraper - Vercel Deployment Fix"
echo "=========================================="
echo ""

# Step 1: Build the project
echo "📦 Step 1: Building the project..."
npm run build
echo "✅ Build successful!"
echo ""

# Step 2: Run a quick test
echo "🧪 Step 2: Testing build..."
if [ -f "dist/index.js" ] && [ -d "dist/public" ]; then
    echo "✅ Build artifacts verified!"
else
    echo "❌ Build artifacts missing!"
    exit 1
fi
echo ""

# Step 3: Check git status
echo "📋 Step 3: Checking git status..."
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  Uncommitted changes detected. Files to be committed:"
    git status --short
    echo ""
    read -p "Do you want to commit these changes? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "💾 Committing changes..."
        git add .
        git commit -m "Fix Vercel serverless error handling - ensure JSON responses

- Enhanced error handling in api/index.ts to ensure JSON responses
- Updated serverRoutes to skip HTTP server in serverless mode
- Added Content-Type headers for API routes
- Improved error logging and debugging
- Updated vercel.json with function configuration"
        echo "✅ Changes committed!"
    else
        echo "⏭️  Skipping commit. You can commit manually later."
    fi
else
    echo "✅ No uncommitted changes!"
fi
echo ""

# Step 4: Push to deploy
echo "🚀 Step 4: Ready to deploy!"
echo ""
echo "To deploy to Vercel, run:"
echo "  git push origin main"
echo ""
echo "Or if you haven't committed yet:"
echo "  git add ."
echo "  git commit -m 'Fix Vercel serverless error handling'"
echo "  git push origin main"
echo ""
echo "📝 After deployment:"
echo "  1. Check Vercel Dashboard for deployment status"
echo "  2. Test the /api/health endpoint"
echo "  3. Test the /api/auctions endpoint"
echo "  4. Verify the map loads with auction markers"
echo ""
echo "📖 For detailed instructions, see VERCEL_DEPLOYMENT_FIX.md"
echo ""
echo "✨ Build and pre-deployment checks complete!"

