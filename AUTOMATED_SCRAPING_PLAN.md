# Automated Auction Scraping Plan

## Goal
Enable automatic scraping at configurable intervals with UI controls in the diagnostics dashboard.

## Implementation Plan

### 1. Add Scraper Schedule Settings Table

**File**: `shared/schema.ts`

```typescript
export const scraperSettings = pgTable("scraper_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").default(false),
  cadence: text("cadence").default("daily"), // "daily", "every-other-day", "weekly", "manual"
  scheduleTime: text("schedule_time").default("00:00"), // HH:MM format (e.g., "00:00" for midnight)
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  updatedAt: timestamp("updated_at").defaultNow()
});
```

### 2. Create Automated Scraper Service

**File**: `server/services/automaticScraper.ts`

```typescript
import { auctionScraperService } from './auctionScraper';
import { db } from '../db';
import { scraperSettings } from '@shared/schema';

export class AutomaticScraperService {
  private intervalId: NodeJS.Timeout | null = null;
  private checkInterval = 60000; // Check every minute
  
  async start() {
    console.log('🤖 Starting Automatic Scraper Service');
    
    // Check settings and schedule immediately
    await this.checkAndRun();
    
    // Check every minute if it's time to run
    this.intervalId = setInterval(() => {
      this.checkAndRun();
    }, this.checkInterval);
  }
  
  async checkAndRun() {
    const settings = await this.getSettings();
    
    if (!settings.enabled) return;
    
    const now = new Date();
    const [hours, minutes] = settings.scheduleTime.split(':').map(Number);
    
    // Check if it's time to run
    if (now.getHours() === hours && now.getMinutes() === minutes) {
      // Check if we already ran in the last hour
      if (settings.lastRun) {
        const hoursSinceLastRun = (now.getTime() - new Date(settings.lastRun).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastRun < 1) return; // Already ran
      }
      
      console.log('🚀 Starting scheduled scrape...');
      await this.runScraper();
    }
  }
  
  async runScraper() {
    try {
      const now = new Date();
      
      // Update last run time
      await this.updateSettings({ lastRun: now });
      
      // Run the scraper
      const results = await auctionScraperService.scrapeAllSources();
      
      console.log(`✅ Scheduled scrape complete: ${results.length} auctions`);
      
      // Calculate next run based on cadence
      const settings = await this.getSettings();
      const nextRun = this.calculateNextRun(now, settings.cadence);
      await this.updateSettings({ nextRun });
      
    } catch (error) {
      console.error('❌ Scheduled scrape failed:', error);
    }
  }
  
  private calculateNextRun(from: Date, cadence: string): Date {
    const next = new Date(from);
    
    if (cadence === 'daily') {
      next.setDate(next.getDate() + 1);
    } else if (cadence === 'every-other-day') {
      next.setDate(next.getDate() + 2);
    } else if (cadence === 'weekly') {
      next.setDate(next.getDate() + 7);
    }
    
    return next;
  }
  
  async getSettings() {
    let settings = await db.query.scraperSettings.findFirst();
    
    // Create default if doesn't exist
    if (!settings) {
      await db.insert(scraperSettings).values({
        enabled: false,
        cadence: 'daily',
        scheduleTime: '00:00'
      });
      settings = await db.query.scraperSettings.findFirst();
    }
    
    return settings!;
  }
  
  async updateSettings(updates: any) {
    const current = await this.getSettings();
    await db.update(scraperSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(scraperSettings.id, current.id));
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      console.log('🤖 Automatic Scraper Service stopped');
    }
  }
}

export const automaticScraperService = new AutomaticScraperService();
```

### 3. Add API Endpoints

**File**: `server/routes.ts`

Add after the existing scraper endpoints:

