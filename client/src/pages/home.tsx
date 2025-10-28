import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { PropertyForm } from "@/components/property-form";
import { ValuationPipeline } from "@/components/valuation-pipeline";
import { AnalysisResults } from "@/components/analysis-results";
import { ValuationReport } from "@/components/valuation-report";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Database, CheckCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PropertyForm as PropertyFormData, Valuation } from "@shared/schema";

export default function Home() {
  const [currentValuationId, setCurrentValuationId] = useState<number | null>(null);
  const { toast } = useToast();

  // Start valuation mutation
  const startValuationMutation = useMutation({
    mutationFn: async (data: PropertyFormData) => {
      const response = await apiRequest("POST", "/api/valuations", data);
      return response.json();
    },
    onSuccess: (data) => {
      setCurrentValuationId(data.valuationId);
      toast({
        title: "Valuation Started",
        description: "AI analysis pipeline has been initiated for your property.",
      });
      // Start polling for updates
      queryClient.invalidateQueries({ queryKey: ["/api/valuations"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start valuation process",
        variant: "destructive",
      });
    },
  });

  // Get current valuation data with smart polling
  const { data: currentValuation, isLoading } = useQuery<{ success: boolean; valuation: Valuation }>({
    queryKey: currentValuationId ? ['/api/valuations', currentValuationId] : ['/api/valuations'],
    queryFn: currentValuationId ? async () => {
      const response = await fetch(`https://web-production-51e54.up.railway.app/api/valuations/${currentValuationId}`);
      return response.json();
    } : undefined,
    enabled: !!currentValuationId,
    refetchInterval: (query) => {
      // Only poll if we have a valuation ID and it's still processing
      if (!currentValuationId) return false;
      const status = query.state.data?.valuation?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 2000; // Poll every 2 seconds while processing
    },
    refetchIntervalInBackground: true,
  });

  const valuation = currentValuation?.valuation;

  const getCurrentStep = () => {
    if (!valuation) return "input";
    
    switch (valuation.status) {
      case "processing":
        // Show property input as processing for the first 2 seconds
        const processingTime = valuation.createdAt ? 
          (Date.now() - new Date(valuation.createdAt).getTime()) / 1000 : 0;
        
        if (processingTime < 2 && !valuation.baseValue) {
          return "input";
        } else if (valuation.baseValue && valuation.aiReasoning && valuation.marketInsight) {
          return "report";
        } else if (valuation.baseValue && valuation.aiReasoning) {
          return "research";
        } else if (valuation.baseValue) {
          return "analysis";
        } else {
          return "vector";
        }
      case "completed":
        return "report";
      default:
        return "input";
    }
  };

  const handlePropertySubmit = (data: PropertyFormData) => {
    startValuationMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-12 max-w-7xl">
        {/* Hero Section - Minimalist */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-light text-slate-900 mb-4 sm:mb-6 tracking-tight">
            AI-Powered Land Valuation
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto font-light leading-relaxed">
            Professional agricultural land valuations using advanced AI and authentic market data
          </p>
        </div>

        {/* Pipeline Status - Mobile First */}
        <div className="mb-6 sm:mb-8">
          <ValuationPipeline 
            currentStep={getCurrentStep()} 
            status={valuation?.status}
          />
        </div>

        {/* Full Width Layout */}
        <div className="space-y-6">
          {/* Property Details Card - Full width */}
          <div className="space-y-4 sm:space-y-6">
            <PropertyForm 
              onSubmit={handlePropertySubmit}
              isLoading={startValuationMutation.isPending}
            />
            
            {/* Vector Store Result */}
            {valuation?.baseValue && (
              <Card className="border-green-200 bg-green-50/50">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center space-x-2 text-base sm:text-lg">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-500 rounded-lg flex items-center justify-center">
                      <Database className="text-white h-3 w-3 sm:h-4 sm:w-4" />
                    </div>
                    <span>Base Value Found</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="bg-white border border-green-200 rounded-lg p-3 sm:p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <CheckCircle className="text-green-600 h-4 w-4" />
                      <span className="text-xs sm:text-sm font-medium text-green-800">Authentic Data Retrieved</span>
                    </div>
                    <p className="text-sm sm:text-base text-green-700">
                      <span className="font-semibold text-lg sm:text-xl">${valuation.baseValue.toLocaleString()}/acre</span>
                    </p>
                    <p className="text-xs sm:text-sm text-green-600 mt-1">
                      {valuation.landType} land in {valuation.county} County, {valuation.state}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Analysis Results under Property Details */}
            <AnalysisResults valuation={valuation} />
          </div>

          {/* Valuation Report - Full width below Property Details */}
          <div className="space-y-4 sm:space-y-6">
            <ValuationReport valuation={valuation} />
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
