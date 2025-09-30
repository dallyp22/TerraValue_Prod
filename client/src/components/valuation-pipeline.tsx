import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Edit, Database, Brain, Search, FileText, Loader2, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface PipelineStep {
  id: string;
  title: string;
  subtitle: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "pending" | "processing" | "completed" | "failed";
  estimatedTime?: string;
}

interface ValuationPipelineProps {
  currentStep?: string;
  status?: string;
  showDetails?: boolean;
}

export function ValuationPipeline({ currentStep = "input", status = "pending", showDetails = true }: ValuationPipelineProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime] = useState(Date.now());
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (status === "processing") {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [status, startTime]);

  // Animated dots for loading states
  useEffect(() => {
    if (status === "processing") {
      const dotsInterval = setInterval(() => {
        setDots(prev => prev.length >= 3 ? "" : prev + ".");
      }, 500);
      return () => clearInterval(dotsInterval);
    }
  }, [status]);
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Rotating messages for different steps
  const vectorMessages = [
    "Searching agricultural database",
    "Analyzing county data", 
    "Retrieving base values",
    "Processing land records"
  ];

  const analysisMessages = [
    "Running AI valuation",
    "Processing market data",
    "Analyzing comparables",
    "Calculating values"
  ];

  const researchMessages = [
    "Finding comparable sales",
    "Analyzing market trends",
    "Fetching recent data",
    "Compiling insights"
  ];
  
  const [messageIndex, setMessageIndex] = useState(0);
  
  useEffect(() => {
    if (status === "processing") {
      const interval = setInterval(() => {
        setMessageIndex(prev => (prev + 1) % 4);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [status]);

  const steps: PipelineStep[] = [
    {
      id: "input",
      title: "Property Input",
      subtitle: status === "processing" && currentStep === "input" ? "Processing..." : "Complete",
      description: "Property data collected",
      icon: Edit,
      status: status === "processing" && currentStep === "input" ? "processing" : "completed",
      estimatedTime: "~5s"
    },
    {
      id: "vector",
      title: "Vector Store",
      subtitle: currentStep === "vector" && status === "processing" ? `${vectorMessages[messageIndex]}${dots}` : (status === "processing" && currentStep === "input") ? "Waiting" : !["input", "vector"].includes(currentStep) || status === "completed" ? "Complete" : "Waiting",
      description: currentStep === "vector" && status === "processing" ? "Retrieving county base value" : !["input", "vector"].includes(currentStep) || status === "completed" ? "County base value retrieved" : "County base value",
      icon: Database,
      status: currentStep === "vector" && status === "processing" ? "processing" : (status === "processing" && currentStep === "input") ? "pending" : !["input", "vector"].includes(currentStep) || status === "completed" ? "completed" : "pending",
      estimatedTime: "~10s"
    },
    {
      id: "analysis",
      title: "AI Analysis",
      subtitle: currentStep === "analysis" ? `${analysisMessages[messageIndex]}${dots}` : ["input", "vector"].includes(currentStep) ? "Waiting" : "Complete",
      description: currentStep === "analysis" ? "Running parallel operations" : "AI valuation complete",
      icon: Brain,
      status: ["input", "vector"].includes(currentStep) ? "pending" : currentStep === "analysis" ? "processing" : "completed",
      estimatedTime: "~15s"
    },
    {
      id: "research",
      title: "Market Research",
      subtitle: currentStep === "research" ? `${researchMessages[messageIndex]}${dots}` : ["input", "vector", "analysis"].includes(currentStep) ? "Waiting" : "Complete",
      description: currentStep === "research" ? "Finding comparable sales" : "Market analysis complete",
      icon: Search,
      status: ["input", "vector", "analysis"].includes(currentStep) ? "pending" : currentStep === "research" ? "processing" : "completed",
      estimatedTime: "~10s"
    },
    {
      id: "report",
      title: "Final Report",
      subtitle: currentStep === "report" ? "Generating..." : status === "completed" ? "Ready" : "Waiting",
      description: status === "completed" ? "Valuation complete!" : "Preparing final report",
      icon: FileText,
      status: status === "completed" ? "completed" : currentStep === "report" ? "processing" : "pending",
      estimatedTime: "~5s"
    }
  ];

  const getStepColor = (stepStatus: string, stepId: string) => {
    switch (stepStatus) {
      case "completed":
        return "bg-green-600 text-white border-green-600";
      case "processing":
        if (stepId === "input") {
          return "bg-green-600 text-white border-green-600 animate-pulse shadow-lg shadow-green-500/50";
        }
        if (stepId === "vector") {
          return "bg-blue-600 text-white border-blue-600 animate-pulse shadow-lg shadow-blue-500/50";
        }
        return "bg-blue-600 text-white border-blue-600 animate-pulse shadow-lg shadow-blue-500/50";
      case "failed":
        return "bg-red-500 text-white border-red-500";
      default:
        return "bg-white text-slate-500 border-slate-300";
    }
  };

  const getConnectorColor = (index: number) => {
    const currentStep = steps[index];
    const nextStep = steps[index + 1];
    
    if (currentStep?.status === "completed") {
      return "bg-gradient-to-r from-green-600 to-green-400";
    } else if (currentStep?.status === "processing") {
      return "bg-gradient-to-r from-blue-600 to-blue-400 animate-pulse shadow-lg shadow-blue-500/30";
    }
    return "bg-slate-200";
  };

  const getStatusIcon = (stepStatus: string) => {
    switch (stepStatus) {
      case "completed":
        return CheckCircle2;
      case "processing":
        return Loader2;
      case "failed":
        return AlertCircle;
      default:
        return Clock;
    }
  };

  const processingStepIndex = steps.findIndex(step => step.status === "processing");
  const totalEstimatedTime = 45; // seconds

  return (
    <Card className="border border-slate-200 bg-white shadow-lg">
      <CardHeader className="pb-4 sm:pb-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
          <CardTitle className="text-lg sm:text-xl font-semibold text-slate-900 text-center">
            Valuation Pipeline Status - Process can take up to 2 minutes
          </CardTitle>
          {status === "processing" && (
            <div className="flex items-center gap-2 text-sm text-blue-600 font-medium animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-semibold">Processing... {formatTime(elapsedTime)}</span>
            </div>
          )}
          {status === "completed" && (
            <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              <span>Completed in {formatTime(elapsedTime)}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Progress Bar */}
        {status === "processing" && (
          <div className="mb-6">
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-500 animate-pulse"
                style={{ width: `${Math.min((elapsedTime / totalEstimatedTime) * 100, 95)}%` }}
              />
            </div>
            <p className="text-xs text-slate-600 mt-2 text-center">
              Estimated time remaining: {Math.max(0, totalEstimatedTime - elapsedTime)}s
            </p>
          </div>
        )}

        {/* Mobile: Vertical Layout */}
        <div className="block sm:hidden space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const StatusIcon = getStatusIcon(step.status);
            const isProcessing = step.status === "processing";
            
            return (
              <div key={step.id} className="relative">
                {index < steps.length - 1 && (
                  <div className={cn(
                    "absolute left-6 top-12 w-0.5 h-12",
                    step.status === "completed" ? "bg-green-400" : 
                    step.status === "processing" ? "bg-blue-400 animate-pulse" : 
                    "bg-slate-200"
                  )} />
                )}
                <div className="flex items-start space-x-4">
                  <div className="relative">
                    <div className={cn(
                      "w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                      getStepColor(step.status, step.id)
                    )}>
                      {isProcessing ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    {step.status === "completed" && (
                      <CheckCircle2 className="absolute -top-1 -right-1 h-4 w-4 text-green-600 bg-white rounded-full" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900">{step.title}</div>
                    <div className={cn(
                      "text-sm font-medium",
                      step.status === "processing" ? "text-blue-600" : 
                      step.status === "completed" ? "text-green-600" : 
                      "text-slate-500"
                    )}>
                      {step.subtitle}
                    </div>
                    {showDetails && step.description && (
                      <div className="text-xs text-slate-600 mt-1">{step.description}</div>
                    )}
                    {step.estimatedTime && step.status === "pending" && (
                      <div className="text-xs text-slate-400 mt-1">{step.estimatedTime}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: Horizontal Layout */}
        <div className="hidden sm:flex items-center justify-between relative">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isProcessing = step.status === "processing";
            
            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center text-center relative">
                  <div className="relative">
                    <div className={cn(
                      "w-14 h-14 lg:w-16 lg:h-16 rounded-full border-2 flex items-center justify-center mb-3 transition-all duration-300",
                      getStepColor(step.status, step.id),
                      isProcessing && "scale-110"
                    )}>
                      {isProcessing ? (
                        <Loader2 className="h-6 w-6 lg:h-7 lg:w-7 animate-spin" />
                      ) : (
                        <Icon className="h-6 w-6 lg:h-7 lg:w-7" />
                      )}
                    </div>
                    {step.status === "completed" && (
                      <CheckCircle2 className="absolute -top-1 -right-1 h-5 w-5 text-green-600 bg-white rounded-full" />
                    )}
                  </div>
                  <span className="text-sm lg:text-base font-semibold text-slate-900 mb-1">
                    {step.title}
                  </span>
                  <span className={cn(
                    "text-xs lg:text-sm font-medium",
                    step.status === "processing" ? "text-blue-600" : 
                    step.status === "completed" ? "text-green-600" : 
                    "text-slate-500"
                  )}>
                    {step.subtitle}
                  </span>
                  {showDetails && step.description && (
                    <span className="text-xs text-slate-600 mt-1 max-w-[120px]">
                      {step.description}
                    </span>
                  )}
                  {step.estimatedTime && step.status === "pending" && (
                    <span className="text-xs text-slate-400 mt-1">{step.estimatedTime}</span>
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div className="flex-1 px-2">
                    <div className={cn(
                      "h-1 rounded-full transition-all duration-500",
                      getConnectorColor(index)
                    )} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
