#!/bin/bash

# TerraValue GitHub Push Script
# Run this script to push your project to GitHub

echo "==================================="
echo "TerraValue GitHub Push Script"
echo "==================================="
echo ""

# Check if git is initialized
if [ ! -d .git ]; then
    echo "Initializing git repository..."
    git init
fi

# Add the remote repository
echo "Adding GitHub remote..."
git remote remove origin 2>/dev/null # Remove if exists
git remote add origin https://github.com/dallyp22/TerraValue2.git

# Stage all files
echo "Staging all project files..."
git add .

# Create commit
echo "Creating commit..."
git commit -m "Initial commit: TerraValue - AI-Powered Agricultural Land Valuation Platform

TerraValue is a sophisticated web application designed for agricultural land valuation, leveraging:
- OpenAI GPT-4o-mini for AI-powered valuations and market analysis
- Iowa CSR2 soil productivity data integration
- Real-time corn futures pricing via Yahoo Finance
- Interactive mapping with MapLibre GL and custom parcel data
- Comprehensive valuation methods: CSR2 Quantitative, Income Approach, and AI Market-Adjusted
- PDF report generation with detailed breakdowns

Tech Stack:
- Frontend: React 18, TypeScript, TanStack Query, Shadcn/UI, Tailwind CSS
- Backend: Node.js, Express, PostgreSQL with Drizzle ORM
- External APIs: OpenAI, Yahoo Finance, ArcGIS REST Services
- Mapping: MapLibre GL with custom Mapbox tilesets for Harrison County

Features:
- Interactive parcel selection and custom polygon drawing
- Real-time CSR2 soil analysis
- Property improvements valuation (AI or manual)
- Market comparables analysis with Iowa-specific data
- Comprehensive valuation reports with PDF export
- Ownership heatmap visualization
- Mobile-responsive design"

# Push to GitHub
echo ""
echo "Ready to push to GitHub!"
echo "==================================="
echo ""
echo "To complete the push, run:"
echo ""
echo "git push -u origin main"
echo ""
echo "If your branch is named 'master' instead of 'main', use:"
echo "git push -u origin master"
echo ""
echo "You may be prompted for your GitHub credentials."
echo "For authentication, you'll need either:"
echo "  - Your GitHub username and personal access token (recommended)"
echo "  - GitHub CLI authentication (gh auth login)"
echo ""