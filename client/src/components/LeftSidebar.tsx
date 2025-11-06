import { useState } from 'react';
import { Search, MapPin, SlidersHorizontal, X, List } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Slider } from './ui/slider';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';

export interface AuctionFilters {
  searchLocation: string;
  auctionDateRange: '7' | '30' | '90' | 'custom' | 'all';
  minAcreage: number;
  maxAcreage: number;
  minCSR2: number;
  maxCSR2: number;
  minTillablePercent: number;
  maxTillablePercent: number;
  propertyTypes: string[];
  minValue: number | null;
  maxValue: number | null;
  counties: string[];
}

export interface MapOverlays {
  showAuctions: boolean;
  showSubstations: boolean;
  showDatacenters: boolean;
  showLakes: boolean;
  lakeTypes: {
    lakes: boolean;
    reservoirs: boolean;
  };
  showPowerLines: boolean;
  powerLineVoltages: {
    kv345: boolean;
    kv161: boolean;
    kv138: boolean;
    kv115: boolean;
    kv69: boolean;
  };
  showTransmissionLines: boolean;
  transmissionLineStates: {
    kansas: boolean;
    minnesota: boolean;
    missouri: boolean;
    nebraska: boolean;
    southDakota: boolean;
  };
  transmissionLineVoltages: {
    kv345: boolean;
    kv230: boolean;
    kv161: boolean;
    kv138: boolean;
    kv115: boolean;
    kv69: boolean;
  };
  showCityLabels: boolean;
  showHighways: boolean;
}

export interface MapInfo {
  showScrapingModule: boolean;
  showLegend: boolean;
  showLayerSwitcher: boolean;
}

interface LeftSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  filters: AuctionFilters;
  onFiltersChange: (filters: AuctionFilters) => void;
  onLocationSearch: (location: string) => void;
  auctionCount: number;
  onShowList?: () => void;
  mapOverlays: MapOverlays;
  onMapOverlaysChange: (overlays: MapOverlays) => void;
  mapInfo: MapInfo;
  onMapInfoChange: (mapInfo: MapInfo) => void;
}

const PROPERTY_TYPES = [
  { id: 'Irrigated', label: 'Tillable' },
  { id: 'Pasture', label: 'Pasture' },
  { id: 'Mixed', label: 'Mixed Use' },
  { id: 'CRP', label: 'Recreational' },
];

const IOWA_COUNTIES = [
  'Story', 'Polk', 'Dallas', 'Warren', 'Boone', 'Hamilton', 'Hardin', 
  'Marshall', 'Jasper', 'Marion', 'Madison', 'Adair', 'Guthrie',
  'Harrison', 'Woodbury', 'Plymouth', 'Sioux', 'Lyon', 'Black Hawk'
].sort();

