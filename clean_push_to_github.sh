#!/bin/bash

# TerraValue GitHub Clean Push Script
# This script creates a new clean repository without sensitive data in git history

echo "==================================="
echo "TerraValue GitHub Clean Push Script"
echo "Removing secrets from git history"
echo "==================================="
echo ""

# Create a backup of current work
echo "Creating backup of current work..."
cp -r .git .git.backup 2>/dev/null || echo "No existing git repo to backup"

# Remove the old git repository to clear history with secrets
echo "Removing git history containing secrets..."
rm -rf .git

# Initialize a fresh git repository
echo "Initializing fresh git repository..."
git init

# Configure git (optional - update with your info)
# git config user.email "your-email@example.com"
# git config user.name "Your Name"

# Add the GitHub remote
echo "Adding GitHub remote..."
git remote add origin https://github.com/dallyp22/TerraValue2.git

# Create .gitignore if it doesn't exist
if [ ! -f .gitignore ]; then
    echo "Creating .gitignore..."
    cat > .gitignore << 'EOL'
# Dependencies
node_modules/
dist/
build/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Temporary files
*.tmp
*.temp
.git.backup/

# Replit specific
.replit
.config/
.cache/
.upm/
replit.nix
EOL
fi

# Stage all files
echo "Staging all files (excluding .gitignore patterns)..."
git add .

# Create a single clean commit
echo "Creating clean commit..."
git commit -m "Initial commit: TerraValue - AI-Powered Agricultural Land Valuation Platform

TerraValue is a sophisticated web application for agricultural land valuation that combines:
- AI-powered valuations using OpenAI GPT-4o-mini
- Iowa CSR2 soil productivity data integration
- Real-time corn futures pricing
- Interactive mapping with custom parcel data
- Comprehensive valuation methods and PDF reporting

Tech Stack:
- Frontend: React 18, TypeScript, TanStack Query, Shadcn/UI, Tailwind CSS
- Backend: Node.js, Express, PostgreSQL with Drizzle ORM
- External APIs: OpenAI, Yahoo Finance, ArcGIS REST Services
- Mapping: MapLibre GL with Mapbox custom tilesets

Features:
- Interactive parcel selection for Harrison County, Iowa
- Custom polygon drawing with real-time acreage calculation
- Three valuation methods: CSR2 Quantitative, Income Approach, AI Market-Adjusted
- Property improvements valuation (AI or manual)
- Market comparables analysis
- Professional PDF report generation

Security Note: All API keys and sensitive data are managed through environment variables.
No secrets are stored in the repository."

echo ""
echo "==================================="
echo "Clean repository created!"
echo "==================================="
echo ""
echo "To push to GitHub, run:"
echo ""
echo "  git push -u origin main --force"
echo ""
echo "The --force flag is needed because we're replacing the entire history."
echo ""
echo "⚠️  WARNING: This will replace ALL existing commits on GitHub."
echo "Make sure you want to completely replace the repository history."
echo ""
echo "For authentication, use:"
echo "  - GitHub username + personal access token"
echo "  - Or GitHub CLI: gh auth login"
echo ""