```typescript
// Get scraper schedule settings
app.get("/api/auctions/schedule", async (req, res) => {
  try {
    const settings = await automaticScraperService.getSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get settings' });
  }
});

// Update scraper schedule settings
app.post("/api/auctions/schedule", async (req, res) => {
  try {
    const { enabled, cadence, scheduleTime } = req.body;
    
    await automaticScraperService.updateSettings({
      enabled,
      cadence,
      scheduleTime
    });
    
    res.json({ success: true, message: 'Schedule updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update schedule' });
  }
});
```

### 4. Start Service in Server

**File**: `server/index.ts`

```typescript
import { automaticScraperService } from "./services/automaticScraper";

// After starting archiver service
automaticScraperService.start();

// In shutdown handlers
process.on('SIGTERM', async () => {
  automaticScraperService.stop();
  archiverService.stop();
  await cleanupOpenAI();
  process.exit(0);
});
```

### 5. Add UI Controls in Dashboard

**File**: `client/src/pages/auction-diagnostics.tsx`

Add schedule settings UI below the "RUN FULL SCRAPER" button:

```typescript
// State
const [scheduleSettings, setScheduleSettings] = useState({
  enabled: false,
  cadence: 'daily',
  scheduleTime: '00:00'
});

// Fetch settings
useEffect(() => {
  fetch('/api/auctions/schedule')
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        setScheduleSettings(data.settings);
      }
    });
}, []);

// Update settings
const updateSchedule = async () => {
  await fetch('/api/auctions/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scheduleSettings)
  });
};

// UI Component (add below RUN FULL SCRAPER button)
<div className="mt-4 pt-4 border-t">
  <div className="text-sm font-semibold mb-2">Automatic Scraping</div>
  <div className="grid grid-cols-3 gap-2">
    <div className="flex items-center gap-2">
      <Checkbox 
        checked={scheduleSettings.enabled}
        onCheckedChange={(checked) => {
          const newSettings = { ...scheduleSettings, enabled: !!checked };
          setScheduleSettings(newSettings);
          updateSchedule();
        }}
      />
      <Label className="text-xs">Enable Auto-Scrape</Label>
    </div>
    <Select 
      value={scheduleSettings.cadence}
      onValueChange={(value) => {
        const newSettings = { ...scheduleSettings, cadence: value };
        setScheduleSettings(newSettings);
        updateSchedule();
      }}
    >
      <SelectTrigger className="h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="daily">Daily</SelectItem>
        <SelectItem value="every-other-day">Every Other Day</SelectItem>
        <SelectItem value="weekly">Weekly</SelectItem>
        <SelectItem value="manual">Manual Only</SelectItem>
      </SelectContent>
    </Select>
    <Input
      type="time"
      value={scheduleSettings.scheduleTime}
      onChange={(e) => {
        const newSettings = { ...scheduleSettings, scheduleTime: e.target.value };
        setScheduleSettings(newSettings);
      }}
      onBlur={updateSchedule}
      className="h-8 text-xs"
    />
  </div>
  {scheduleSettings.enabled && (
    <div className="text-xs text-gray-600 mt-2">
      Next scrape: {scheduleSettings.cadence} at {scheduleSettings.scheduleTime}
    </div>
  )}
</div>
```

## Implementation Steps

1. Add scraperSettings table to schema
2. Run database migration
3. Create AutomaticScraperService
4. Add API endpoints for settings
5. Integrate into server startup
6. Add UI controls to diagnostics page
7. Test automatic scraping
8. Deploy

## Expected UX

User visits `/auction-diagnostics` and sees:

```
┌─────────────────────────────────────────┐
│  🚀 RUN FULL SCRAPER [Button]           │
├─────────────────────────────────────────┤
│  Automatic Scraping:                    │
│  [✓] Enable  [Daily ▾]  [00:00]         │
│  Next scrape: Daily at 00:00            │
└─────────────────────────────────────────┘
```

Changes take effect immediately. Service checks every minute if it's time to run.

## Safety Features

- Only runs if enabled
- Won't run twice in same hour
- Logs all automatic scrapes
- Can disable anytime from UI
- Manual scrape always available

Ready to implement?

