# Fresh Vercel Deployment - Step by Step

## Current Status
We've been experiencing persistent 500 errors due to serverless function configuration issues.

## Solution: Fresh Start

### Step 1: Delete Current Vercel Project
1. Go to https://vercel.com/dashboard
2. Click on **terra-value-prod** project
3. Go to **Settings** (top right)
4. Scroll to bottom → **Delete Project**
5. Type project name to confirm deletion

### Step 2: Create New Vercel Project  
1. Go to https://vercel.com/new
2. Click **Import Git Repository**
3. Select: `dallyp22/TerraValue_Prod`
4. **Project Configuration:**
   - Framework Preset: **Other**
   - Root Directory: `./` (leave as is)
   - Build Command: `npm run build`
   - Output Directory: `dist/public`
   - Install Command: `npm install`

### Step 3: Add Environment Variables
Click **Environment Variables** and add ALL of these:

| Name | Value |
|------|-------|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_KAJf7kZBNVI1@ep-proud-sun-aeushju0-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require` |
| `OPENAI_API_KEY` | (your OpenAI key from .env) |
| `FIRECRAWL_API_KEY` | `fc-3ad1ee8a8ace4a51ab0f52186a7106d6` |
| `VITE_MAPBOX_PUBLIC_KEY` | `pk.eyJ1IjoiZHBvbGl2a2EyMiIsImEiOiJjbTk4eG9zczMwODRuMmlweG5od3VzNzJvIn0.JusHL37Lpcp-ojEJyqig4Q` |

**IMPORTANT:** Add these for Production, Preview, AND Development!

### Step 4: Deploy
Click **Deploy** and wait 3-4 minutes.

### Step 5: Test
Once deployed, test:
```bash
# Get your new URL from Vercel dashboard, then:
curl https://your-new-url.vercel.app/api/health
```

## What This Fresh Start Fixes
- ✅ Clean build cache
- ✅ Proper serverless function configuration
- ✅ No conflicting old deployments
- ✅ Fresh environment variable setup

## If It Still Fails
Check Vercel Function Logs:
1. Vercel Dashboard → Your Project
2. Click latest deployment
3. **Functions** tab → Look for errors
4. Share the specific error message

The issue might be with how Vercel compiles the serverless function with relative imports.

