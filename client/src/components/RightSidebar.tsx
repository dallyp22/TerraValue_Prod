import { useState, useEffect } from 'react';
import { X, DollarSign, TrendingUp, Calendar, MapPin, Ruler, ExternalLink, Calculator, Save, Share2, BarChart3, FileText, Sprout, Eye, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent } from './ui/card';
import { format, differenceInDays } from 'date-fns';
import type { Auction } from '@shared/schema';
import { SoilDataPanel } from './SoilDataPanel';
import {
  getComprehensiveAuctionData,
  getFormattedAuctionDate,
  getKeyHighlights,
  getPropertyDetails,
  isEnriched
} from '../lib/auctionDisplayHelpers';

interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItem: Auction | any | null;
  itemType: 'auction' | 'parcel' | null;
  onStartValuation: (item: any) => void;
}

export default function RightSidebar({
  isOpen,
  onClose,
  selectedItem,
  itemType,
  onStartValuation,
}: RightSidebarProps) {
  const [activeTab, setActiveTab] = useState('details');
  const [calculating, setCalculating] = useState(false);
  const [csr2Data, setCsr2Data] = useState<any>(null);
  const [mukey, setMukey] = useState<string | null>(null);

  // Debug: Log whenever component renders
  console.log('🌾 RightSidebar render - mukey:', mukey, 'selectedItem:', !!selectedItem);

  // Fetch mukey when item is selected and has coordinates
  useEffect(() => {
    console.log('🔍 Mukey lookup effect triggered');
    console.log('Selected item:', selectedItem);
    console.log('Item type:', itemType);
    
    const fetchMukey = async () => {
      if (!selectedItem) {
        console.log('No selected item, skipping mukey lookup');
        setMukey(null);
        return;
      }

      // Try different coordinate formats
      let lon = selectedItem.longitude;
      let lat = selectedItem.latitude;

      console.log('Initial coordinates:', { lon, lat });

      // For parcels, coordinates might be in different format
      if (!lon && !lat && selectedItem.coordinates) {
        console.log('Trying coordinates array:', selectedItem.coordinates);
        // coordinates might be [lon, lat] array
        if (Array.isArray(selectedItem.coordinates)) {
          lon = selectedItem.coordinates[0];
          lat = selectedItem.coordinates[1];
          console.log('Extracted from array:', { lon, lat });
        }
      }

      // Also check for centroid
      if (!lon && !lat && selectedItem.centroid) {
        console.log('Trying centroid:', selectedItem.centroid);
        if (Array.isArray(selectedItem.centroid)) {
          lon = selectedItem.centroid[0];
          lat = selectedItem.centroid[1];
          console.log('Extracted from centroid:', { lon, lat });
        }
      }

      if (!lon || !lat) {
        console.log('❌ No coordinates available for mukey lookup');
        console.log('Available properties:', Object.keys(selectedItem));
        setMukey(null);
        return;
      }

      console.log(`✅ Fetching mukey for coordinates: lon=${lon}, lat=${lat}`);

      try {
        const response = await fetch(
          `/api/mukey/point?lon=${lon}&lat=${lat}`
        );
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Mukey response:', data);
          setMukey(data.mukey || null);
        } else {
          console.warn('⚠️ Mukey lookup failed:', response.status);
          setMukey(null);
        }
      } catch (error) {
        console.error('❌ Failed to fetch mukey:', error);
        setMukey(null);
      }
    };

    fetchMukey();
  }, [selectedItem, itemType]);

  if (!selectedItem && !isOpen) return null;

  const handleCalculateCSR2 = async () => {
    if (itemType !== 'auction' || !selectedItem) return;
    
    setCalculating(true);
    try {
      const response = await fetch(`https://web-production-51e54.up.railway.app/api/auctions/${selectedItem.id}/valuation`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        setCsr2Data(data.valuation);
      }
    } catch (error) {
      console.error('Failed to calculate CSR2:', error);
    } finally {
      setCalculating(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getCSR2Color = (csr2: number) => {
    if (csr2 >= 82) return 'text-green-700';
    if (csr2 >= 65) return 'text-yellow-700';
    return 'text-orange-700';
  };

  const getDaysUntilAuction = (auctionDate: Date | string | null) => {
    if (!auctionDate) return null;
    try {
      const days = differenceInDays(new Date(auctionDate), new Date());
      return days > 0 ? days : 0;
    } catch {
      return null;
    }
  };

  // Empty state when no selection
  if (!selectedItem) {
    return (
      <>
        <div
          className={`fixed inset-0 bg-black/50 z-30 lg:hidden transition-opacity duration-300 ${
            isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={onClose}
        />
        <div
          className={`
            right-sidebar
            fixed lg:relative inset-y-0 right-0
            w-[90vw] sm:w-96 lg:w-[400px]
            bg-white
            overflow-y-auto
            border-l border-slate-200
            z-40 lg:z-10
            transition-transform duration-300
            ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          `}
        >
          <div className="right-sidebar-empty p-8 flex flex-col items-center justify-center h-full">
            <div className="empty-state text-center space-y-6">
              <MapPin size={64} className="mx-auto text-slate-300" />
              <div>
                <h3 className="text-xl font-semibold text-slate-800 mb-2">Select a Property</h3>
                <p className="text-sm text-slate-500">
                  Click any marker on the map to view details, soil data, and valuation analysis
                </p>
              </div>

              <div className="quick-actions grid grid-cols-1 gap-3 mt-8 w-full">
                <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
                  <Eye className="h-5 w-5" />
                  <span className="text-sm">Toggle Map Layers</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Auction display
  if (itemType === 'auction') {
    const auction = selectedItem as Auction;
    const daysUntil = getDaysUntilAuction(auction.auctionDate);
    const csr2Mean = csr2Data?.csr2Mean || auction.csr2Mean;
    const estimatedValue = csr2Data?.estimatedValue || auction.estimatedValue;

    return (
      <>
        <div
          className={`fixed inset-0 bg-black/50 z-30 lg:hidden transition-opacity duration-300 ${
            isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={onClose}
        />
        <div
          className={`
            right-sidebar
            fixed lg:relative inset-y-0 right-0
            w-[90vw] sm:w-96 lg:w-[400px]
            bg-white
            overflow-y-auto
            border-l border-slate-200
            z-40 lg:z-10
            transition-transform duration-300
            ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          `}
        >
          {/* Property Header */}
          <div className="property-header relative h-60 bg-gradient-to-br from-blue-500 to-blue-700 overflow-hidden">
            <div className="absolute inset-0 bg-black/20" />
            <button
              onClick={onClose}
              className="close-details absolute top-3 right-3 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-lg transition-all z-10"
            >
              <X className="h-4 w-4 text-slate-700" />
            </button>
            {daysUntil !== null && (
              <div className="property-badge absolute bottom-3 left-3 px-3 py-1.5 bg-red-600/90 backdrop-blur-sm text-white rounded-lg text-sm font-semibold">
                {daysUntil} days until auction
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
              <div className="text-white">
                <div className="text-xs opacity-90">{auction.sourceWebsite}</div>
              </div>
            </div>
          </div>

          {/* Property Title */}
          <div className="property-title-section p-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800 mb-1">
              {auction.acreage ? `${auction.acreage} Acres` : auction.title}
            </h2>
            <p className="property-location text-sm text-slate-600 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {auction.county ? `${auction.county} County` : ''}{auction.county && auction.state ? ', ' : ''}{auction.state || ''}
            </p>
          </div>

          {/* Metrics Grid */}
          {(csr2Mean || estimatedValue) && (
            <div className="metrics-grid grid grid-cols-2 gap-3 p-6 bg-slate-50 border-b border-slate-200">
              {csr2Mean && (
                <Card className="border-green-200 bg-white">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sprout className="h-4 w-4 text-green-600" />
                      <span className="metric-label text-xs font-medium text-slate-600">CSR2 Rating</span>
                    </div>
                    <div className={`metric-value text-2xl font-bold ${getCSR2Color(csr2Mean)}`}>
                      {csr2Mean.toFixed(1)}
                    </div>
                    {auction.csr2Min && auction.csr2Max && (
                      <div className="metric-subtext text-xs text-slate-500 mt-1">
                        Range: {auction.csr2Min}-{auction.csr2Max}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              {estimatedValue && (
                <Card className="border-blue-200 bg-white">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-blue-600" />
                      <span className="metric-label text-xs font-medium text-slate-600">Est. Value</span>
                    </div>
                    <div className="metric-value text-2xl font-bold text-blue-700">
                      {formatCurrency(estimatedValue)}
                    </div>
                    <div className="metric-subtext text-xs text-slate-500 mt-1">per acre</div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="detail-tabs w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0">
              <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent">
                <FileText className="h-4 w-4 mr-1" />
                Details
              </TabsTrigger>
              <TabsTrigger value="soil" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent" disabled={!csr2Mean && !mukey}>
                <Sprout className="h-4 w-4 mr-1" />
                Soil Data
                {mukey && !csr2Mean && <Badge variant="secondary" className="ml-2 text-xs">New</Badge>}
              </TabsTrigger>
              <TabsTrigger value="analysis" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent" disabled={!csr2Mean}>
                <BarChart3 className="h-4 w-4 mr-1" />
                Analysis
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="tab-content p-6 space-y-4">
              {auction.auctionDate && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">Auction Date:</span>
                  <span>{format(new Date(auction.auctionDate), 'MMM dd, yyyy')}</span>
                </div>
              )}

              {auction.acreage && (
                <div className="flex items-center gap-2 text-sm">
                  <Ruler className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">Acreage:</span>
                  <Badge variant="secondary">{auction.acreage} acres</Badge>
                </div>
              )}

              {auction.landType && (
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">Land Type:</span>
                  <Badge variant="outline">{auction.landType}</Badge>
                </div>
              )}

              {auction.address && (
                <div className="text-sm">
                  <div className="font-medium mb-1">Address</div>
                  <p className="text-slate-600">{auction.address}</p>
                </div>
              )}

              {auction.description && (
                <div className="text-sm">
                  <div className="font-medium mb-1">Description</div>
                  <p className="text-slate-600 leading-relaxed">{auction.description}</p>
                </div>
              )}

              {!csr2Mean && auction.latitude && auction.longitude && (
                <>
                  <Separator />
                  <Button
                    onClick={handleCalculateCSR2}
                    disabled={calculating}
                    variant="outline"
                    className="w-full"
                  >
                    <Calculator className="mr-2 h-4 w-4" />
                    {calculating ? 'Calculating...' : 'Calculate CSR2 & Value'}
                  </Button>
                </>
              )}
            </TabsContent>

            <TabsContent value="soil" className="tab-content p-6 space-y-4">
              {/* CSR2 Data (if available) */}
              {csr2Mean && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-2">CSR2 Soil Quality Rating</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Mean CSR2:</span>
                        <span className="font-semibold">{csr2Mean.toFixed(1)}</span>
                      </div>
                      {auction.csr2Min && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Min CSR2:</span>
                          <span className="font-semibold">{auction.csr2Min}</span>
                        </div>
                      )}
                      {auction.csr2Max && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Max CSR2:</span>
                          <span className="font-semibold">{auction.csr2Max}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Separator />
                </div>
              )}
              
              {/* Soil Properties from Local Database */}
              <SoilDataPanel mukey={mukey} />
            </TabsContent>

            <TabsContent value="analysis" className="tab-content p-6">
              {csr2Mean && estimatedValue && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Valuation Summary</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Value per Acre:</span>
                        <span className="font-semibold">{formatCurrency(estimatedValue)}</span>
                      </div>
                      {auction.acreage && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Total Est. Value:</span>
                          <span className="font-semibold text-lg text-green-700">
                            {formatCurrency(estimatedValue * auction.acreage)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Property Actions */}
          <div className="property-actions p-6 border-t border-slate-200 bg-slate-50 space-y-3">
            <Button
              onClick={() => onStartValuation(auction)}
              className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
            >
              <Calculator className="mr-2 h-4 w-4" />
              Start Full Valuation
            </Button>

            <Button
              variant="default"
              className="w-full bg-blue-600 hover:bg-blue-700"
              asChild
            >
              <a href={auction.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                View Full Listing
              </a>
            </Button>

            <div className="action-row grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" className="text-xs">
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
              <Button variant="outline" size="sm" className="text-xs">
                <Share2 className="h-3 w-3 mr-1" />
                Share
              </Button>
              <Button variant="outline" size="sm" className="text-xs">
                <BarChart3 className="h-3 w-3 mr-1" />
                Compare
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Parcel display
  if (itemType === 'parcel') {
    const parcel = selectedItem;
    const acres = parcel?.acres || 0;

    return (
      <>
        <div
          className={`fixed inset-0 bg-black/50 z-30 lg:hidden transition-opacity duration-300 ${
            isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          onClick={onClose}
        />
        <div
          className={`
            right-sidebar
            fixed lg:relative inset-y-0 right-0
            w-[90vw] sm:w-96 lg:w-[400px]
            bg-white
            overflow-y-auto
            border-l border-slate-200
            z-40 lg:z-10
            transition-transform duration-300
            ${isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          `}
        >
          {/* Property Header */}
          <div className="property-header relative h-60 bg-gradient-to-br from-emerald-500 to-emerald-700 overflow-hidden">
            <div className="absolute inset-0 bg-black/20" />
            <button
              onClick={onClose}
              className="close-details absolute top-3 right-3 w-8 h-8 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-lg transition-all z-10"
            >
              <X className="h-4 w-4 text-slate-700" />
            </button>
            <div className="property-badge absolute bottom-3 left-3 px-3 py-1.5 bg-emerald-600/90 backdrop-blur-sm text-white rounded-lg text-sm font-semibold">
              Parcel Data
            </div>
          </div>

          {/* Property Title */}
          <div className="property-title-section p-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800 mb-1">
              {acres.toFixed(2)} Acres
            </h2>
            <p className="property-location text-sm text-slate-600 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {parcel?.county || 'Unknown County'}
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <TabsList className="detail-tabs w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0">
              <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:bg-transparent">
                <FileText className="h-4 w-4 mr-1" />
                Details
              </TabsTrigger>
              <TabsTrigger value="soil" className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:bg-transparent" disabled={!mukey}>
                <Sprout className="h-4 w-4 mr-1" />
                Soil Data
                {mukey && <Badge variant="secondary" className="ml-2 text-xs">New</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="tab-content p-6 space-y-4">
              <div className="text-sm">
                <div className="font-medium mb-1">Owner</div>
                <p className="text-slate-600">{parcel?.owner_name || 'Unknown'}</p>
              </div>

              <div className="text-sm">
                <div className="font-medium mb-1">Parcel Number</div>
                <p className="text-slate-600">{parcel?.parcel_number || 'N/A'}</p>
              </div>

              <div className="text-sm">
                <div className="font-medium mb-1">Parcel Class</div>
                <Badge variant="outline">{parcel?.parcel_class || 'N/A'}</Badge>
              </div>

              <div className="text-sm">
                <div className="font-medium mb-1">County</div>
                <p className="text-slate-600">{parcel?.county || 'N/A'}</p>
              </div>

              {parcel?.coordinates && (
                <div className="text-sm">
                  <div className="font-medium mb-1">Coordinates</div>
                  <p className="text-xs text-slate-600 font-mono">
                    {parcel.coordinates[1].toFixed(6)}, {parcel.coordinates[0].toFixed(6)}
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="soil" className="tab-content p-6">
              <SoilDataPanel mukey={mukey} />
            </TabsContent>
          </Tabs>

          {/* Property Actions */}
          <div className="property-actions p-6 border-t border-slate-200 bg-slate-50 space-y-3">
            <Button
              onClick={() => onStartValuation(parcel)}
              className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
            >
              <Calculator className="mr-2 h-4 w-4" />
              Start Valuation
            </Button>

            <div className="action-row grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" className="text-xs">
                <Save className="h-3 w-3 mr-1" />
                Save
              </Button>
              <Button variant="outline" size="sm" className="text-xs">
                <Share2 className="h-3 w-3 mr-1" />
                Share
              </Button>
              <Button variant="outline" size="sm" className="text-xs">
                <BarChart3 className="h-3 w-3 mr-1" />
                Compare
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return null;
}

