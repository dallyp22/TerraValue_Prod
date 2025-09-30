import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Search, Clock, CheckCircle, Loader2 } from "lucide-react";
import type { Valuation } from "@shared/schema";

interface AnalysisResultsProps {
  valuation?: Valuation;
}

export function AnalysisResults({ valuation }: AnalysisResultsProps) {
  const isProcessing = valuation?.status === "processing";
  const isCompleted = valuation?.status === "completed";
  const hasFailed = valuation?.status === "failed";

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* AI Reasoning Card - Minimalist */}
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-6">
          <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center">
                <Brain className="text-white h-5 w-5" />
              </div>
              <span className="text-xl font-light text-slate-900">AI Analysis</span>
            </div>
            <Badge 
              variant={isCompleted ? "default" : isProcessing ? "secondary" : "outline"}
              className="self-start sm:self-auto"
            >
              {isCompleted ? (
                <>
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Complete
                </>
              ) : isProcessing ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Processing
                </>
              ) : (
                <>
                  <Clock className="mr-1 h-3 w-3" />
                  Pending
                </>
              )}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <h4 className="font-medium text-slate-900 mb-4 text-base tracking-wide">Property Analysis</h4>
            <div className="text-sm text-slate-700 space-y-4 font-light">
              {valuation?.aiReasoning ? (
                <p className="leading-relaxed">{valuation.aiReasoning}</p>
              ) : isProcessing ? (
                <div className="flex items-center space-x-3">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  <span>AI is analyzing property features and market conditions...</span>
                </div>
              ) : (
                <p className="text-slate-500">Waiting for property analysis to begin...</p>
              )}
              
              {(valuation?.baseValue || valuation?.breakdown?.csr2Value) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                  {valuation?.baseValue && (
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
                      <div className="text-xs font-medium text-amber-700 mb-2 tracking-wide uppercase">Base County Value</div>
                      <div className="text-lg font-light text-amber-900">${valuation.baseValue.toLocaleString()}/acre</div>
                    </div>
                  )}
                  
                  {valuation?.breakdown?.csr2Value && (
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
                      <div className="text-xs font-medium text-green-700 mb-2 tracking-wide uppercase">CSR2 Quantitative</div>
                      <div className="text-lg font-light text-green-900">${Math.round(valuation.breakdown.csr2Value).toLocaleString()}/acre</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Market Research Card - Minimalist */}
      <Card className="border border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-6">
          <CardTitle className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center">
                <Search className="text-white h-5 w-5" />
              </div>
              <span className="text-xl font-light text-slate-900">Market Intelligence</span>
            </div>
            <Badge 
              variant={valuation?.marketInsight ? "default" : "outline"}
              className="self-start sm:self-auto"
            >
              {valuation?.marketInsight ? (
                <>
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Complete
                </>
              ) : isProcessing ? (
                "Queued"
              ) : (
                "Pending"
              )}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            {valuation?.marketInsight ? (
              <div>
                <h4 className="font-medium text-slate-900 mb-4 text-base tracking-wide">Market Analysis</h4>
                <p className="text-sm text-slate-700 leading-relaxed font-light">{valuation.marketInsight}</p>
                
                {valuation?.adjustedValue && (
                  <div className="mt-6">
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                      <div className="text-xs font-medium text-blue-700 mb-2 tracking-wide uppercase">AI Market-Adjusted Value</div>
                      <div className="text-lg font-light text-blue-900">${valuation.adjustedValue.toLocaleString()}/acre</div>
                      <div className="text-xs text-blue-600 mt-1">Based on market comps and analysis</div>
                    </div>
                  </div>
                )}
              </div>
            ) : isProcessing ? (
              <div className="flex items-center space-x-3 text-sm text-slate-700 font-light">
                <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                <span>Researching current market conditions and regional trends...</span>
              </div>
            ) : (
              <div className="flex items-center space-x-3 text-sm text-slate-500 font-light">
                <Clock className="h-4 w-4" />
                <span>Waiting for AI reasoning to complete before initiating market research.</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