export default function LeftSidebar({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  onLocationSearch,
  auctionCount,
  onShowList,
  mapOverlays,
  onMapOverlaysChange,
  mapInfo,
  onMapInfoChange
}: LeftSidebarProps) {
  const [searchInput, setSearchInput] = useState('');
  const [countySearch, setCountySearch] = useState('');
  const [filterSectionsOpen, setFilterSectionsOpen] = useState({
    date: true,
    acreage: true,
    csr2: false,
    tillable: false,
    type: false,
    value: false,
    overlays: true,
    mapInfo: true,
  });

  const handleSearch = () => {
    if (searchInput.trim()) {
      onLocationSearch(searchInput.trim());
    }
  };

  const updateFilters = (updates: Partial<AuctionFilters>) => {
    onFiltersChange({ ...filters, ...updates });
  };

  const togglePropertyType = (typeId: string) => {
    const newTypes = filters.propertyTypes.includes(typeId)
      ? filters.propertyTypes.filter(t => t !== typeId)
      : [...filters.propertyTypes, typeId];
    updateFilters({ propertyTypes: newTypes });
  };

  const toggleCounty = (county: string) => {
    const newCounties = filters.counties.includes(county)
      ? filters.counties.filter(c => c !== county)
      : [...filters.counties, county];
    updateFilters({ counties: newCounties });
  };

  const clearFilters = () => {
    onFiltersChange({
      searchLocation: '',
      auctionDateRange: 'all',
      minAcreage: 0,
      maxAcreage: 1000,
      minCSR2: 5,
      maxCSR2: 100,
      minTillablePercent: 0,
      maxTillablePercent: 100,
      propertyTypes: [],
      minValue: null,
      maxValue: null,
      counties: [],
    });
  };


  const filteredCounties = IOWA_COUNTIES.filter(county =>
    county.toLowerCase().includes(countySearch.toLowerCase())
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[999] lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          left-sidebar
          fixed lg:relative inset-y-0 left-0
          w-[90vw] sm:w-80 lg:w-80
          bg-white
          overflow-y-auto
          border-r border-slate-200
          z-[1001] lg:z-10
          transition-transform duration-300
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header - Mobile Only */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Search & Filters</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Search Section */}
        <div className="search-section p-6 border-b border-slate-200">
          <h2 className="text-2xl font-bold mb-4 text-slate-800 hidden lg:block">Find Land</h2>
          
          <div className="search-box flex gap-2">
            <Input
              type="text"
              placeholder="City, County, or Address..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} size="icon" className="bg-blue-600 hover:bg-blue-700">
              <Search className="h-4 w-4" />
            </Button>
          </div>

          <div className="quick-locations flex gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => {
                // Trigger geolocation
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition((pos) => {
                    onLocationSearch(`${pos.coords.latitude},${pos.coords.longitude}`);
                  });
                }
              }}
            >
              <MapPin className="h-3 w-3 mr-1" />
              My Location
            </Button>
          </div>
        </div>

        {/* Filters Section */}
        <div className="filters-section p-5 overflow-y-auto">
          <div className="filter-header flex justify-between items-center mb-4">
            <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-blue-600 hover:text-blue-700 text-xs"
            >
              Clear All
            </Button>
          </div>

          {/* Auction Date Filter */}
          <Collapsible
            open={filterSectionsOpen.date}
            onOpenChange={(open) => setFilterSectionsOpen({ ...filterSectionsOpen, date: open })}
            className="filter-group mb-6 pb-6 border-b border-slate-100"
          >
            <CollapsibleTrigger className="w-full flex justify-between items-center">
              <h4 className="text-sm font-semibold text-slate-700">Auction Date</h4>
              <span className="text-xs text-slate-500">{filterSectionsOpen.date ? '−' : '+'}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <Select
                value={filters.auctionDateRange}
                onValueChange={(value: any) => updateFilters({ auctionDateRange: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="7">Next 7 Days</SelectItem>
                  <SelectItem value="30">Next 30 Days</SelectItem>
                  <SelectItem value="90">Next 90 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </CollapsibleContent>
          </Collapsible>

          {/* Acreage Filter */}
          <Collapsible
            open={filterSectionsOpen.acreage}
            onOpenChange={(open) => setFilterSectionsOpen({ ...filterSectionsOpen, acreage: open })}
            className="filter-group mb-6 pb-6 border-b border-slate-100"
          >
            <CollapsibleTrigger className="w-full flex justify-between items-center">
              <h4 className="text-sm font-semibold text-slate-700">Acreage</h4>
              <span className="text-xs text-slate-500">{filterSectionsOpen.acreage ? '−' : '+'}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <Slider
                min={0}
                max={1000}
                step={10}
                value={[filters.minAcreage, filters.maxAcreage]}
                onValueChange={([min, max]) => updateFilters({ minAcreage: min, maxAcreage: max })}
                className="py-4"
              />
              <div className="flex justify-between text-xs text-slate-600 font-medium">
                <span>Min: {filters.minAcreage.toLocaleString()} acres</span>
                <span>Max: {filters.maxAcreage === 1000 ? 'Any' : `${filters.maxAcreage.toLocaleString()} acres`}</span>
              </div>
              <div className="quick-acres flex gap-2 mt-3">
                <Button
                  variant={filters.minAcreage === 0 && filters.maxAcreage === 40 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateFilters({ minAcreage: 0, maxAcreage: 40 })}
                  className="flex-1 text-xs"
                >
                  0-40
                </Button>
                <Button
                  variant={filters.minAcreage === 40 && filters.maxAcreage === 160 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateFilters({ minAcreage: 40, maxAcreage: 160 })}
                  className="flex-1 text-xs"
                >
                  40-160
                </Button>
                <Button
                  variant={filters.minAcreage === 160 && filters.maxAcreage === 1000 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateFilters({ minAcreage: 160, maxAcreage: 1000 })}
                  className="flex-1 text-xs"
                >
                  160+
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* CSR2 Rating Filter */}
          <Collapsible
            open={filterSectionsOpen.csr2}
            onOpenChange={(open) => setFilterSectionsOpen({ ...filterSectionsOpen, csr2: open })}
            className="filter-group mb-6 pb-6 border-b border-slate-100"
          >
            <CollapsibleTrigger className="w-full flex justify-between items-center">
              <h4 className="text-sm font-semibold text-slate-700">CSR2 Rating</h4>
              <span className="text-xs text-slate-500">{filterSectionsOpen.csr2 ? '−' : '+'}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <Slider
                min={5}
                max={100}
                step={1}
                value={[filters.minCSR2, filters.maxCSR2]}
                onValueChange={([min, max]) => updateFilters({ minCSR2: min, maxCSR2: max })}
                className="py-4"
              />
              <div className="flex justify-between text-xs text-slate-600 font-medium">
                <span>Min: {filters.minCSR2}</span>
                <span>Max: {filters.maxCSR2}</span>
              </div>
              <div className="csr2-labels text-xs text-slate-500 space-y-1">
                <div>Poor (5-65)</div>
                <div>Good (65-82)</div>
                <div>Excellent (82+)</div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* % Tillable Filter */}
          <Collapsible
            open={filterSectionsOpen.tillable}
            onOpenChange={(open) => setFilterSectionsOpen({ ...filterSectionsOpen, tillable: open })}
            className="filter-group mb-6 pb-6 border-b border-slate-100"
          >
            <CollapsibleTrigger className="w-full flex justify-between items-center">
              <h4 className="text-sm font-semibold text-slate-700">% Tillable</h4>
              <span className="text-xs text-slate-500">{filterSectionsOpen.tillable ? '−' : '+'}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <Slider
                min={0}
                max={100}
                step={5}
                value={[filters.minTillablePercent, filters.maxTillablePercent]}
                onValueChange={([min, max]) => updateFilters({ minTillablePercent: min, maxTillablePercent: max })}
                className="py-4"
              />
              <div className="flex justify-between text-xs text-slate-600 font-medium">
                <span>Min: {filters.minTillablePercent}%</span>
                <span>Max: {filters.maxTillablePercent}%</span>
              </div>
              <div className="text-xs text-slate-500">
                Filter properties by percentage of tillable land
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Property Type Filter */}
          <Collapsible
            open={filterSectionsOpen.type}
            onOpenChange={(open) => setFilterSectionsOpen({ ...filterSectionsOpen, type: open })}
            className="filter-group mb-6 pb-6 border-b border-slate-100"
          >
            <CollapsibleTrigger className="w-full flex justify-between items-center">
              <h4 className="text-sm font-semibold text-slate-700">Property Type</h4>
              <span className="text-xs text-slate-500">{filterSectionsOpen.type ? '−' : '+'}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2">
              {PROPERTY_TYPES.map((type) => (
                <label key={type.id} className="checkbox-label flex items-center gap-2 cursor-pointer py-1">
                  <Checkbox
                    checked={filters.propertyTypes.includes(type.id)}
                    onCheckedChange={() => togglePropertyType(type.id)}
                  />
                  <span className="text-sm text-slate-700">{type.label}</span>
                </label>
              ))}
            </CollapsibleContent>
          </Collapsible>

          {/* Estimated Value Filter */}
          <Collapsible
            open={filterSectionsOpen.value}
            onOpenChange={(open) => setFilterSectionsOpen({ ...filterSectionsOpen, value: open })}
            className="filter-group mb-6 pb-6 border-b border-slate-100"
          >
            <CollapsibleTrigger className="w-full flex justify-between items-center">
              <h4 className="text-sm font-semibold text-slate-700">Estimated Value</h4>
              <span className="text-xs text-slate-500">{filterSectionsOpen.value ? '−' : '+'}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="range-inputs flex items-center gap-3">
                <Input
                  type="number"
                  placeholder="$0"
                  value={filters.minValue ?? ''}
                  onChange={(e) => updateFilters({ minValue: e.target.value ? Number(e.target.value) : null })}
                  className="flex-1"
                />
                <span className="text-xs text-slate-500">to</span>
                <Input
                  type="number"
                  placeholder="Any"
                  value={filters.maxValue ?? ''}
                  onChange={(e) => updateFilters({ maxValue: e.target.value ? Number(e.target.value) : null })}
                  className="flex-1"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Map Overlays */}
          <Collapsible
            open={filterSectionsOpen.overlays}
            onOpenChange={(open) => setFilterSectionsOpen({ ...filterSectionsOpen, overlays: open })}
            className="filter-group mb-6"
          >
            <CollapsibleTrigger className="w-full flex justify-between items-center">
              <h4 className="text-sm font-semibold text-slate-700">Map Overlays</h4>
              <span className="text-xs text-slate-500">{filterSectionsOpen.overlays ? '−' : '+'}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2">
              {/* Master Toggle for All Overlays */}
              <label className="flex items-center gap-2 cursor-pointer py-2 border-b border-slate-200 pb-3 mb-1">
                <Checkbox
                  checked={mapOverlays.showAuctions && mapOverlays.showSubstations && mapOverlays.showDatacenters && mapOverlays.showLakes && mapOverlays.showPowerLines && mapOverlays.showCityLabels && mapOverlays.showHighways}
                  onCheckedChange={(checked) => {
                    const allEnabled = checked as boolean;
                    onMapOverlaysChange({
                      showAuctions: allEnabled,
                      showSubstations: allEnabled,
                      showDatacenters: allEnabled,
                      showLakes: allEnabled,
                      lakeTypes: {
                        lakes: allEnabled,
                        reservoirs: allEnabled
                      },
                      showPowerLines: allEnabled,
                      powerLineVoltages: {
                        kv345: allEnabled,
                        kv161: allEnabled,
                        kv138: allEnabled,
                        kv115: allEnabled,
                        kv69: allEnabled
                      },
                      showTransmissionLines: allEnabled,
                      transmissionLineStates: {
                        kansas: allEnabled,
                        minnesota: allEnabled,
                        missouri: allEnabled,
                        nebraska: allEnabled,
                        southDakota: allEnabled
                      },
                      transmissionLineVoltages: {
                        kv345: allEnabled,
                        kv230: allEnabled,
                        kv161: allEnabled,
                        kv138: allEnabled,
                        kv115: allEnabled,
                        kv69: allEnabled
                      },
                      showCityLabels: allEnabled,
                      showHighways: allEnabled
                    });
                  }}
                />
                <span className="text-sm font-semibold text-slate-800">Show All Layers</span>
              </label>

              {/* Individual Layer Toggles */}
              <label className="flex items-center gap-2 cursor-pointer py-2 pl-4">
                <Checkbox
                  checked={mapOverlays.showAuctions}
                  onCheckedChange={(checked) =>
                    onMapOverlaysChange({ ...mapOverlays, showAuctions: checked as boolean })
                  }
                />
                <span className="text-sm text-slate-700">Auctions</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer py-2 pl-4">
                <Checkbox
                  checked={mapOverlays.showCityLabels}
                  onCheckedChange={(checked) =>
                    onMapOverlaysChange({ ...mapOverlays, showCityLabels: checked as boolean })
                  }
                />
                <span className="text-sm text-slate-700">City & Town Labels</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer py-2 pl-4">
                <Checkbox
                  checked={mapOverlays.showHighways}
                  onCheckedChange={(checked) =>
                    onMapOverlaysChange({ ...mapOverlays, showHighways: checked as boolean })
                  }
                />
                <span className="text-sm text-slate-700">Highways & Interstates</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer py-2 pl-4">
                <Checkbox
                  checked={mapOverlays.showSubstations}
                  onCheckedChange={(checked) =>
                    onMapOverlaysChange({ ...mapOverlays, showSubstations: checked as boolean })
                  }
                />
                <span className="text-sm text-slate-700">Power Substations</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer py-2 pl-4">
                <Checkbox
                  checked={mapOverlays.showDatacenters}
                  onCheckedChange={(checked) =>
                    onMapOverlaysChange({ ...mapOverlays, showDatacenters: checked as boolean })
                  }
                />
                <span className="text-sm text-slate-700">Data Centers</span>
              </label>
              
              {/* Lakes Toggle */}
              <div className="pl-4 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer py-2">
                  <Checkbox
                    checked={mapOverlays.showLakes}
                    onCheckedChange={(checked) =>
                      onMapOverlaysChange({ ...mapOverlays, showLakes: checked as boolean })
                    }
                  />
                  <span className="text-sm text-slate-700">Lakes & Reservoirs</span>
                </label>
                
                {/* Lake Type Filters - only show when lakes are enabled */}
                {mapOverlays.showLakes && (
                  <div className="ml-6 space-y-1 pb-2 border-l-2 border-blue-200 pl-3">
                    <label className="flex items-center gap-2 cursor-pointer py-1">
                      <Checkbox
                        checked={mapOverlays.lakeTypes.lakes}
                        onCheckedChange={(checked) =>
                          onMapOverlaysChange({ 
                            ...mapOverlays, 
                            lakeTypes: { ...mapOverlays.lakeTypes, lakes: checked as boolean }
                          })
                        }
                      />
                      <span className="text-xs text-slate-600">Lakes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer py-1">
                      <Checkbox
                        checked={mapOverlays.lakeTypes.reservoirs}
                        onCheckedChange={(checked) =>
                          onMapOverlaysChange({ 
                            ...mapOverlays, 
                            lakeTypes: { ...mapOverlays.lakeTypes, reservoirs: checked as boolean }
                          })
                        }
                      />
                      <span className="text-xs text-slate-600">Reservoirs</span>
                    </label>
                  </div>
                )}
              </div>
              
              {/* Power Lines Toggle */}
              <div className="pl-4 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer py-2">
                  <Checkbox
                    checked={mapOverlays.showPowerLines}
                    onCheckedChange={(checked) =>
                      onMapOverlaysChange({ ...mapOverlays, showPowerLines: checked as boolean })
                    }
                  />
                  <span className="text-sm text-slate-700">High Voltage Lines</span>
                </label>
                
                {/* Voltage Level Filters - only show when power lines are enabled */}
                {mapOverlays.showPowerLines && (
                  <div className="ml-6 space-y-1 pb-2 border-l-2 border-orange-300 pl-3">
                    <label className="flex items-center gap-2 cursor-pointer py-1">
                      <Checkbox
                        checked={mapOverlays.powerLineVoltages.kv345}
                        onCheckedChange={(checked) =>
                          onMapOverlaysChange({ 
                            ...mapOverlays, 
                            powerLineVoltages: { ...mapOverlays.powerLineVoltages, kv345: checked as boolean }
                          })
                        }
                      />
                      <span className="text-xs text-slate-600">345 kV</span>
                      <span className="text-[10px] text-slate-400">(highest)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer py-1">
                      <Checkbox
                        checked={mapOverlays.powerLineVoltages.kv161}
                        onCheckedChange={(checked) =>
                          onMapOverlaysChange({ 
                            ...mapOverlays, 
                            powerLineVoltages: { ...mapOverlays.powerLineVoltages, kv161: checked as boolean }
                          })
                        }
                      />
                      <span className="text-xs text-slate-600">161 kV</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer py-1">
                      <Checkbox
                        checked={mapOverlays.powerLineVoltages.kv138}
                        onCheckedChange={(checked) =>
                          onMapOverlaysChange({ 
                            ...mapOverlays, 
                            powerLineVoltages: { ...mapOverlays.powerLineVoltages, kv138: checked as boolean }
                          })
                        }
                      />
                      <span className="text-xs text-slate-600">138 kV</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer py-1">
                      <Checkbox
                        checked={mapOverlays.powerLineVoltages.kv115}
                        onCheckedChange={(checked) =>
                          onMapOverlaysChange({ 
                            ...mapOverlays, 
                            powerLineVoltages: { ...mapOverlays.powerLineVoltages, kv115: checked as boolean }
                          })
                        }
                      />
                      <span className="text-xs text-slate-600">115 kV</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer py-1">
                    <Checkbox
                        checked={mapOverlays.powerLineVoltages.kv69}
                        onCheckedChange={(checked) =>
                          onMapOverlaysChange({ 
                            ...mapOverlays, 
                            powerLineVoltages: { ...mapOverlays.powerLineVoltages, kv69: checked as boolean }
                          })
                        }
                      />
                      <span className="text-xs text-slate-600">69 kV</span>
                  </label>
                  </div>
                )}
              </div>

              {/* High Voltage Transmission Lines (Multi-State) */}
              <div className="space-y-3 pb-4 border-b border-slate-200">
                <label className="flex items-center gap-2 cursor-pointer py-1.5">
                  <Checkbox
                    checked={mapOverlays.showTransmissionLines}
                    onCheckedChange={(checked) =>
                      onMapOverlaysChange({ ...mapOverlays, showTransmissionLines: checked as boolean })
                    }
                  />
                  <span className="text-sm font-medium text-slate-700">⚡ HV Transmission Lines</span>
                </label>

                {/* State Filters - only show when transmission lines are enabled */}
                {mapOverlays.showTransmissionLines && (
                  <>
                    <div className="ml-6 space-y-1 pb-3 border-l-2 border-orange-300 pl-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2">States</p>
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <Checkbox
                          checked={mapOverlays.transmissionLineStates.kansas}
                          onCheckedChange={(checked) =>
                            onMapOverlaysChange({ 
                              ...mapOverlays, 
                              transmissionLineStates: { ...mapOverlays.transmissionLineStates, kansas: checked as boolean }
                            })
                          }
                        />
                        <span className="text-xs text-slate-600">Kansas</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <Checkbox
                          checked={mapOverlays.transmissionLineStates.minnesota}
                          onCheckedChange={(checked) =>
                            onMapOverlaysChange({ 
                              ...mapOverlays, 
                              transmissionLineStates: { ...mapOverlays.transmissionLineStates, minnesota: checked as boolean }
                            })
                          }
                        />
                        <span className="text-xs text-slate-600">Minnesota</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <Checkbox
                          checked={mapOverlays.transmissionLineStates.missouri}
                          onCheckedChange={(checked) =>
                            onMapOverlaysChange({ 
                              ...mapOverlays, 
                              transmissionLineStates: { ...mapOverlays.transmissionLineStates, missouri: checked as boolean }
                            })
                          }
                        />
                        <span className="text-xs text-slate-600">Missouri</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <Checkbox
                          checked={mapOverlays.transmissionLineStates.nebraska}
                          onCheckedChange={(checked) =>
                            onMapOverlaysChange({ 
                              ...mapOverlays, 
                              transmissionLineStates: { ...mapOverlays.transmissionLineStates, nebraska: checked as boolean }
                            })
                          }
                        />
                        <span className="text-xs text-slate-600">Nebraska</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <Checkbox
                          checked={mapOverlays.transmissionLineStates.southDakota}
                          onCheckedChange={(checked) =>
                            onMapOverlaysChange({ 
                              ...mapOverlays, 
                              transmissionLineStates: { ...mapOverlays.transmissionLineStates, southDakota: checked as boolean }
                            })
                          }
                        />
                        <span className="text-xs text-slate-600">South Dakota</span>
                      </label>
                    </div>

                    {/* Voltage Level Filters */}
                    <div className="ml-6 space-y-1 pb-2 border-l-2 border-orange-300 pl-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2">Voltage Levels</p>
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <Checkbox
                          checked={mapOverlays.transmissionLineVoltages.kv345}
                          onCheckedChange={(checked) =>
                            onMapOverlaysChange({ 
                              ...mapOverlays, 
                              transmissionLineVoltages: { ...mapOverlays.transmissionLineVoltages, kv345: checked as boolean }
                            })
                          }
                        />
                        <span className="text-xs text-slate-600">345 kV</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <Checkbox
                          checked={mapOverlays.transmissionLineVoltages.kv230}
                          onCheckedChange={(checked) =>
                            onMapOverlaysChange({ 
                              ...mapOverlays, 
                              transmissionLineVoltages: { ...mapOverlays.transmissionLineVoltages, kv230: checked as boolean }
                            })
                          }
                        />
                        <span className="text-xs text-slate-600">230 kV</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <Checkbox
                          checked={mapOverlays.transmissionLineVoltages.kv161}
                          onCheckedChange={(checked) =>
                            onMapOverlaysChange({ 
                              ...mapOverlays, 
                              transmissionLineVoltages: { ...mapOverlays.transmissionLineVoltages, kv161: checked as boolean }
                            })
                          }
                        />
                        <span className="text-xs text-slate-600">161 kV</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <Checkbox
                          checked={mapOverlays.transmissionLineVoltages.kv138}
                          onCheckedChange={(checked) =>
                            onMapOverlaysChange({ 
                              ...mapOverlays, 
                              transmissionLineVoltages: { ...mapOverlays.transmissionLineVoltages, kv138: checked as boolean }
                            })
                          }
                        />
                        <span className="text-xs text-slate-600">138 kV</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <Checkbox
                          checked={mapOverlays.transmissionLineVoltages.kv115}
                          onCheckedChange={(checked) =>
                            onMapOverlaysChange({ 
                              ...mapOverlays, 
                              transmissionLineVoltages: { ...mapOverlays.transmissionLineVoltages, kv115: checked as boolean }
                            })
                          }
                        />
                        <span className="text-xs text-slate-600">115 kV</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer py-1">
                        <Checkbox
                          checked={mapOverlays.transmissionLineVoltages.kv69}
                          onCheckedChange={(checked) =>
                            onMapOverlaysChange({ 
                              ...mapOverlays, 
                              transmissionLineVoltages: { ...mapOverlays.transmissionLineVoltages, kv69: checked as boolean }
                            })
                          }
                        />
                        <span className="text-xs text-slate-600">69 kV</span>
                      </label>
                    </div>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Map Info Controls */}
          <Collapsible
            open={filterSectionsOpen.mapInfo}
            onOpenChange={(open) => setFilterSectionsOpen({ ...filterSectionsOpen, mapInfo: open })}
            className="filter-group mb-6"
          >
            <CollapsibleTrigger className="w-full flex justify-between items-center">
              <h4 className="text-sm font-semibold text-slate-700">Map Info</h4>
              <span className="text-xs text-slate-500">{filterSectionsOpen.mapInfo ? '−' : '+'}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2">
              {/* Master Toggle for All Map Info */}
              <label className="flex items-center gap-2 cursor-pointer py-2 border-b border-slate-200 pb-3 mb-1">
                <Checkbox
                  checked={mapInfo.showScrapingModule && mapInfo.showLegend}
                  onCheckedChange={(checked) => {
                    const allEnabled = checked as boolean;
                    onMapInfoChange({
                      showScrapingModule: allEnabled,
                      showLegend: allEnabled,
                      showLayerSwitcher: false
                    });
                  }}
                />
                <span className="text-sm font-semibold text-slate-800">Show All Info</span>
              </label>

              {/* Individual Info Toggles */}
              <label className="flex items-center gap-2 cursor-pointer py-2 pl-4">
                <Checkbox
                  checked={mapInfo.showScrapingModule}
                  onCheckedChange={(checked) =>
                    onMapInfoChange({ ...mapInfo, showScrapingModule: checked as boolean })
                  }
                />
                <span className="text-sm text-slate-700">Scraping Controls</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer py-2 pl-4">
                <Checkbox
                  checked={mapInfo.showLegend}
                  onCheckedChange={(checked) =>
                    onMapInfoChange({ ...mapInfo, showLegend: checked as boolean })
                  }
                />
                <span className="text-sm text-slate-700">Legend</span>
              </label>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Results Summary */}
        <div className="results-summary p-4 bg-slate-50 border-t border-slate-200">
          <div className="flex justify-between items-center">
            <div className="result-count text-sm text-slate-600">
              <strong className="text-lg text-slate-800">{auctionCount}</strong> auctions found
            </div>
            {onShowList && (
              <Button
                variant="outline"
                size="sm"
                onClick={onShowList}
                className="text-xs flex items-center gap-1"
              >
                <List className="h-3 w-3" />
                Show List
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

