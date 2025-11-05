import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, MapPin, Ruler, ExternalLink } from 'lucide-react';

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

  const checkAuctions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        minLat: mapBounds.minLat.toString(),
        maxLat: mapBounds.maxLat.toString(),
        minLon: mapBounds.minLon.toString(),
        maxLon: mapBounds.maxLon.toString()
      });
      
      const response = await fetch(`https://web-production-51e54.up.railway.app/api/auctions?${params}`);
      const data = await response.json();
      
      setAuctionData(data);
    } catch (error) {
      console.error('Failed to fetch auctions:', error);
      setAuctionData({ error: 'Failed to fetch auctions' });
    }
    setLoading(false);
  };

  const startScrape = async () => {
    setScraping(true);
    try {
      const response = await fetch('https://web-production-51e54.up.railway.app/api/auctions/refresh', { method: 'POST' });
      const data = await response.json();
      alert(data.message || 'Scraping started');
      
      // Wait a bit then refresh
      setTimeout(() => {
        checkAuctions();
        setScraping(false);
      }, 10000);
    } catch (error) {
      console.error('Failed to start scrape:', error);
      setScraping(false);
    }
  };

  const investigateCoords = async () => {
    setInvestigating(true);
    try {
      const response = await fetch('https://web-production-51e54.up.railway.app/api/auctions/investigate');
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
      const response = await fetch('https://web-production-51e54.up.railway.app/api/auctions/update-coordinates', { method: 'POST' });
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

  useEffect(() => {
    checkAuctions();
  }, []);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">Auction System Diagnostics</h1>
      
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
                      {auctionData.totalInDatabase || 0}
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
                      {(auctionData.totalInDatabase || 0) - (auctionData.withoutCoordinates || 0)}
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

                {auctionData.auctions?.length === 0 && auctionData.totalInDatabase === 0 && (
                  <Alert>
                    <AlertDescription>
                      ❌ No auctions in database. Click "Run Scraper" below to populate the database.
                    </AlertDescription>
                  </Alert>
                )}

                {auctionData.auctions?.length === 0 && auctionData.totalInDatabase > 0 && (
                  <Alert>
                    <AlertDescription>
                      ℹ️ Auctions exist in database but none are in the current map bounds (Iowa area).
                      Try adjusting the map bounds or check if auctions have valid Iowa coordinates.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <p>Click "Refresh Status" to check</p>
            )}
          </CardContent>
        </Card>

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
                    {auctionData.auctions.slice(0, 20).map((auction: any, i: number) => (
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
                    {auctionData.auctions.length > 20 && (
                      <div className="text-center text-sm text-gray-500 py-2">
                        Showing 20 of {auctionData.auctions.length} auctions
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Individual Source Tabs */}
                {Object.entries(auctionsBySource).map(([source, sourceAuctions]) => (
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
                      {(sourceAuctions as any[]).map((auction: any, i: number) => (
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
                  </TabsContent>
                ))}
              </Tabs>
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
            <CardTitle>Actions</CardTitle>
            <CardDescription>Manage auction data</CardDescription>
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
              onClick={startScrape} 
              disabled={scraping}
              variant="secondary"
            >
              {scraping ? 'Scraping...' : 'Run Full Scraper'}
            </Button>
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

