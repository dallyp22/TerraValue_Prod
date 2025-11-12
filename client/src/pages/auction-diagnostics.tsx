import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, MapPin, Ruler, ExternalLink, Plus, ChevronLeft, ChevronRight, ArrowLeft, Map, TrendingUp, Database, RefreshCw, Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export default function AuctionDiagnostics() {
  const [loading, setLoading] = useState(false);
  const [auctionData, setAuctionData] = useState<any>(null);
  const [scraping, setScraping] = useState(false);
  const [investigating, setInvestigating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [investigationResults, setInvestigationResults] = useState<any>(null);
  const [mapBounds, setMapBounds] = useState({
    minLat: 40.5,
    maxLat: 43.5,
    minLon: -96.5,
    maxLon: -90.0
  });
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourcePath, setNewSourcePath] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sourcePages, setSourcePages] = useState<{[key: string]: number}>({});
  const itemsPerPage = 20;
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<any>(null);
  
  // New state for diagnostics
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [recentAuctions, setRecentAuctions] = useState<any[]>([]);
  const [upcomingAuctions, setUpcomingAuctions] = useState<any[]>([]);
  const [coverageMetrics, setCoverageMetrics] = useState<any>(null);
  const [showCoverageTable, setShowCoverageTable] = useState(false);
  const [sourceStats, setSourceStats] = useState<any[]>([]);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<{source: string, category: string} | null>(null);
  
  // Schedule settings state
  const [scheduleSettings, setScheduleSettings] = useState({
    enabled: false,
    cadence: 'daily',
    scheduleTime: '00:00',
    lastRun: null as string | null,
    nextRun: null as string | null
  });
  
  // Scrape progress tracking
  const [scrapeProgress, setScrapeProgress] = useState({
    isActive: false,
    currentSource: '',
    completedSources: 0,
    totalSources: 24,
    currentSourceProgress: 0
  });

  const checkAuctions = async () => {
    setLoading(true);
    try {
      // Use /all endpoint to get everything for diagnostics
      const response = await fetch(`/api/auctions/all`);
      const data = await response.json();
      
      setAuctionData(data);
      console.log('📊 Auction data loaded:', data.total, 'total auctions');
      console.log('📊 By source:', data.bySource);
    } catch (error) {
      console.error('Failed to fetch auctions:', error);
      setAuctionData({ error: 'Failed to fetch auctions' });
    }
    setLoading(false);
  };

  const startScrape = async () => {
    setScraping(true);
    setScrapeProgress({
      isActive: true,
      currentSource: 'Initializing...',
      completedSources: 0,
      totalSources: 24,
      currentSourceProgress: 0
    });
    
    try {
      const response = await fetch('/api/auctions/refresh', { method: 'POST' });
      const data = await response.json();
      
      // Poll for progress updates
      const pollInterval = setInterval(async () => {
        try {
          const progressResponse = await fetch('/api/auctions/scrape-progress');
          const progress = await progressResponse.json();
          
          if (progress.success && progress.isActive) {
            setScrapeProgress({
              isActive: true,
              currentSource: progress.currentSource,
              completedSources: progress.completedSources,
              totalSources: progress.totalSources,
              currentSourceProgress: progress.currentSourceProgress
            });
          } else {
            // Scraping complete
            clearInterval(pollInterval);
            setScrapeProgress({
              isActive: false,
              currentSource: 'Complete!',
              completedSources: 24,
              totalSources: 24,
              currentSourceProgress: 100
            });
            setScraping(false);
            checkAuctions();
            loadDiagnostics();
          }
        } catch (error) {
          console.error('Failed to get progress:', error);
        }
      }, 2000); // Poll every 2 seconds
      
      // Fallback timeout
      setTimeout(() => {
        clearInterval(pollInterval);
        setScraping(false);
        setScrapeProgress(prev => ({ ...prev, isActive: false }));
        checkAuctions();
        loadDiagnostics();
      }, 600000); // 10 minute max
    } catch (error) {
      console.error('Failed to start scrape:', error);
      setScraping(false);
      setScrapeProgress(prev => ({ ...prev, isActive: false }));
    }
  };

  const investigateCoords = async () => {
    setInvestigating(true);
    try {
      const response = await fetch('/api/auctions/investigate');
      const data = await response.json();
      setInvestigationResults(data);
    } catch (error) {
      console.error('Failed to investigate:', error);
    }
    setInvestigating(false);
  };

  const updateCoordinates = async () => {
    setUpdating(true);
    try {
      const response = await fetch('/api/auctions/update-coordinates', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        alert(`Success! Updated ${data.updated} auctions with county coordinates.\n\nRefresh the page to see updated map.`);
        // Refresh data
        checkAuctions();
        investigateCoords();
      } else {
        alert('Failed to update coordinates');
      }
    } catch (error) {
      console.error('Failed to update coordinates:', error);
      alert('Error updating coordinates');
    }
    setUpdating(false);
  };

  const validateCounties = async () => {
    setValidating(true);
    try {
      const response = await fetch('/api/auctions/validate-counties', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        setValidationResults(data);
        if (data.fixed > 0) {
          alert(`✅ County Validation Complete!\n\nValidated: ${data.validated} auctions\nFixed: ${data.fixed} county mismatches\n\nRefresh to see updated data.`);
          checkAuctions(); // Refresh data
        } else {
          alert(`✅ All counties validated!\n\nChecked: ${data.validated} auctions\nNo mismatches found.`);
        }
      }
    } catch (error) {
      console.error('Failed to validate counties:', error);
      alert('Error validating counties');
    }
    setValidating(false);
  };

  // Group auctions by source website
  const auctionsBySource = useMemo(() => {
    if (!auctionData?.auctions) return {};
    
    const grouped: { [key: string]: any[] } = {};
    auctionData.auctions.forEach((auction: any) => {
      const source = auction.sourceWebsite || 'Unknown Source';
      if (!grouped[source]) {
        grouped[source] = [];
      }
      grouped[source].push(auction);
    });
    
    // Sort sources by auction count
    return Object.fromEntries(
      Object.entries(grouped).sort((a, b) => b[1].length - a[1].length)
    );
  }, [auctionData]);

  // Separate auctions with and without coordinates
  const auctionsWithCoords = useMemo(() => {
    return auctionData?.auctions?.filter((a: any) => a.latitude && a.longitude) || [];
  }, [auctionData]);

  const auctionsWithoutCoords = useMemo(() => {
    return auctionData?.auctions?.filter((a: any) => 
      (!a.latitude || !a.longitude) && a.status !== 'excluded'
    ) || [];
  }, [auctionData]);

  const excludedAuctions = useMemo(() => {
    return auctionData?.auctions?.filter((a: any) => a.status === 'excluded') || [];
  }, [auctionData]);

  // Load source statistics
  const loadSourceStats = async () => {
    try {
      const response = await fetch('/api/auctions/source-stats');
      const data = await response.json();
      if (data.success) {
        setSourceStats(data.stats);
      } else {
        // Fallback: Calculate stats from auctionData if API not available
        calculateStatsFromAuctionData();
      }
    } catch (error) {
      console.error('Failed to load source stats:', error);
      // Fallback: Calculate stats from auctionData
      calculateStatsFromAuctionData();
    }
  };

  // Get auctions for a specific source and category
  const getAuctionsBySourceCategory = (source: string, category: string) => {
    if (!auctionData?.auctions) return [];
    
    return auctionData.auctions.filter((auction: any) => {
      if (auction.sourceWebsite !== source) return false;
      
      switch(category) {
        case 'active':
          return auction.status === 'active';
        case 'upcoming':
          const auctionDate = auction.auctionDate ? new Date(auction.auctionDate) : null;
          return auctionDate && auctionDate >= new Date() && auction.status === 'active';
        case 'needs_review':
          return auction.needsDateReview === true;
        case 'sold':
          return auction.status === 'sold';
        default:
          return false;
      }
    });
  };

  // Toggle detail expansion
  const toggleDetailExpansion = (source: string, category: string) => {
    if (expandedDetail?.source === source && expandedDetail?.category === category) {
      setExpandedDetail(null);
    } else {
      setExpandedDetail({ source, category });
    }
  };

  // Calculate source stats from existing auction data (fallback)
  const calculateStatsFromAuctionData = () => {
    if (!auctionData?.auctions) return;
    
    const statsBySource: any = {};
    
    auctionData.auctions.forEach((auction: any) => {
      const source = auction.sourceWebsite || 'Unknown';
      if (!statsBySource[source]) {
        statsBySource[source] = {
          source_website: source,
          total_auctions: 0,
          active_count: 0,
          sold_count: 0,
          with_dates: 0,
          active_with_dates: 0,
          needs_review: 0,
          upcoming_count: 0,
          last_scraped: auction.scrapedAt
        };
      }
      
      const stat = statsBySource[source];
      stat.total_auctions++;
      
      if (auction.status === 'active') stat.active_count++;
      if (auction.status === 'sold') stat.sold_count++;
      if (auction.auctionDate) stat.with_dates++;
      if (auction.auctionDate && auction.status === 'active') stat.active_with_dates++;
      if (auction.needsDateReview) stat.needs_review++;
      
      const auctionDate = auction.auctionDate ? new Date(auction.auctionDate) : null;
      if (auctionDate && auctionDate >= new Date() && auction.status === 'active') {
        stat.upcoming_count++;
      }
      
      // Track most recent scrape time
      if (auction.scrapedAt && (!stat.last_scraped || auction.scrapedAt > stat.last_scraped)) {
        stat.last_scraped = auction.scrapedAt;
      }
    });
    
    // Calculate percentages and convert to array
    const statsArray = Object.values(statsBySource).map((stat: any) => ({
      ...stat,
      date_percentage: stat.total_auctions > 0 
        ? ((stat.with_dates / stat.total_auctions) * 100).toFixed(1)
        : '0'
    }));
    
    // Sort by total auctions descending
    statsArray.sort((a: any, b: any) => b.total_auctions - a.total_auctions);
    
    setSourceStats(statsArray);
  };

  // Load diagnostic data
  const loadDiagnostics = async () => {
    try {
      const [latest, recent, upcoming, coverage] = await Promise.all([
        fetch('/api/auctions/diagnostics/latest').then(r => r.json()),
        fetch('/api/auctions/diagnostics/recent-acquisitions?limit=10').then(r => r.json()),
        fetch('/api/auctions/diagnostics/upcoming?limit=15').then(r => r.json()),
        fetch('/api/auctions/diagnostics/coverage').then(r => r.json())
      ]);
      
      // If no lastScrapeTime from logs, use most recent auction's scrapedAt
      if (!latest.lastScrapeTime && recent.auctions && recent.auctions.length > 0) {
        latest.lastScrapeTime = recent.auctions[0].scrapedAt;
        latest.isEstimated = true; // Flag to show this is from most recent auction
      }
      
      setDiagnosticsData(latest);
      setRecentAuctions(recent.auctions || []);
      setUpcomingAuctions(upcoming.auctions || []);
      setCoverageMetrics(coverage);
    } catch (error) {
      console.error('Failed to load diagnostics:', error);
    }
  };

  // Format relative time
  const getRelativeTime = (timestamp: string) => {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  };

  // Get days until auction
  const getDaysUntil = (date: string) => {
    const now = new Date();
    const auctionDate = new Date(date);
    const diffMs = auctionDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / 86400000);
    return diffDays;
  };

  // Load schedule settings
  const loadScheduleSettings = async () => {
    try {
      const response = await fetch('/api/auctions/schedule');
      const data = await response.json();
      if (data.success && data.settings) {
        setScheduleSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to load schedule settings:', error);
    }
  };

  // Update schedule settings
  const updateScheduleSettings = async (updates: Partial<typeof scheduleSettings>) => {
    try {
      const newSettings = { ...scheduleSettings, ...updates };
      setScheduleSettings(newSettings);
      
      const response = await fetch('/api/auctions/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      const data = await response.json();
      if (data.success) {
        console.log('Schedule updated successfully');
        loadScheduleSettings(); // Refresh to get calculated nextRun
      }
    } catch (error) {
      console.error('Failed to update schedule:', error);
    }
  };

  useEffect(() => {
    checkAuctions();
    loadDiagnostics();
    loadScheduleSettings();
    loadSourceStats();
  }, []);

  // Recalculate source stats when auction data changes
  useEffect(() => {
    if (auctionData?.auctions && sourceStats.length === 0) {
      calculateStatsFromAuctionData();
    }
  }, [auctionData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Sticky Glassmorphism Header */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 border-b border-white/20 shadow-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
                <Activity className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  Auction Dashboard
                </h1>
                <p className="text-sm text-gray-600">System Diagnostics & Control Center</p>
              </div>
            </div>
            <Button 
              onClick={() => window.location.href = '/'}
              variant="outline"
              className="shadow-md hover:shadow-lg transition-all duration-200"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Map
            </Button>
          </div>
        </div>
      </div>

      {/* Circular Progress Tracker - Fixed Top Right */}
      {scrapeProgress.isActive && (
        <div className="fixed top-24 right-6 z-50 flex items-center gap-4 backdrop-blur-xl bg-white/90 border border-blue-200/50 rounded-2xl p-4 shadow-2xl animate-in fade-in slide-in-from-right-10">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 transform -rotate-90">
              <circle cx="40" cy="40" r="36" stroke="rgba(0, 0, 0, 0.06)" strokeWidth="8" fill="none" />
              <circle
                cx="40" cy="40" r="36"
                stroke="url(#gradient)"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 36}`}
                strokeDashoffset={`${2 * Math.PI * 36 * (1 - scrapeProgress.completedSources / scrapeProgress.totalSources)}`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-xl font-bold text-blue-600">{scrapeProgress.completedSources}</div>
                <div className="text-[10px] text-gray-500">of {scrapeProgress.totalSources}</div>
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="text-sm font-bold text-gray-900 mb-1">🔄 Scraping</div>
            <div className="text-xs text-gray-600 mb-1 truncate max-w-[180px]">
              <span className="font-semibold">{scrapeProgress.currentSource}</span>
            </div>
            <div className="text-xs font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              {Math.round((scrapeProgress.completedSources / scrapeProgress.totalSources) * 100)}% Complete
            </div>
          </div>
        </div>
      )}
      
      <div className="container mx-auto px-6 py-8 max-w-7xl">

        {/* Hero Metrics Grid - Premium Design */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Scraper Control Card */}
          <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-500 via-orange-500 to-amber-500 p-[2px] shadow-xl hover:shadow-2xl transition-all duration-300">
            <div className="relative h-full rounded-2xl bg-white p-6">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-100 to-transparent rounded-full -mr-16 -mt-16 opacity-50"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-lg">
                    <RefreshCw className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Data Collection</h3>
                    <p className="text-sm text-gray-600">24 Auction Sources</p>
                  </div>
                </div>
                <p className="text-sm text-gray-700 mb-4">
                  Last run: <span className="font-semibold">
                    {diagnosticsData?.lastScrapeTime 
                      ? getRelativeTime(diagnosticsData.lastScrapeTime) 
                      : recentAuctions.length > 0 
                        ? getRelativeTime(recentAuctions[0].scrapedAt) + ' (est.)'
                        : 'Never'}
                  </span>
                </p>
                <Button 
                  onClick={startScrape} 
                  disabled={scraping}
                  size="lg"
                  className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-bold shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200"
                >
                  {scraping ? (
                    <span className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Scraping...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-5 w-5" />
                      RUN FULL SCRAPER
                    </span>
                  )}
                </Button>
                
                {/* Automatic Scraping Schedule */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-semibold text-gray-700">Automatic Scraping</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex items-center gap-2 col-span-3 mb-1">
                      <Checkbox 
                        id="auto-scrape-enabled"
                        checked={scheduleSettings.enabled}
                        onCheckedChange={(checked) => {
                          updateScheduleSettings({ enabled: !!checked });
                        }}
                      />
                      <Label htmlFor="auto-scrape-enabled" className="text-xs cursor-pointer">
                        Enable Auto-Scrape
                      </Label>
                    </div>
                    <Select 
                      value={scheduleSettings.cadence}
                      onValueChange={(value) => {
                        updateScheduleSettings({ cadence: value });
                      }}
                      disabled={!scheduleSettings.enabled}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Frequency" />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
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
                        updateScheduleSettings({ scheduleTime: e.target.value });
                      }}
                      disabled={!scheduleSettings.enabled}
                      className="h-8 text-xs col-span-2"
                    />
                  </div>
                  {scheduleSettings.enabled && scheduleSettings.nextRun && (
                    <div className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                      <span className="font-medium">Next scrape:</span>
                      <span>{new Date(scheduleSettings.nextRun).toLocaleString()}</span>
                    </div>
                  )}
                  {scheduleSettings.enabled && scheduleSettings.lastRun && (
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <span>Last run:</span>
                      <span>{getRelativeTime(scheduleSettings.lastRun)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats Card */}
          <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 p-[2px] shadow-xl hover:shadow-2xl transition-all duration-300">
            <div className="relative h-full rounded-2xl bg-white p-6">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-100 to-transparent rounded-full -mr-16 -mt-16 opacity-50"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                    <Database className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">Database Status</h3>
                    <p className="text-sm text-gray-600">Current System Data</p>
                  </div>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : auctionData ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
                      <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        {auctionData.total || 0}
                      </div>
                      <div className="text-xs text-gray-600 font-medium">Total Auctions</div>
                    </div>
                    <div className="p-3 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200">
                      <div className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                        {auctionData.withCoordinates || 0}
                      </div>
                      <div className="text-xs text-gray-600 font-medium">With Coords</div>
                    </div>
                    <div className="p-3 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200">
                      <div className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                        {Object.keys(auctionData?.bySource || {}).length}
                      </div>
                      <div className="text-xs text-gray-600 font-medium">Active Sources</div>
                    </div>
                    <div className="p-3 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200">
                      <div className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                        {auctionData.withoutCoordinates || 0}
                      </div>
                      <div className="text-xs text-gray-600 font-medium">Need Coords</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">Click "Refresh Status" to load data</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6">

        {/* Last Scrape Activity - Compact */}
        {diagnosticsData?.lastScrapeTime && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                  <Activity className="h-4 w-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Last Scrape Activity</CardTitle>
                  <CardDescription className="text-xs">
                    {diagnosticsData.isEstimated ? 'Estimated from recent data' : 'Latest collection run'}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200">
                  <div className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    {getRelativeTime(diagnosticsData.lastScrapeTime)}
                  </div>
                  <div className="text-xs text-gray-600 font-medium">Last Run</div>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
                  <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                    {diagnosticsData.summary?.totalDiscovered || auctionData?.total || 0}
                  </div>
                  <div className="text-xs text-gray-600 font-medium">URLs Found</div>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200">
                  <div className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    {diagnosticsData.summary?.totalSaved || auctionData?.total || 0}
                  </div>
                  <div className="text-xs text-gray-600 font-medium">Saved</div>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200">
                  <div className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                    {diagnosticsData.summary?.iowaDiscovered || 
                     auctionData?.auctions?.filter((a: any) => 
                       a.state?.toLowerCase() === 'iowa' || a.state?.toLowerCase() === 'ia'
                     ).length || 0}
                  </div>
                  <div className="text-xs text-gray-600 font-medium">Iowa Found</div>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200">
                  <div className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    {diagnosticsData.summary?.iowaSaved || 
                     auctionData?.auctions?.filter((a: any) => 
                       a.state?.toLowerCase() === 'iowa' || a.state?.toLowerCase() === 'ia'
                     ).length || 0}
                  </div>
                  <div className="text-xs text-gray-600 font-medium">Iowa Saved</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent & Upcoming Auctions - Side by Side Grid */}
        {(recentAuctions.length > 0 || upcomingAuctions.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Acquisitions */}
            {recentAuctions.length > 0 && (
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
                <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Recent Acquisitions</CardTitle>
                      <CardDescription>Latest 10 additions</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    {recentAuctions.map((auction, i) => (
                      <div key={i} className="group p-3 border rounded-xl hover:shadow-md hover:border-green-300 transition-all duration-200 bg-white">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-semibold text-sm line-clamp-1">{auction.title}</div>
                          <Badge variant="outline" className="text-xs shrink-0 ml-2">{auction.sourceWebsite}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {auction.county && (
                            <div className="flex items-center gap-1 text-gray-600">
                              <MapPin className="h-3 w-3" />
                              {auction.county}, {auction.state}
                            </div>
                          )}
                          {auction.acreage && (
                            <div className="flex items-center gap-1 text-gray-600">
                              <Ruler className="h-3 w-3" />
                              {auction.acreage} acres
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {auction.latitude && auction.longitude && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7"
                              onClick={() => {
                                window.location.href = `/?lat=${auction.latitude}&lng=${auction.longitude}&zoom=15&auctionId=${auction.id}`;
                              }}
                            >
                              <Map className="h-3 w-3 mr-1" />
                              Map
                            </Button>
                          )}
                          {auction.url && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7"
                              asChild
                            >
                              <a href={auction.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Listing
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Upcoming Auctions */}
            {upcomingAuctions.length > 0 && (
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
                <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 border-b">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                      <Calendar className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Upcoming Auctions</CardTitle>
                      <CardDescription>Next 15 events</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    {upcomingAuctions.map((auction, i) => {
                      const daysUntil = getDaysUntil(auction.auctionDate);
                      const urgencyColor = daysUntil <= 2 ? 'border-red-300 bg-red-50' : daysUntil <= 7 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white';
                      
                      return (
                        <div key={i} className={`group p-3 border rounded-xl hover:shadow-md transition-all duration-200 ${urgencyColor}`}>
                          <div className="flex justify-between items-start mb-2">
                            <div className="font-semibold text-sm line-clamp-1">{auction.title}</div>
                            <Badge variant={daysUntil <= 2 ? 'destructive' : daysUntil <= 7 ? 'default' : 'outline'} className="text-xs shrink-0 ml-2">
                              {daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-1 text-gray-600">
                              <Calendar className="h-3 w-3" />
                              {new Date(auction.auctionDate).toLocaleDateString()}
                            </div>
                            {auction.county && (
                              <div className="flex items-center gap-1 text-gray-600">
                                <MapPin className="h-3 w-3" />
                                {auction.county}
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            {auction.latitude && auction.longitude && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() => {
                                  window.location.href = `/?lat=${auction.latitude}&lng=${auction.longitude}&zoom=15&auctionId=${auction.id}`;
                                }}
                              >
                                <Map className="h-3 w-3 mr-1" />
                                Map
                              </Button>
                            )}
                            {auction.url && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                asChild
                              >
                                <a href={auction.url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Listing
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Coverage Analysis - Enhanced with Source Stats */}
        {sourceStats.length > 0 && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                    <Activity className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Source Analysis</CardTitle>
                    <CardDescription>Date extraction and listing stats per source</CardDescription>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCoverageTable(!showCoverageTable)}
                  className="hover:bg-blue-100"
                >
                  {showCoverageTable ? (
                    <>
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Hide Details
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-4 w-4 mr-1" />
                      Show Details
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="mb-6 grid grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
                  <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    {sourceStats.filter((s: any) => parseInt(s.active_count) > 0).length}
                  </div>
                  <div className="text-sm text-gray-600 font-medium">Active Sources</div>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200">
                  <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    {Math.round(sourceStats.reduce((sum: number, s: any) => sum + parseFloat(s.date_percentage || 0), 0) / sourceStats.length)}%
                  </div>
                  <div className="text-sm text-gray-600 font-medium">Avg Date Extraction</div>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200">
                  <div className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                    {sourceStats.filter((s: any) => parseFloat(s.date_percentage || 0) < 50).length}
                  </div>
                  <div className="text-sm text-gray-600 font-medium">Sources &lt;50% Dates</div>
                </div>
              </div>
              
              {showCoverageTable && (
                <div className="overflow-x-auto rounded-lg border animate-in fade-in slide-in-from-top-4 duration-300">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="border-b">
                        <th className="text-left p-3 font-semibold">Source</th>
                        <th className="text-right p-3 font-semibold">Total</th>
                        <th className="text-right p-3 font-semibold">Active</th>
                        <th className="text-right p-3 font-semibold">Sold</th>
                        <th className="text-right p-3 font-semibold">With Dates</th>
                        <th className="text-right p-3 font-semibold">Date %</th>
                        <th className="text-right p-3 font-semibold">Upcoming</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sourceStats.map((stat: any, i: number) => {
                        const datePercentage = parseFloat(stat.date_percentage || 0);
                        const isExpanded = expandedSource === stat.source_website;
                        
                        return (
                          <>
                            <tr 
                              key={i} 
                              className={`border-b hover:bg-slate-50 transition-colors cursor-pointer ${datePercentage < 50 ? 'bg-yellow-50/50' : ''}`}
                              onClick={() => setExpandedSource(isExpanded ? null : stat.source_website)}
                            >
                              <td className="p-3 font-medium flex items-center gap-2">
                                {isExpanded ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                {stat.source_website}
                              </td>
                              <td className="text-right p-3">{stat.total_auctions}</td>
                              <td className="text-right p-3 text-green-600 font-medium">{stat.active_count}</td>
                              <td className="text-right p-3 text-gray-500">{stat.sold_count}</td>
                              <td className="text-right p-3 text-blue-600 font-medium">{stat.with_dates}</td>
                              <td className="text-right p-3">
                                <Badge variant={datePercentage < 50 ? 'destructive' : datePercentage < 75 ? 'default' : 'outline'} className="font-bold">
                                  {datePercentage}%
                                </Badge>
                              </td>
                              <td className="text-right p-3 text-purple-600 font-medium">{stat.upcoming_count}</td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-slate-50">
                                <td colSpan={7} className="p-4">
                                  <div className="grid grid-cols-4 gap-3 text-xs">
                                    <div 
                                      className="p-3 bg-white rounded-lg border hover:shadow-md transition-all cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleDetailExpansion(stat.source_website, 'active');
                                      }}
                                    >
                                      <div className="font-semibold text-gray-700 mb-1 flex items-center gap-1">
                                        Active Listings
                                        {expandedDetail?.source === stat.source_website && expandedDetail?.category === 'active' ? 
                                          <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                      </div>
                                      <div className="text-lg font-bold text-green-600">{stat.active_count}</div>
                                      <div className="text-gray-500 mt-1">
                                        {stat.active_with_dates} with dates ({Math.round(100 * parseInt(stat.active_with_dates) / Math.max(1, parseInt(stat.active_count)))}%)
                                      </div>
                                    </div>
                                    <div 
                                      className="p-3 bg-white rounded-lg border hover:shadow-md transition-all cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleDetailExpansion(stat.source_website, 'upcoming');
                                      }}
                                    >
                                      <div className="font-semibold text-gray-700 mb-1 flex items-center gap-1">
                                        Upcoming Events
                                        {expandedDetail?.source === stat.source_website && expandedDetail?.category === 'upcoming' ? 
                                          <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                      </div>
                                      <div className="text-lg font-bold text-purple-600">{stat.upcoming_count}</div>
                                      <div className="text-gray-500 mt-1">Future auctions</div>
                                    </div>
                                    <div 
                                      className="p-3 bg-white rounded-lg border hover:shadow-md transition-all cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleDetailExpansion(stat.source_website, 'needs_review');
                                      }}
                                    >
                                      <div className="font-semibold text-gray-700 mb-1 flex items-center gap-1">
                                        Needs Review
                                        {expandedDetail?.source === stat.source_website && expandedDetail?.category === 'needs_review' ? 
                                          <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                      </div>
                                      <div className="text-lg font-bold text-amber-600">{stat.needs_review}</div>
                                      <div className="text-gray-500 mt-1">No date found</div>
                                    </div>
                                    <div 
                                      className="p-3 bg-white rounded-lg border hover:shadow-md transition-all cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleDetailExpansion(stat.source_website, 'sold');
                                      }}
                                    >
                                      <div className="font-semibold text-gray-700 mb-1 flex items-center gap-1">
                                        Sold/Archived
                                        {expandedDetail?.source === stat.source_website && expandedDetail?.category === 'sold' ? 
                                          <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                      </div>
                                      <div className="text-lg font-bold text-gray-600">{stat.sold_count}</div>
                                      <div className="text-gray-500 mt-1">Hidden from map</div>
                                    </div>
                                  </div>
                                  
                                  {/* Expanded Listing Details */}
                                  {expandedDetail?.source === stat.source_website && (
                                    <div className="mt-4 p-3 bg-white rounded-lg border">
                                      <div className="font-semibold text-sm mb-3 flex items-center gap-2">
                                        <span className="capitalize">
                                          {expandedDetail.category === 'needs_review' ? 'Needs Review' : 
                                           expandedDetail.category === 'upcoming' ? 'Upcoming Events' :
                                           expandedDetail.category === 'active' ? 'Active Listings' : 'Sold/Archived'}
                                        </span>
                                        <Badge variant="outline">
                                          {getAuctionsBySourceCategory(stat.source_website, expandedDetail.category).length} auctions
                                        </Badge>
                                      </div>
                                      <div className="space-y-2 max-h-64 overflow-y-auto">
                                        {getAuctionsBySourceCategory(stat.source_website, expandedDetail.category).map((auction: any, idx: number) => (
                                          <div key={idx} className="p-2 border rounded-lg hover:bg-slate-50 transition-colors text-xs">
                                            <div className="font-semibold mb-1">{auction.title}</div>
                                            <div className="grid grid-cols-2 gap-2 text-gray-600">
                                              {auction.county && (
                                                <div className="flex items-center gap-1">
                                                  <MapPin className="h-3 w-3" />
                                                  {auction.county}, {auction.state}
                                                </div>
                                              )}
                                              {auction.acreage && (
                                                <div className="flex items-center gap-1">
                                                  <Ruler className="h-3 w-3" />
                                                  {auction.acreage} acres
                                                </div>
                                              )}
                                              {auction.auctionDate && (
                                                <div className="flex items-center gap-1">
                                                  <Calendar className="h-3 w-3" />
                                                  {new Date(auction.auctionDate).toLocaleDateString()}
                                                </div>
                                              )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-1 mt-2">
                                              {auction.latitude && auction.longitude && (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="text-xs h-6"
                                                  onClick={() => {
                                                    window.location.href = `/?lat=${auction.latitude}&lng=${auction.longitude}&zoom=15&auctionId=${auction.id}`;
                                                  }}
                                                >
                                                  <Map className="h-3 w-3 mr-1" />
                                                  Map
                                                </Button>
                                              )}
                                              {auction.url && (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="text-xs h-6"
                                                  asChild
                                                >
                                                  <a href={auction.url} target="_blank" rel="noopener noreferrer">
                                                    <ExternalLink className="h-3 w-3 mr-1" />
                                                    Listing
                                                  </a>
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {stat.last_scraped && (
                                    <div className="mt-3 text-xs text-gray-500">
                                      Last scraped: {getRelativeTime(stat.last_scraped)}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Auctions by Source */}
        {auctionData?.auctions && auctionData.auctions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Auctions by Source</CardTitle>
              <CardDescription>
                {auctionData.auctions.length} total auctions from {Object.keys(auctionsBySource).length} sources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="all" className="w-full">
                <TabsList className="flex flex-wrap h-auto">
                  <TabsTrigger value="all">
                    All ({auctionData.auctions.length})
                  </TabsTrigger>
                  {Object.entries(auctionsBySource).map(([source, auctions]) => (
                    <TabsTrigger key={source} value={source} className="text-xs">
                      {source} ({(auctions as any[]).length})
                    </TabsTrigger>
                  ))}
                </TabsList>

                {/* All Auctions Tab */}
                <TabsContent value="all" className="space-y-3">
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {auctionData.auctions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((auction: any, i: number) => (
                      <div key={i} className="p-4 border rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-semibold text-base">{auction.title}</div>
                          <Badge variant="outline">{auction.sourceWebsite}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {auction.county && (
                            <div className="flex items-center gap-1 text-gray-600">
                              <MapPin className="h-3 w-3" />
                              {auction.county}, {auction.state}
                            </div>
                          )}
                          {auction.acreage && (
                            <div className="flex items-center gap-1 text-gray-600">
                              <Ruler className="h-3 w-3" />
                              {auction.acreage} acres
                            </div>
                          )}
                          {auction.auctionDate && (
                            <div className="flex items-center gap-1 text-gray-600">
                              <Calendar className="h-3 w-3" />
                              {new Date(auction.auctionDate).toLocaleDateString()}
                            </div>
                          )}
                          {auction.url && (
                            <div className="flex items-center gap-1">
                              <a 
                                href={auction.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                              >
                                <ExternalLink className="h-3 w-3" />
                                View Listing
                              </a>
                            </div>
                          )}
                        </div>
                        <div className="text-xs mt-2">
                          {auction.latitude && auction.longitude ? (
                            <span className="text-green-600">
                              ✅ Coords: [{auction.latitude.toFixed(4)}, {auction.longitude.toFixed(4)}]
                            </span>
                          ) : (
                            <span className="text-red-600">❌ No coordinates</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Pagination for All Tab */}
                  {auctionData.auctions.length > itemsPerPage && (
                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="text-sm text-gray-600">
                        Showing {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, auctionData.auctions.length)} of {auctionData.auctions.length} auctions
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.ceil(auctionData.auctions.length / itemsPerPage) }, (_, i) => i + 1)
                            .filter(page => {
                              // Show first, last, current, and adjacent pages
                              return page === 1 || 
                                     page === Math.ceil(auctionData.auctions.length / itemsPerPage) ||
                                     Math.abs(page - currentPage) <= 1;
                            })
                            .map((page, idx, arr) => (
                              <div key={page} className="flex items-center">
                                {idx > 0 && arr[idx - 1] !== page - 1 && (
                                  <span className="px-2 text-gray-400">...</span>
                                )}
                                <Button
                                  variant={currentPage === page ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => setCurrentPage(page)}
                                  className="min-w-[40px]"
                                >
                                  {page}
                                </Button>
                              </div>
                            ))}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(p => Math.min(Math.ceil(auctionData.auctions.length / itemsPerPage), p + 1))}
                          disabled={currentPage >= Math.ceil(auctionData.auctions.length / itemsPerPage)}
                        >
                          Next
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Individual Source Tabs */}
                {Object.entries(auctionsBySource).map(([source, sourceAuctions]) => {
                  const sourcePage = sourcePages[source] || 1;
                  const startIdx = (sourcePage - 1) * itemsPerPage;
                  const endIdx = sourcePage * itemsPerPage;
                  const paginatedAuctions = (sourceAuctions as any[]).slice(startIdx, endIdx);
                  const totalPages = Math.ceil((sourceAuctions as any[]).length / itemsPerPage);
                  
                  return (
                  <TabsContent key={source} value={source} className="space-y-3">
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                      <div className="text-sm font-semibold text-blue-900">
                        {source}
                      </div>
                      <div className="text-xs text-blue-700">
                        {(sourceAuctions as any[]).length} auction{(sourceAuctions as any[]).length !== 1 ? 's' : ''} found
                      </div>
                    </div>
                    
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {paginatedAuctions.map((auction: any, i: number) => (
                        <div key={i} className="p-4 border rounded-lg hover:bg-slate-50 transition-colors">
                          <div className="font-semibold text-base mb-2">{auction.title}</div>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            {auction.county && (
                              <div className="flex items-center gap-1 text-gray-600">
                                <MapPin className="h-3 w-3" />
                                {auction.county}, {auction.state}
                              </div>
                            )}
                            {auction.acreage && (
                              <div className="flex items-center gap-1 text-gray-600">
                                <Ruler className="h-3 w-3" />
                                {auction.acreage} acres
                              </div>
                            )}
                            {auction.auctionDate && (
                              <div className="flex items-center gap-1 text-gray-600">
                                <Calendar className="h-3 w-3" />
                                {new Date(auction.auctionDate).toLocaleDateString()}
                              </div>
                            )}
                            {auction.url && (
                              <div className="flex items-center gap-1">
                                <a 
                                  href={auction.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  View Listing
                                </a>
                              </div>
                            )}
                          </div>
                          {auction.description && (
                            <div className="text-xs text-gray-600 mt-2 line-clamp-2">
                              {auction.description}
                            </div>
                          )}
                          <div className="text-xs mt-2">
                            {auction.latitude && auction.longitude ? (
                              <span className="text-green-600">
                                ✅ Coords: [{auction.latitude.toFixed(4)}, {auction.longitude.toFixed(4)}]
                              </span>
                            ) : (
                              <span className="text-red-600">❌ No coordinates</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Pagination for Source Tab */}
                    {(sourceAuctions as any[]).length > itemsPerPage && (
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="text-sm text-gray-600">
                          Showing {startIdx + 1}-{Math.min(endIdx, (sourceAuctions as any[]).length)} of {(sourceAuctions as any[]).length}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSourcePages({...sourcePages, [source]: Math.max(1, sourcePage - 1)})}
                            disabled={sourcePage === 1}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                          </Button>
                          <span className="flex items-center px-3 text-sm">
                            Page {sourcePage} of {totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSourcePages({...sourcePages, [source]: Math.min(totalPages, sourcePage + 1)})}
                            disabled={sourcePage >= totalPages}
                          >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                );
                })}
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Excluded Auctions (Non-Land) */}
        {excludedAuctions.length > 0 && (
          <Card className="border-gray-200 bg-gray-50">
            <CardHeader>
              <CardTitle className="text-gray-900">Excluded Listings ({excludedAuctions.length})</CardTitle>
              <CardDescription>
                AI identified these as non-land auctions (blog posts, equipment, etc.) - not shown on map
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {excludedAuctions.slice(0, 10).map((auction: any, i: number) => (
                  <div key={i} className="p-3 border border-gray-300 rounded-lg bg-white">
                    <div className="flex justify-between items-start mb-1">
                      <div className="font-medium text-sm">{auction.title}</div>
                      <Badge variant="secondary" className="text-xs">Excluded</Badge>
                    </div>
                    <div className="text-xs text-gray-600">
                      {auction.sourceWebsite}
                    </div>
                  </div>
                ))}
                {excludedAuctions.length > 10 && (
                  <div className="text-xs text-gray-500 text-center pt-2">
                    ... and {excludedAuctions.length - 10} more
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Auctions Without Coordinates */}
        {auctionsWithoutCoords.length > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="text-yellow-900">Auctions Without Coordinates ({auctionsWithoutCoords.length})</CardTitle>
              <CardDescription>
                Actual land auctions that couldn't be geocoded (out-of-state or missing data)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {auctionsWithoutCoords.map((auction: any, i: number) => (
                  <div key={i} className="p-4 border border-yellow-300 rounded-lg bg-white">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-semibold text-base">{auction.title}</div>
                      <Badge variant="outline">{auction.sourceWebsite}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {auction.address && (
                        <div className="flex items-center gap-1 text-gray-600">
                          <MapPin className="h-3 w-3" />
                          {auction.address}
                        </div>
                      )}
                      {auction.county && (
                        <div className="text-gray-600">
                          {auction.county}, {auction.state}
                        </div>
                      )}
                      {auction.acreage && (
                        <div className="flex items-center gap-1 text-gray-600">
                          <Ruler className="h-3 w-3" />
                          {auction.acreage} acres
                        </div>
                      )}
                      {auction.auctionDate && (
                        <div className="flex items-center gap-1 text-gray-600">
                          <Calendar className="h-3 w-3" />
                          {new Date(auction.auctionDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    {auction.url && (
                      <div className="mt-2">
                        <a 
                          href={auction.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Original Listing
                        </a>
                      </div>
                    )}
                    <div className="mt-2 text-xs text-yellow-700">
                      ⚠️ Geocoding failed - Add coordinates manually or update address
                    </div>
                  </div>
                ))}
              </div>
              <Alert className="mt-4">
                <AlertDescription className="text-xs">
                  💡 Click "Investigate Coordinates" above to see which can be fixed with county-level coordinates
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        {/* Investigation Results */}
        {investigationResults && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
            <CardHeader className="bg-gradient-to-r from-cyan-50 to-blue-50 border-b">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">Coordinate Investigation</CardTitle>
                  <CardDescription>Location data analysis</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
                    <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                      {investigationResults.total}
                    </div>
                    <div className="text-xs text-gray-600 font-medium">Total Auctions</div>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200">
                    <div className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                      {investigationResults.withCoordinates}
                    </div>
                    <div className="text-xs text-gray-600 font-medium">With Coords</div>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200">
                    <div className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                      {investigationResults.canBeFixed}
                    </div>
                    <div className="text-xs text-gray-600 font-medium">Can Be Fixed</div>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200">
                    <div className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                      {investigationResults.potentialTotal}
                    </div>
                    <div className="text-xs text-gray-600 font-medium">Potential Total</div>
                  </div>
                </div>

                {investigationResults.canBeFixed > 0 && (
                  <>
                    <Alert className="border-green-200 bg-green-50">
                      <AlertDescription className="text-sm">
                        🎯 <strong>{investigationResults.canBeFixed} auctions</strong> can be fixed! 
                        Coverage: <strong>{investigationResults.withCoordinates}</strong> → <strong>{investigationResults.potentialTotal}</strong>
                      </AlertDescription>
                    </Alert>
                    <Button 
                      onClick={updateCoordinates} 
                      disabled={updating}
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg"
                    >
                      {updating ? (
                        <span className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Updating...
                        </span>
                      ) : (
                        `Fix ${investigationResults.canBeFixed} Auctions with County Coordinates`
                      )}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions - Compact Grid */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
          <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 border-b">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600 to-gray-600 flex items-center justify-center">
                <Activity className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
                <CardDescription>Manage auction data and settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Button 
                onClick={checkAuctions} 
                disabled={loading}
                variant="outline"
                className="h-auto py-3 flex-col gap-2 hover:shadow-md transition-all"
              >
                <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                <span className="text-xs">{loading ? 'Loading...' : 'Refresh Status'}</span>
              </Button>
              <Button 
                onClick={investigateCoords} 
                disabled={investigating}
                variant="outline"
                className="h-auto py-3 flex-col gap-2 hover:shadow-md transition-all"
              >
                <MapPin className={`h-5 w-5 ${investigating ? 'animate-pulse' : ''}`} />
                <span className="text-xs">{investigating ? 'Checking...' : 'Investigate Coords'}</span>
              </Button>
              <Button 
                onClick={() => setShowAddSource(!showAddSource)}
                variant="outline"
                className="h-auto py-3 flex-col gap-2 hover:shadow-md transition-all"
              >
                <Plus className="h-5 w-5" />
                <span className="text-xs">Add Source</span>
              </Button>
              <Button 
                onClick={validateCounties}
                disabled={validating}
                variant="outline"
                className="h-auto py-3 flex-col gap-2 hover:shadow-md transition-all"
              >
                <CheckCircle className={`h-5 w-5 ${validating ? 'animate-pulse' : ''}`} />
                <span className="text-xs">{validating ? 'Validating...' : 'Validate Counties'}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* County Validation Results */}
        {validationResults && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg">County Validation Results</CardTitle>
                  <CardDescription>Coordinate-county consistency check</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="p-4 rounded-xl bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200">
                  <div className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    {validationResults.validated}
                  </div>
                  <div className="text-xs text-gray-600 font-medium">Checked</div>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
                  <div className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    {validationResults.fixed}
                  </div>
                  <div className="text-xs text-gray-600 font-medium">Fixed</div>
                </div>
                <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200">
                  <div className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                    {validationResults.mismatches}
                  </div>
                  <div className="text-xs text-gray-600 font-medium">Mismatches</div>
                </div>
              </div>
              
              {validationResults.details && validationResults.details.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                  <div className="text-sm font-semibold mb-2 text-gray-700">Fixed Auctions:</div>
                  {validationResults.details.map((item: any, i: number) => (
                    <div key={i} className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg text-xs">
                      <div className="font-medium mb-1">{item.title.substring(0, 60)}...</div>
                      <div className="text-gray-600 flex items-center gap-1">
                        <span className="text-red-600">❌ {item.storedCounty}</span>
                        <span>→</span>
                        <span className="text-green-600">✅ {item.geocodedCounty}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Add New Auction Source */}
        {showAddSource && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                    <Plus className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Add Auction Source</CardTitle>
                    <CardDescription>Configure new scraping source</CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowAddSource(false)}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="source-name" className="text-sm font-medium">Source Name</Label>
                  <Input
                    id="source-name"
                    placeholder="Spencer Auction Group"
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    className="border-gray-300"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source-url" className="text-sm font-medium">Website URL</Label>
                  <Input
                    id="source-url"
                    placeholder="https://example.com"
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    className="border-gray-300"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source-path" className="text-sm font-medium">Path (optional)</Label>
                  <Input
                    id="source-path"
                    placeholder="/auctions/"
                    value={newSourcePath}
                    onChange={(e) => setNewSourcePath(e.target.value)}
                    className="border-gray-300"
                  />
                </div>
              </div>
              <Alert className="border-blue-200 bg-blue-50">
                <AlertDescription className="text-xs">
                  <strong>Info:</strong> Sources are configured in backend code. Use this to generate the config.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    alert(`Source config:\n\nName: ${newSourceName}\nURL: ${newSourceUrl}\nPath: ${newSourcePath || 'None'}\n\nAdd to server/services/auctionScraper.ts`);
                  }}
                  disabled={!newSourceName || !newSourceUrl}
                  className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                >
                  Generate Config
                </Button>
                <Button onClick={() => setShowAddSource(false)} variant="outline">Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Current Auction Sources - Compact */}
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 border-b">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Database className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">Configured Sources (24)</CardTitle>
                <CardDescription>Active auction scraping sources</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {[
                'Farmers National', 'Midwest Ag Services', 'Iowa Land Company', 
                'Peoples Company', 'High Point Land', 'Zomer Company',
                'Land Search', 'DreamDirt', 'LandWatch',
                'Steffes', 'Steffes Group', 'McCall Auctions', 'Midwest Land Management',
                'Randy Pryor Real Estate', 'Jim Schaben Real Estate', 'Denison Livestock',
                'Spencer Auction Group', 'Sieren Auction Sales', 'Green Real Estate & Auction',
                'Iowa Land Sales', 'Sullivan Auctioneers', 'BigIron',
                'Central States Real Estate', 'The Acre Co'
              ].map((source, idx) => {
                const isNew = ['Spencer Auction Group', 'Steffes Group', 'Sieren Auction Sales', 
                  'Green Real Estate & Auction', 'Iowa Land Sales', 'Sullivan Auctioneers',
                  'BigIron', 'Central States Real Estate', 'The Acre Co'].includes(source);
                return (
                  <div key={idx} className={`p-2 rounded-lg border ${isNew ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-200'} hover:shadow-sm transition-all`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${isNew ? 'bg-purple-500' : 'bg-green-500'}`}></div>
                      <span className="text-xs font-medium truncate">{source}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <Alert className="mt-4 border-purple-200 bg-purple-50">
              <AlertDescription className="text-xs">
                <span className="font-semibold">💡 Tip:</span> Click "RUN FULL SCRAPER" above to fetch from all 24 sources (9 recently added)
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

      </div>

      {/* Footer Spacer */}
      <div className="h-8"></div>
    </div>
    </div>
  );
}

