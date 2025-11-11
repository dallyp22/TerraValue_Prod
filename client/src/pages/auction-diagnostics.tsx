import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar, MapPin, Ruler, ExternalLink, Plus, ChevronLeft, ChevronRight } from 'lucide-react';

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

  useEffect(() => {
    checkAuctions();
    loadDiagnostics();
  }, []);

  return (
    <div className="container mx-auto p-6 max-w-6xl relative">
      {/* Circular Progress Tracker - Fixed Top Right */}
      {scrapeProgress.isActive && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-4 bg-white border-2 border-blue-500 rounded-lg p-4 shadow-2xl animate-in fade-in slide-in-from-right-10">
          <div className="relative w-28 h-28">
            {/* Circular Progress */}
            <svg className="w-28 h-28 transform -rotate-90">
              <circle
                cx="56"
                cy="56"
                r="48"
                stroke="rgba(0, 0, 0, 0.06)"
                strokeWidth="10"
                fill="none"
              />
              <circle
                cx="56"
                cy="56"
                r="48"
                stroke="url(#gradient)"
                strokeWidth="10"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 48}`}
                strokeDashoffset={`${2 * Math.PI * 48 * (1 - scrapeProgress.completedSources / scrapeProgress.totalSources)}`}
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
                <div className="text-2xl font-bold text-blue-600">
                  {scrapeProgress.completedSources}
                </div>
                <div className="text-xs text-gray-500">of {scrapeProgress.totalSources}</div>
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm font-bold text-gray-900 mb-1">🔄 Scraping Sources</div>
            <div className="text-xs text-gray-600 mb-1 truncate max-w-[200px]">
              Current: <span className="font-semibold">{scrapeProgress.currentSource}</span>
            </div>
            <div className="text-xs font-semibold text-blue-600">
              {Math.round((scrapeProgress.completedSources / scrapeProgress.totalSources) * 100)}% Complete
            </div>
          </div>
        </div>
      )}
      
      <h1 className="text-3xl font-bold mb-6">Auction System Diagnostics</h1>

      {/* Prominent Scraper Button */}
      <Card className="mb-6 border-2 border-red-500 bg-gradient-to-br from-red-50 to-orange-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-red-900 mb-2">Auction Data Collection</h2>
              <p className="text-sm text-gray-700 mb-1">
                Scrape all 24 auction sources to discover new listings and update existing ones.
              </p>
              <p className="text-xs text-gray-600">
                Last run: {diagnosticsData?.lastScrapeTime 
                  ? getRelativeTime(diagnosticsData.lastScrapeTime) 
                  : recentAuctions.length > 0 
                    ? getRelativeTime(recentAuctions[0].scrapedAt) + ' (estimated)'
                    : 'Never'}
              </p>
            </div>
            <Button 
              onClick={startScrape} 
              disabled={scraping}
              size="lg"
              className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-bold text-lg px-8 py-6 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              {scraping ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Scraping...
                </span>
              ) : (
                '🚀 RUN FULL SCRAPER'
              )}
            </Button>
          </div>
          {scrapeProgress.isActive && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-gray-700 mb-2">
                Processing: <span className="font-semibold">{scrapeProgress.currentSource}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-blue-600 to-purple-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${(scrapeProgress.completedSources / scrapeProgress.totalSources) * 100}%` }}
                ></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="grid gap-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle>Database Status</CardTitle>
            <CardDescription>Current auction data in the system</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Loading...</p>
            ) : auctionData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50 rounded">
                    <div className="text-2xl font-bold text-blue-600">
                      {auctionData.auctions?.length || 0}
                    </div>
                    <div className="text-sm text-gray-600">Auctions Found</div>
                  </div>
                  <div className="p-4 bg-green-50 rounded">
                    <div className="text-2xl font-bold text-green-600">
                      {auctionData.total || 0}
                    </div>
                    <div className="text-sm text-gray-600">Total in DB</div>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded">
                    <div className="text-2xl font-bold text-yellow-600">
                      {auctionData.withoutCoordinates || 0}
                    </div>
                    <div className="text-sm text-gray-600">Without Coords</div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded">
                    <div className="text-2xl font-bold text-purple-600">
                      {auctionData.withCoordinates || 0}
                    </div>
                    <div className="text-sm text-gray-600">With Coords</div>
                  </div>
                </div>

                {auctionData.withoutCoordinates > 0 && (
                  <Alert>
                    <AlertDescription>
                      ⚠️ {auctionData.withoutCoordinates} auctions don't have coordinates and won't show on the map.
                      This usually means geocoding failed for those addresses.
                    </AlertDescription>
                  </Alert>
                )}

                {auctionData.total === 0 && (
                  <Alert>
                    <AlertDescription>
                      ❌ No auctions in database. Click "Run Full Scraper" below to populate the database.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <p>Click "Refresh Status" to check</p>
            )}
          </CardContent>
        </Card>

        {/* Overview Section - Last Scrape Info */}
        {diagnosticsData?.lastScrapeTime ? (
          <Card>
            <CardHeader>
              <CardTitle>Last Scrape Activity</CardTitle>
              <CardDescription>
                {diagnosticsData.isEstimated 
                  ? 'Based on most recent auction added (full monitoring starts on next scrape)'
                  : 'Most recent data collection run'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="p-4 bg-indigo-50 rounded">
                  <div className="text-xl font-bold text-indigo-600">
                    {getRelativeTime(diagnosticsData.lastScrapeTime)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {diagnosticsData.isEstimated ? 'Last Addition' : 'Last Scrape'}
                  </div>
                </div>
                <div className="p-4 bg-blue-50 rounded">
                  <div className="text-2xl font-bold text-blue-600">
                    {diagnosticsData.summary?.totalDiscovered || auctionData?.total || 0}
                  </div>
                  <div className="text-sm text-gray-600">
                    {diagnosticsData.isEstimated ? 'Total Auctions' : 'URLs Found'}
                  </div>
                </div>
                <div className="p-4 bg-green-50 rounded">
                  <div className="text-2xl font-bold text-green-600">
                    {diagnosticsData.summary?.totalSaved || auctionData?.total || 0}
                  </div>
                  <div className="text-sm text-gray-600">
                    {diagnosticsData.isEstimated ? 'In Database' : 'Auctions Saved'}
                  </div>
                </div>
                <div className="p-4 bg-yellow-50 rounded">
                  <div className="text-2xl font-bold text-yellow-600">
                    {diagnosticsData.summary?.iowaDiscovered || 
                     auctionData?.auctions?.filter((a: any) => 
                       a.state?.toLowerCase() === 'iowa' || a.state?.toLowerCase() === 'ia'
                     ).length || 0}
                  </div>
                  <div className="text-sm text-gray-600">
                    {diagnosticsData.isEstimated ? 'Iowa Auctions' : 'Iowa Found'}
                  </div>
                </div>
                <div className="p-4 bg-purple-50 rounded">
                  <div className="text-2xl font-bold text-purple-600">
                    {diagnosticsData.summary?.iowaSaved || 
                     auctionData?.auctions?.filter((a: any) => 
                       a.state?.toLowerCase() === 'iowa' || a.state?.toLowerCase() === 'ia'
                     ).length || 0}
                  </div>
                  <div className="text-sm text-gray-600">
                    {diagnosticsData.isEstimated ? 'Iowa in DB' : 'Iowa Saved'}
                  </div>
                </div>
              </div>
              {diagnosticsData.isEstimated && (
                <Alert className="mt-4">
                  <AlertDescription className="text-xs">
                    💡 Run "Run Full Scraper" to start collecting detailed coverage metrics with the new monitoring system.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        ) : recentAuctions.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Last Activity</CardTitle>
              <CardDescription>Based on most recent auction in database</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-indigo-50 rounded">
                  <div className="text-xl font-bold text-indigo-600">
                    {getRelativeTime(recentAuctions[0].scrapedAt)}
                  </div>
                  <div className="text-sm text-gray-600">Last Addition</div>
                </div>
                <div className="p-4 bg-blue-50 rounded">
                  <div className="text-2xl font-bold text-blue-600">
                    {auctionData?.total || 0}
                  </div>
                  <div className="text-sm text-gray-600">Total Auctions</div>
                </div>
                <div className="p-4 bg-green-50 rounded">
                  <div className="text-2xl font-bold text-green-600">
                    {auctionData?.auctions?.filter((a: any) => 
                      a.state?.toLowerCase() === 'iowa' || a.state?.toLowerCase() === 'ia'
                    ).length || 0}
                  </div>
                  <div className="text-sm text-gray-600">Iowa Auctions</div>
                </div>
                <div className="p-4 bg-purple-50 rounded">
                  <div className="text-2xl font-bold text-purple-600">
                    {Object.keys(auctionData?.bySource || {}).length}
                  </div>
                  <div className="text-sm text-gray-600">Active Sources</div>
                </div>
              </div>
              <Alert className="mt-4">
                <AlertDescription className="text-xs">
                  💡 Run "Run Full Scraper" to start collecting detailed coverage metrics with the new monitoring system.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        ) : null}

        {/* Recent Acquisitions */}
        {recentAuctions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Acquisitions</CardTitle>
              <CardDescription>10 most recently added auctions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {recentAuctions.map((auction, i) => (
                  <div key={i} className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-semibold text-sm">{auction.title}</div>
                      <Badge variant="outline" className="text-xs">{auction.sourceWebsite}</Badge>
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
                      {auction.scrapedAt && (
                        <div className="flex items-center gap-1 text-gray-600">
                          <Calendar className="h-3 w-3" />
                          Added {getRelativeTime(auction.scrapedAt)}
                        </div>
                      )}
                      {auction.auctionDate && (
                        <div className="flex items-center gap-1 text-gray-600">
                          Auction: {new Date(auction.auctionDate).toLocaleDateString()}
                        </div>
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
          <Card>
            <CardHeader>
              <CardTitle>Upcoming Auctions</CardTitle>
              <CardDescription>15 soonest auction dates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {upcomingAuctions.map((auction, i) => {
                  const daysUntil = getDaysUntil(auction.auctionDate);
                  const urgencyColor = daysUntil <= 2 ? 'bg-red-50 border-red-200' : daysUntil <= 7 ? 'bg-yellow-50 border-yellow-200' : 'border-gray-200';
                  
                  return (
                    <div key={i} className={`p-3 border rounded-lg ${urgencyColor} transition-colors`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-semibold text-sm">{auction.title}</div>
                        <Badge variant={daysUntil <= 2 ? 'destructive' : daysUntil <= 7 ? 'default' : 'outline'} className="text-xs">
                          {daysUntil === 0 ? 'Today!' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil} days`}
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
                            {auction.county}, {auction.state}
                          </div>
                        )}
                        {auction.acreage && (
                          <div className="flex items-center gap-1 text-gray-600">
                            <Ruler className="h-3 w-3" />
                            {auction.acreage} acres
                          </div>
                        )}
                        <div className="text-gray-600">
                          {auction.sourceWebsite}
                        </div>
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
                            View Listing
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Coverage Analysis Tab */}
        {coverageMetrics && (
          <Card>
            <CardHeader>
              <CardTitle>Coverage Analysis</CardTitle>
              <CardDescription>Source-level scraping performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-3 gap-4">
                <div className="p-3 bg-blue-50 rounded">
                  <div className="text-2xl font-bold text-blue-600">
                    {coverageMetrics.summary?.averageCoverage || 0}%
                  </div>
                  <div className="text-sm text-gray-600">Avg Coverage</div>
                </div>
                <div className="p-3 bg-yellow-50 rounded">
                  <div className="text-2xl font-bold text-yellow-600">
                    {coverageMetrics.summary?.lowCoverageCount || 0}
                  </div>
                  <div className="text-sm text-gray-600">Sources &lt;80%</div>
                </div>
                <div className="p-3 bg-green-50 rounded">
                  <div className="text-2xl font-bold text-green-600">
                    {coverageMetrics.summary?.iowaAverageCoverage || 0}%
                  </div>
                  <div className="text-sm text-gray-600">Iowa Avg</div>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Source</th>
                      <th className="text-right p-2">Discovered</th>
                      <th className="text-right p-2">Saved</th>
                      <th className="text-right p-2">Coverage</th>
                      <th className="text-right p-2">Iowa</th>
                      <th className="text-right p-2">Missing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverageMetrics.metrics?.map((metric: any, i: number) => (
                      <tr key={i} className={`border-b ${metric.coverage_percentage < 80 ? 'bg-red-50' : ''}`}>
                        <td className="p-2 font-medium">{metric.source}</td>
                        <td className="text-right p-2">{metric.discovered}</td>
                        <td className="text-right p-2">{metric.saved}</td>
                        <td className="text-right p-2">
                          <Badge variant={metric.coverage_percentage < 80 ? 'destructive' : 'default'}>
                            {metric.coverage_percentage}%
                          </Badge>
                        </td>
                        <td className="text-right p-2 text-gray-600">
                          {metric.iowa_saved}/{metric.iowa_discovered}
                        </td>
                        <td className="text-right p-2 text-gray-600">
                          {metric.missing_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
          <Card>
            <CardHeader>
              <CardTitle>Coordinate Investigation Results</CardTitle>
              <CardDescription>Analysis of auction locations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50 rounded">
                    <div className="text-2xl font-bold text-blue-600">
                      {investigationResults.total}
                    </div>
                    <div className="text-sm text-gray-600">Total Auctions</div>
                  </div>
                  <div className="p-4 bg-green-50 rounded">
                    <div className="text-2xl font-bold text-green-600">
                      {investigationResults.withCoordinates}
                    </div>
                    <div className="text-sm text-gray-600">With Coords</div>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded">
                    <div className="text-2xl font-bold text-yellow-600">
                      {investigationResults.canBeFixed}
                    </div>
                    <div className="text-sm text-gray-600">Can Be Fixed</div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded">
                    <div className="text-2xl font-bold text-purple-600">
                      {investigationResults.potentialTotal}
                    </div>
                    <div className="text-sm text-gray-600">Potential Total</div>
                  </div>
                </div>

                {investigationResults.canBeFixed > 0 && (
                  <Alert>
                    <AlertDescription>
                      🎯 <strong>{investigationResults.canBeFixed} auctions</strong> can be fixed by applying county-level coordinates!
                      This will increase map coverage from <strong>{investigationResults.withCoordinates}</strong> to <strong>{investigationResults.potentialTotal}</strong> auctions.
                    </AlertDescription>
                  </Alert>
                )}

                {investigationResults.canBeFixed > 0 && (
                  <Button 
                    onClick={updateCoordinates} 
                    disabled={updating}
                    className="w-full"
                  >
                    {updating ? 'Updating...' : `Fix ${investigationResults.canBeFixed} Auctions with County Coordinates`}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Actions</CardTitle>
            <CardDescription>Manage auction data and settings</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4 flex-wrap">
            <Button onClick={checkAuctions} disabled={loading}>
              {loading ? 'Loading...' : 'Refresh Status'}
            </Button>
            <Button 
              onClick={investigateCoords} 
              disabled={investigating}
              variant="outline"
            >
              {investigating ? 'Investigating...' : 'Investigate Coordinates'}
            </Button>
            <Button 
              onClick={() => setShowAddSource(!showAddSource)}
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Auction Source
            </Button>
            <Button 
              onClick={validateCounties}
              disabled={validating}
              variant="outline"
            >
              {validating ? 'Validating...' : 'Validate Counties'}
            </Button>
          </CardContent>
        </Card>

        {/* County Validation Results */}
        {validationResults && (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <CardTitle className="text-green-900">County Validation Results</CardTitle>
              <CardDescription>Checked coordinates against stored county names</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="p-3 bg-white rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{validationResults.validated}</div>
                  <div className="text-xs text-gray-600">Auctions Checked</div>
                </div>
                <div className="p-3 bg-white rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{validationResults.fixed}</div>
                  <div className="text-xs text-gray-600">Counties Fixed</div>
                </div>
                <div className="p-3 bg-white rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{validationResults.mismatches}</div>
                  <div className="text-xs text-gray-600">Mismatches Found</div>
                </div>
              </div>
              
              {validationResults.details && validationResults.details.length > 0 && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  <div className="text-sm font-semibold mb-2">Fixed Auctions:</div>
                  {validationResults.details.map((item: any, i: number) => (
                    <div key={i} className="p-2 bg-white rounded text-xs">
                      <div className="font-medium">{item.title.substring(0, 60)}...</div>
                      <div className="text-gray-600">
                        ❌ Was: {item.storedCounty} → ✅ Fixed to: {item.geocodedCounty}
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
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-blue-900">Add New Auction Source</CardTitle>
              <CardDescription>Add a new website to scrape for Iowa farmland auctions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="source-name">Source Name</Label>
                  <Input
                    id="source-name"
                    placeholder="e.g., Spencer Auction Group"
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source-url">Website URL</Label>
                  <Input
                    id="source-url"
                    placeholder="e.g., https://spencerauctiongroup.com"
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source-path">Auction Page Path (optional)</Label>
                  <Input
                    id="source-path"
                    placeholder="e.g., /auctions/"
                    value={newSourcePath}
                    onChange={(e) => setNewSourcePath(e.target.value)}
                  />
                </div>
              </div>
              <Alert>
                <AlertDescription className="text-xs">
                  <strong>Note:</strong> New sources are added to the backend code. This is currently for reference.
                  Spencer Auction Group is already configured and will appear once scraped.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    alert(`Source info:\n\nName: ${newSourceName}\nURL: ${newSourceUrl}\nPath: ${newSourcePath || 'None'}\n\nAdd this to server/services/auctionScraper.ts in the sources array.`);
                  }}
                  disabled={!newSourceName || !newSourceUrl}
                >
                  Generate Config Code
                </Button>
                <Button 
                  onClick={() => setShowAddSource(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Current Auction Sources */}
        <Card>
          <CardHeader>
            <CardTitle>Configured Auction Sources (24)</CardTitle>
            <CardDescription>Websites currently being scraped for auctions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                'Farmers National', 'Midwest Ag Services', 'Iowa Land Company', 
                'Peoples Company', 'High Point Land', 'Zomer Company',
                'Land Search', 'DreamDirt', 'LandWatch',
                'Steffes', 'Steffes Group', 'McCall Auctions', 'Midwest Land Management',
                'Randy Pryor Real Estate', 'Jim Schaben Real Estate', 'Denison Livestock',
                'Spencer Auction Group', 'Sieren Auction Sales', 'Green Real Estate & Auction',
                'Iowa Land Sales', 'Sullivan Auctioneers', 'BigIron',
                'Central States Real Estate', 'The Acre Co'
              ].map((source, idx) => (
                <div key={idx} className="p-3 border rounded-lg bg-slate-50">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium">{source}</span>
                  </div>
                  {['Spencer Auction Group', 'Steffes Group', 'Sieren Auction Sales', 
                    'Green Real Estate & Auction', 'Iowa Land Sales', 'Sullivan Auctioneers',
                    'BigIron', 'Central States Real Estate', 'The Acre Co'].includes(source) && (
                    <Badge variant="secondary" className="mt-2 text-xs">Recently Added</Badge>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm text-gray-600">
              💡 Click "Run Full Scraper" to fetch auctions from all 24 sources (9 recently added)
            </div>
          </CardContent>
        </Card>

        {/* Map Bounds Info */}
        <Card>
          <CardHeader>
            <CardTitle>Search Bounds</CardTitle>
            <CardDescription>Currently checking Iowa area</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600">
              <div>Latitude: {mapBounds.minLat} to {mapBounds.maxLat}</div>
              <div>Longitude: {mapBounds.minLon} to {mapBounds.maxLon}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

