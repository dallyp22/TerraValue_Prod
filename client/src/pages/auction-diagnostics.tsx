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
    try {
      const response = await fetch('/api/auctions/refresh', { method: 'POST' });
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
    return auctionData?.auctions?.filter((a: any) => !a.latitude || !a.longitude) || [];
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

        {/* Auctions Without Coordinates */}
        {auctionsWithoutCoords.length > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="text-yellow-900">Auctions Without Coordinates ({auctionsWithoutCoords.length})</CardTitle>
              <CardDescription>
                These auctions couldn't be geocoded and won't appear on the map
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
              {scraping ? 'Scraping...' : 'Run Full Scraper (All 24 Sources)'}
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

