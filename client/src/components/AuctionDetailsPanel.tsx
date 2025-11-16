import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { X, MapPin, Calendar, Ruler, TrendingUp, ExternalLink, Calculator, FileText, Sparkles, Sprout } from 'lucide-react';
import { format } from 'date-fns';
import type { Auction } from '@shared/schema';

interface AuctionDetailsPanelProps {
  auction: Auction;
  onClose: () => void;
  onStartValuation?: () => void;
}

export function AuctionDetailsPanel({ auction, onClose, onStartValuation }: AuctionDetailsPanelProps) {
  const [calculating, setCalculating] = useState(false);
  const [valuation, setValuation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCalculateValuation = async () => {
    setCalculating(true);
    setError(null);
    
    try {
      const response = await fetch(`https://web-production-51e54.up.railway.app/api/auctions/${auction.id}/valuation`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.success) {
        setValuation(data.valuation);
      } else {
        setError(data.message || 'Failed to calculate valuation');
      }
    } catch (err) {
      setError('Network error. Please try again.');
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

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'Date TBD';
    try {
      return format(new Date(date), 'MMM dd, yyyy');
    } catch {
      return 'Date TBD';
    }
  };

  // Use valuation data if available, otherwise check auction data
  const csr2Mean = valuation?.csr2Mean || auction.csr2Mean;
  const estimatedValue = valuation?.estimatedValue || auction.estimatedValue;

  return (
    <Card className="absolute top-4 right-4 w-96 max-h-[90vh] overflow-y-auto z-50 shadow-2xl bg-white dark:bg-slate-900">
      <CardHeader className="pb-3 bg-white dark:bg-slate-900">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="text-lg leading-tight">{auction.title}</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-1">
              <span className="font-medium">{auction.sourceWebsite}</span>
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0 bg-white dark:bg-slate-900">
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b">
            <TabsTrigger value="details">
              <FileText className="h-4 w-4 mr-1" />
              Details
            </TabsTrigger>
            <TabsTrigger value="valuation">
              <Calculator className="h-4 w-4 mr-1" />
              Valuation
            </TabsTrigger>
            <TabsTrigger value="enriched" disabled={auction.enrichmentStatus !== 'completed'}>
              <Sparkles className="h-4 w-4 mr-1" />
              AI Insights
              {auction.enrichmentStatus === 'completed' && <Badge variant="secondary" className="ml-2 text-xs">✨</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 p-6">
            {/* Auction Date */}
            {auction.auctionDate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Auction Date:</span>
                <span>{formatDate(auction.auctionDate)}</span>
              </div>
            )}

            {/* Location */}
            {auction.address && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div className="font-medium">Location</div>
                  <div className="text-muted-foreground">{auction.address}</div>
                  {(auction.county || auction.state) && (
                    <div className="text-muted-foreground">
                      {auction.county && `${auction.county} County`}
                      {auction.county && auction.state && ', '}
                      {auction.state}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Acreage */}
            {auction.acreage && (
              <div className="flex items-center gap-2 text-sm">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Acreage:</span>
                <Badge variant="secondary">{auction.acreage} acres</Badge>
              </div>
            )}

            {/* Land Type */}
            {auction.landType && (
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Land Type:</span>
                <Badge variant="outline">{auction.landType}</Badge>
              </div>
            )}

            {/* Description */}
            {auction.description && (
              <div className="text-sm">
                <div className="font-medium mb-1">Description</div>
                <p className="text-muted-foreground leading-relaxed">{auction.description}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="valuation" className="space-y-4 p-6">
            {/* CSR2 Valuation Section */}
            {csr2Mean ? (
              <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-900 dark:text-green-100">
                  <Calculator className="h-4 w-4" />
                  CSR2 Valuation
                </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-muted-foreground">CSR2 Rating</div>
                <div className="font-bold text-lg">{csr2Mean.toFixed(1)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Est. Value/Acre</div>
                <div className="font-bold text-lg">
                  {estimatedValue ? formatCurrency(estimatedValue) : 'N/A'}
                </div>
              </div>
            </div>

            {auction.acreage && estimatedValue && (
              <div className="pt-2 border-t border-green-200 dark:border-green-800">
                <div className="text-muted-foreground text-sm">Total Estimated Value</div>
                <div className="font-bold text-xl text-green-700 dark:text-green-300">
                  {formatCurrency(estimatedValue * auction.acreage)}
                </div>
              </div>
            )}
              </div>
            ) : (
              <Button
                onClick={handleCalculateValuation}
                disabled={calculating || !auction.latitude || !auction.longitude}
                className="w-full"
                variant="default"
              >
                <Calculator className="mr-2 h-4 w-4" />
                {calculating ? 'Calculating...' : 'Calculate CSR2 Valuation'}
              </Button>
            )}

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-3 rounded">
                {error}
              </div>
            )}
          </TabsContent>

          <TabsContent value="enriched" className="space-y-6 p-6">
            {/* AI Enrichment Badge */}
            <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg">
              <Sparkles className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-medium text-violet-900">AI-Enhanced Property Profile</span>
            </div>

            {/* Auction Information */}
            {(auction.enrichedAuctionHouse || auction.enrichedAuctionLocation || auction.enrichedPropertyLocation) && (
              <div>
                <h4 className="font-semibold text-sm mb-3">Auction Information</h4>
                <div className="space-y-2 text-sm">
                  {auction.enrichedAuctionHouse && (
                    <div>
                      <span className="text-muted-foreground">Auction House:</span>
                      <p className="font-medium">{auction.enrichedAuctionHouse}</p>
                    </div>
                  )}
                  {auction.enrichedAuctionLocation && (
                    <div>
                      <span className="text-muted-foreground">Auction Location:</span>
                      <p>{auction.enrichedAuctionLocation}</p>
                    </div>
                  )}
                  {auction.enrichedPropertyLocation && (
                    <div>
                      <span className="text-muted-foreground">Property Location:</span>
                      <p>{auction.enrichedPropertyLocation}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Key Highlights */}
            {auction.keyHighlights && Array.isArray(auction.keyHighlights) && auction.keyHighlights.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-600" />
                  Key Highlights
                </h4>
                <ul className="space-y-1.5">
                  {auction.keyHighlights.map((highlight: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-amber-600">•</span>
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Legal Description */}
            {auction.legalDescription && (
              <div>
                <h4 className="font-semibold text-sm mb-3">Legal Description</h4>
                <p className="text-sm bg-slate-50 p-3 rounded border font-mono">
                  {auction.legalDescription}
                </p>
              </div>
            )}

            {/* Soil & Land Quality */}
            {(auction.soilMentions || auction.tillablePercent || auction.drainage) && (
              <div>
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Sprout className="h-4 w-4 text-green-600" />
                  Soil & Land Quality
                </h4>
                <div className="space-y-2 text-sm">
                  {auction.soilMentions && (
                    <div>
                      <span className="text-muted-foreground">Soil Quality:</span>
                      <p>{auction.soilMentions}</p>
                    </div>
                  )}
                  {auction.tillablePercent && (
                    <div>
                      <span className="text-muted-foreground">Tillable:</span>
                      <p className="font-medium text-green-700">{auction.tillablePercent}%</p>
                    </div>
                  )}
                  {auction.drainage && (
                    <div>
                      <span className="text-muted-foreground">Drainage:</span>
                      <p>{auction.drainage}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Improvements */}
            {auction.improvements && Array.isArray(auction.improvements) && auction.improvements.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-3">Property Improvements</h4>
                <ul className="space-y-2">
                  {auction.improvements.map((imp: any, idx: number) => (
                    <li key={idx} className="flex gap-2 text-sm bg-blue-50 p-2 rounded">
                      <span className="text-blue-600 font-semibold capitalize">{imp.type}:</span>
                      <span>{imp.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Infrastructure */}
            {(auction.utilities || auction.roadAccess) && (
              <div>
                <h4 className="font-semibold text-sm mb-3">Infrastructure</h4>
                <div className="space-y-2 text-sm">
                  {auction.utilities && (
                    <div>
                      <span className="text-muted-foreground">Utilities:</span>
                      <div className="flex gap-2 mt-1">
                        {auction.utilities.electric && <Badge variant="outline">⚡ Electric</Badge>}
                        {auction.utilities.water && <Badge variant="outline">💧 Water</Badge>}
                        {auction.utilities.gas && <Badge variant="outline">🔥 Gas</Badge>}
                      </div>
                    </div>
                  )}
                  {auction.roadAccess && (
                    <div>
                      <span className="text-muted-foreground">Road Access:</span>
                      <p>{auction.roadAccess}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="p-6 space-y-3 border-t">
          <Button
            variant="outline"
            className="w-full"
            asChild
          >
            <a href={auction.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              View Full Auction Details
            </a>
          </Button>

          {/* Start Property Valuation Button */}
          {onStartValuation && (
            <Button
              onClick={onStartValuation}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white"
            >
              <FileText className="mr-2 h-4 w-4" />
              Start Property Valuation
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

