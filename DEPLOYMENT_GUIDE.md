# TerraValue Deployment Guide

## Quick Deployment Steps

### 1. Set Required Environment Variable
Before deploying, you need to add your OpenAI API key:

1. Click on "Secrets" in the Replit sidebar (lock icon)
2. Add a new secret:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: Your OpenAI API key

### 2. Deploy the Application
1. Click the "Deploy" button in the top right of Replit
2. Choose your deployment configuration
3. The application will be deployed to a `.replit.app` domain

## What's Included

### Core Features
✓ AI-powered agricultural land valuation  
✓ Interactive map with polygon drawing  
✓ CSR2 soil productivity analysis  
✓ Property improvements valuation  
✓ Market analysis with Iowa sales comparables  
✓ Corn futures integration for rent calculation  

### Technical Stack
- Frontend: React with TypeScript
- Backend: Express.js with Node.js
- Database: PostgreSQL (provided by Replit)
- Maps: MapLibre GL with Iowa parcel data
- AI: OpenAI GPT-4o-mini

### Security Features
- Rate limiting protection
- Input validation
- Security headers
- Error handling with logging

## Post-Deployment Testing

Once deployed, test these key features:

1. **Map Functionality**
   - Navigate to different areas
   - Toggle between street/satellite view
   - Draw custom polygons

2. **Valuation Process**
   - Click a parcel or draw a polygon
   - Add property improvements
   - Submit valuation
   - Review the comprehensive report

## Support

If you encounter issues:
- Check that the OPENAI_API_KEY is properly set
- Review the application logs in Replit
- Typical valuation takes 15-30 seconds to complete

The application is ready for production use!