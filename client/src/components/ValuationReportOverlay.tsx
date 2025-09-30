import { ValuationReport } from './valuation-report';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Valuation } from '@shared/schema';

interface ValuationReportOverlayProps {
  data: Valuation;
  onClose: () => void;
}

export default function ValuationReportOverlay({ data, onClose }: ValuationReportOverlayProps) {
  return (
    <div 
      className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="absolute inset-2 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:transform sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-4xl sm:h-[calc(100vh-4rem)] bg-white rounded-xl shadow-2xl overflow-hidden transition-all duration-300 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-800">Valuation Report</h2>
          <Button 
            onClick={onClose} 
            variant="ghost" 
            size="icon"
            className="rounded-full hover:bg-slate-100 touch-target"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto h-[calc(100%-4rem)] sm:h-[calc(100%-5rem)]">
          <ValuationReport valuation={data} />
          <div className="mt-6 flex justify-center">
            <Button 
              onClick={onClose}
              className="bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white px-6 sm:px-8 py-2"
            >
              Close Report
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}