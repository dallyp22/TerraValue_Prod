import { ValuationPipeline } from './valuation-pipeline';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Valuation } from '@shared/schema';

interface ValuationPipelineOverlayProps {
  data: Valuation;
  onClose: () => void;
}

export default function ValuationPipelineOverlay({ data, onClose }: ValuationPipelineOverlayProps) {
  const getCurrentStep = () => {
    if (!data) return "input";
    
    switch (data.status) {
      case "processing":
        // Show property input as processing for the first 2 seconds
        const processingTime = data.createdAt ? 
          (Date.now() - new Date(data.createdAt).getTime()) / 1000 : 0;
        
        if (processingTime < 2 && !data.baseValue) {
          return "input";
        } else if (data.baseValue && data.aiReasoning && data.marketInsight) {
          return "report";
        } else if (data.baseValue && data.aiReasoning) {
          return "research";
        } else if (data.baseValue) {
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

  return (
    <div className="fixed top-2 sm:top-20 left-1/2 transform -translate-x-1/2 z-50 w-[calc(100%-1rem)] sm:w-full max-w-5xl bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-3 sm:p-6 transition-all duration-300 animate-slide-in-top">
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1" />
        <Button 
          onClick={onClose} 
          variant="ghost" 
          size="icon"
          className="rounded-full hover:bg-slate-100 -mt-2 -mr-2"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <ValuationPipeline 
        currentStep={getCurrentStep()} 
        status={data.status}
        showDetails={true}
      />
    </div>
  );
}