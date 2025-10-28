import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calculator, Plus, Trash2, Building2, Map, PlusCircle, X } from "lucide-react";
import { MapParcelPicker } from "@/components/map-parcel-picker";
import { propertyFormSchema, type PropertyForm, type PropertyImprovement } from "@shared/schema";

interface PropertyFormProps {
  onSubmit: (data: PropertyForm) => void;
  isLoading?: boolean;
  initialData?: Partial<PropertyForm>;
  hideLocationFields?: boolean;
  isParcelBased?: boolean;
  csr2LoadingMessage?: string;
}

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
  "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
  "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
  "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
  "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
  "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
];

export function PropertyForm({ onSubmit, isLoading = false, initialData, hideLocationFields = false, isParcelBased = false, csr2LoadingMessage }: PropertyFormProps) {
  const [csr2Data, setCsr2Data] = useState<{ mean: number; min: number; max: number; count?: number; acres?: number } | null>(null);

  const form = useForm<PropertyForm>({
    resolver: zodResolver(propertyFormSchema),
    defaultValues: {
      address: "",
      county: "",
      state: "",
      landType: "Irrigated" as const,
      acreage: 0,
      tillableAcres: undefined,
      additionalDetails: "",
      includeImprovements: false,
      improvements: [],
      // Cash rent analysis
      cashRentPerAcre: undefined,
      capRate: 0.03,
      // CSR2 fields
      fieldId: undefined,
      fieldWkt: undefined,
      csr2Mean: undefined,
      csr2Min: undefined,
      csr2Max: undefined,
      csr2Count: undefined,
      latitude: undefined,
      longitude: undefined,
      nonTillableType: undefined,
      ...initialData, // Apply initial data if provided
    },
  });

  // Update form values when initialData changes
  useEffect(() => {
    if (initialData) {
      Object.entries(initialData).forEach(([key, value]) => {
        if (value !== undefined) {
          form.setValue(key as any, value);
        }
      });
      
      // If we have CSR2 data, update the display
      if (initialData.csr2Mean) {
        setCsr2Data({
          mean: initialData.csr2Mean,
          min: initialData.csr2Min || initialData.csr2Mean,
          max: initialData.csr2Max || initialData.csr2Mean,
          count: initialData.csr2Count,
          acres: initialData.acreage
        });
      }
    }
  }, [initialData, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "improvements",
  });

  const watchIncludeImprovements = form.watch("includeImprovements");
  const currentAddress = form.watch("address");

  const handleParcelSelected = useCallback(async (parcelData: any) => {
    // Update form with CSR2 data
    form.setValue("fieldWkt", parcelData.wkt);
    form.setValue("csr2Mean", parcelData.csr2?.mean);
    form.setValue("csr2Min", parcelData.csr2?.min);
    form.setValue("csr2Max", parcelData.csr2?.max);
    form.setValue("csr2Count", parcelData.csr2?.count);
    form.setValue("latitude", parcelData.coordinates[1]);
    form.setValue("longitude", parcelData.coordinates[0]);
    
    // If acres are provided, also update the acreage field
    if (parcelData.acres) {
      form.setValue("acreage", parcelData.acres);
    }
    
    // Update CSR2 display data with acres
    setCsr2Data({
      mean: parcelData.csr2?.mean,
      min: parcelData.csr2?.min,
      max: parcelData.csr2?.max,
      count: parcelData.csr2?.count,
      acres: parcelData.acres
    });
    
    // Reverse geocode to get county and state
    if (parcelData.coordinates && parcelData.coordinates.length === 2) {
      try {
        const response = await fetch("https://web-production-51e54.up.railway.app/api/geocode/reverse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: parcelData.coordinates[1],
            longitude: parcelData.coordinates[0]
          })
        });
        
        const data = await response.json();
        if (data.success && data.county && data.state) {
          form.setValue("county", data.county);
          form.setValue("state", data.state);
        }
      } catch (error) {
        console.error("Failed to reverse geocode:", error);
      }
    }
  }, [form]);

  const handleLocationChange = useCallback((lat: number, lon: number, address?: string) => {
    form.setValue("latitude", lat);
    form.setValue("longitude", lon);
    if (address) {
      form.setValue("address", address);
    }
  }, [form]);

  const getCSR2Color = (score: number): string => {
    if (score >= 80) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (score >= 40) return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const handleSubmit = (data: PropertyForm) => {
    console.log('Form submitted with data:', data);
    onSubmit(data);
  };

  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-6">
        <CardTitle className="flex items-center space-x-3 text-xl font-light">
          <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center">
            <MapPin className="text-white h-5 w-5" />
          </div>
          <span className="text-slate-900">Property Details</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit, (errors) => {
            console.log('Form validation errors:', errors);
          })} className="h-full">
            {/* Two Column Layout - Map Left, Inputs Right */}
            <div className={hideLocationFields ? "space-y-6" : "grid grid-cols-1 lg:grid-cols-3 gap-8 h-full min-h-[700px]"}>
              
              {/* Left Column - Map (2/3 width) - Only show if not hideLocationFields */}
              {!hideLocationFields && (
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center space-x-2">
                    <Map className="h-6 w-6 text-slate-600" />
                    <h3 className="text-lg font-semibold text-slate-900">Interactive Map</h3>
                  </div>
                  <p className="text-sm text-slate-600">Use the map to select your property and analyze soil productivity data</p>
                  
                  {/* Map - Main Focal Point */}
                  <div className="h-[600px] rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                    <MapParcelPicker
                      defaultAddress={currentAddress}
                      onParcelSelected={handleParcelSelected}
                      onLocationChange={handleLocationChange}
                      className="h-full w-full"
                    />
                  </div>

                  {/* CSR2 Results Display */}
                  {(csr2Data || csr2LoadingMessage) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      {csr2LoadingMessage ? (
                        <div className="flex items-center space-x-3">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600"></div>
                          <span className="text-sm text-slate-600">{csr2LoadingMessage}</span>
                        </div>
                      ) : csr2Data && (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-700">Soil Productivity Analysis</span>
                            <Badge className={getCSR2Color(csr2Data.mean)}>
                              CSR2: {csr2Data.mean.toFixed(1)}
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            {csr2Data.acres && (
                              <div className="text-sm font-medium text-slate-800">
                                Area: {csr2Data.acres.toFixed(2)} acres
                              </div>
                            )}
                            <div className="text-xs text-slate-600">
                              Range: {csr2Data.min} - {csr2Data.max} | 
                              {csr2Data.count && `${csr2Data.count} coordinates | `}
                              Rating: {csr2Data.mean >= 80 ? 'Excellent' : csr2Data.mean >= 60 ? 'Good' : csr2Data.mean >= 40 ? 'Fair' : 'Poor'}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Right Column - Property Inputs (1/3 width or full width if no map) */}
              <div className={hideLocationFields ? "space-y-6" : "space-y-6 overflow-y-auto max-h-[700px] pr-2"}>
                <div className="flex items-center space-x-2">
                  <MapPin className="h-5 w-5 text-slate-600" />
                  <h3 className="text-base font-semibold text-slate-900">Property Details</h3>
                </div>

                {/* CSR2 Results Display for parcel-based valuation */}
                {hideLocationFields && (csr2Data || csr2LoadingMessage) && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    {csr2LoadingMessage ? (
                      <div className="flex items-center space-x-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600"></div>
                        <span className="text-sm text-slate-600">{csr2LoadingMessage}</span>
                      </div>
                    ) : csr2Data && (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-700">Soil Productivity Analysis</span>
                          <Badge className={getCSR2Color(csr2Data.mean)}>
                            CSR2: {csr2Data.mean.toFixed(1)}
                          </Badge>
                        </div>
                        <div className="space-y-1">
                          {csr2Data.acres && (
                            <div className="text-sm font-medium text-slate-800">
                              Area: {csr2Data.acres.toFixed(2)} acres
                            </div>
                          )}
                          <div className="text-xs text-slate-600">
                            Range: {csr2Data.min} - {csr2Data.max} | 
                            {csr2Data.count && `${csr2Data.count} coordinates | `}
                            Rating: {csr2Data.mean >= 80 ? 'Excellent' : csr2Data.mean >= 60 ? 'Good' : csr2Data.mean >= 40 ? 'Fair' : 'Poor'}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Property Address - Hide for drawn polygons */}
                {!hideLocationFields && (
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium text-slate-700">Property Address</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Enter full address" 
                            className="h-11 text-sm bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-400 rounded-lg"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                {/* County */}
                <FormField
                  control={form.control}
                  name="county"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">County</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="County name" 
                          className="h-11 text-sm bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-400 rounded-lg"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* State */}
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">State</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 text-sm bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-400 rounded-lg">
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60 bg-white border border-slate-200 shadow-lg rounded-lg">
                          {US_STATES.map((state) => (
                            <SelectItem key={state} value={state} className="text-sm py-2 bg-white hover:bg-slate-50 focus:bg-slate-50">
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Land Type */}
                <FormField
                  control={form.control}
                  name="landType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">Land Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 text-sm bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-400 rounded-lg">
                            <SelectValue placeholder="Select land type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-white border border-slate-200 shadow-lg rounded-lg">
                          <SelectItem value="Irrigated" className="text-sm py-2 bg-white hover:bg-slate-50 focus:bg-slate-50">
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              <span>Irrigated</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Dryland" className="text-sm py-2 bg-white hover:bg-slate-50 focus:bg-slate-50">
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                              <span>Dryland</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Pasture" className="text-sm py-2 bg-white hover:bg-slate-50 focus:bg-slate-50">
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span>Pasture</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="CRP" className="text-sm py-2 bg-white hover:bg-slate-50 focus:bg-slate-50">
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                              <span>CRP</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Total Acreage */}
                <FormField
                  control={form.control}
                  name="acreage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">Total Acreage</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          inputMode="decimal"
                          placeholder="Enter acreage" 
                          className="h-11 text-sm bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-400 rounded-lg"
                          value={field.value === 0 ? "" : field.value}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(value === "" ? 0 : parseFloat(value) || 0);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tillable Acres */}
                <FormField
                  control={form.control}
                  name="tillableAcres"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">Tillable Acres (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          inputMode="decimal"
                          placeholder="e.g. 152" 
                          className="h-11 text-sm bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-400 rounded-lg"
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(value === "" ? undefined : parseFloat(value) || undefined);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Non-Tillable Land Type */}
                <FormField
                  control={form.control}
                  name="nonTillableType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">Non-Tillable Land Type (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11 text-sm bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-400 rounded-lg">
                            <SelectValue placeholder="Select type if applicable" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-white border border-slate-200 shadow-lg rounded-lg">
                          <SelectItem value="CRP" className="text-sm py-2 bg-white hover:bg-slate-50 focus:bg-slate-50">
                            <div className="flex items-center justify-between w-full">
                              <span>CRP</span>
                              <span className="text-xs text-slate-500 ml-2">65% of base value</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Timber" className="text-sm py-2 bg-white hover:bg-slate-50 focus:bg-slate-50">
                            <div className="flex items-center justify-between w-full">
                              <span>Timber</span>
                              <span className="text-xs text-slate-500 ml-2">55% of base value</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="Other" className="text-sm py-2 bg-white hover:bg-slate-50 focus:bg-slate-50">
                            <div className="flex items-center justify-between w-full">
                              <span>Other</span>
                              <span className="text-xs text-slate-500 ml-2">20% of base value</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Cash Rent Analysis */}
                <FormField
                  control={form.control}
                  name="cashRentPerAcre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">Cash Rent per Acre (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          max="1000"
                          placeholder=""
                          className="h-11 text-sm bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-400 rounded-lg"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Property Improvements Toggle */}
                <FormField
                  control={form.control}
                  name="includeImprovements"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border border-slate-200 p-3 bg-slate-50">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm font-medium text-slate-900 flex items-center space-x-2">
                          <Building2 className="h-4 w-4 text-slate-600" />
                          <span>Property Improvements</span>
                        </FormLabel>
                        <div className="text-xs text-slate-600">
                          Include buildings and infrastructure
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                {/* Property Improvements Section - Show when toggle is on */}
                {form.watch("includeImprovements") && (
                  <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-slate-900">Add Improvements</h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentImprovements = form.getValues("improvements") || [];
                          form.setValue("improvements", [
                            ...currentImprovements,
                            { type: "Building", description: "", manualValue: 0, valuationMethod: "manual" }
                          ]);
                        }}
                        className="h-8 text-xs"
                      >
                        <PlusCircle className="h-3 w-3 mr-1" />
                        Add Improvement
                      </Button>
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="improvements"
                      render={({ field }) => (
                        <div className="space-y-3">
                          {(field.value || []).map((improvement, index) => (
                            <div key={index} className="p-3 bg-white rounded-md border border-slate-200 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-slate-700">Improvement {index + 1}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const updatedImprovements = field.value.filter((_, i) => i !== index);
                                    form.setValue("improvements", updatedImprovements);
                                  }}
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs font-medium text-slate-600">Type</label>
                                  <Select
                                    value={improvement.type}
                                    onValueChange={(value) => {
                                      const updatedImprovements = [...field.value];
                                      updatedImprovements[index].type = value;
                                      form.setValue("improvements", updatedImprovements);
                                    }}
                                  >
                                    <SelectTrigger className="h-9 text-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white">
                                      <SelectItem value="Building">Building</SelectItem>
                                      <SelectItem value="Grain Storage">Grain Storage</SelectItem>
                                      <SelectItem value="Infrastructure">Infrastructure</SelectItem>
                                      <SelectItem value="Other">Other</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                
                                <div>
                                  <label className="text-xs font-medium text-slate-600">Valuation Method</label>
                                  <Select
                                    value={improvement.valuationMethod}
                                    onValueChange={(value) => {
                                      const updatedImprovements = [...field.value];
                                      updatedImprovements[index].valuationMethod = value as "ai" | "manual";
                                      form.setValue("improvements", updatedImprovements);
                                    }}
                                  >
                                    <SelectTrigger className="h-9 text-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-white">
                                      <SelectItem value="manual">Manual Entry</SelectItem>
                                      <SelectItem value="ai">AI Estimate</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              
                              <div>
                                <label className="text-xs font-medium text-slate-600">Description</label>
                                <Input
                                  type="text"
                                  placeholder="e.g., 40x60 metal shop, 10,000 bu grain bin"
                                  className="h-9 text-sm"
                                  value={improvement.description}
                                  onChange={(e) => {
                                    const updatedImprovements = [...field.value];
                                    updatedImprovements[index].description = e.target.value;
                                    form.setValue("improvements", updatedImprovements);
                                  }}
                                />
                              </div>
                              
                              {improvement.valuationMethod === "manual" && (
                                <div>
                                  <label className="text-xs font-medium text-slate-600">Estimated Value ($)</label>
                                  <Input
                                    type="number"
                                    placeholder="0"
                                    className="h-9 text-sm"
                                    value={improvement.manualValue || ""}
                                    onChange={(e) => {
                                      const updatedImprovements = [...field.value];
                                      updatedImprovements[index].manualValue = parseFloat(e.target.value) || 0;
                                      form.setValue("improvements", updatedImprovements);
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                          
                          {(!field.value || field.value.length === 0) && (
                            <p className="text-sm text-slate-500 text-center py-2">
                              No improvements added yet. Click "Add Improvement" to begin.
                            </p>
                          )}
                        </div>
                      )}
                    />
                  </div>
                )}
                
                {/* Additional Details */}
                <FormField
                  control={form.control}
                  name="additionalDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-slate-700">Additional Details (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          rows={3}
                          placeholder="Special features, terrain, access..."
                          className="text-sm bg-white border-slate-200 focus:border-slate-400 focus:ring-slate-400 rounded-lg resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Submit Button */}
                <Button 
                  type="submit" 
                  className="w-full h-12 bg-[#1e323be8] text-[#fffcfc] text-sm font-medium hover:bg-slate-800 transition-all duration-200 rounded-lg"
                  disabled={isLoading || !!csr2LoadingMessage}
                >
                  <Calculator className="mr-2 h-4 w-4" />
                  {isLoading ? "Starting AI Valuation..." : csr2LoadingMessage ? csr2LoadingMessage : "Start AI Valuation"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
