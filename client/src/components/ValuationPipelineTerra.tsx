import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  MapPin,
  Database,
  Brain,
  Search,
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface PipelineStep {
  id: string;
  title: string;
  subtitle: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface ValuationPipelineTerraProps {
  currentStep?: string;
  status?: string;
  showDetails?: boolean;
  className?: string;
}

// Rotating messages for each step
const STEP_MESSAGES = {
  input: ['Validating property data', 'Preparing coordinates', 'Checking field boundaries'],
  vector: ['Searching Iowa soil database', 'Retrieving CSR2 values', 'Analyzing county records', 'Processing land data'],
  analysis: ['Running AI valuation', 'Calculating market value', 'Applying adjustments', 'Processing soil factors'],
  research: ['Finding comparable sales', 'Analyzing market trends', 'Reviewing recent auctions', 'Compiling insights'],
  report: ['Generating report', 'Formatting results', 'Preparing summary'],
};

export function ValuationPipelineTerra({
  currentStep = 'input',
  status = 'pending',
  showDetails = true,
  className = '',
}: ValuationPipelineTerraProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime] = useState(Date.now());
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (status === 'processing') {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [status, startTime]);

  useEffect(() => {
    if (status === 'processing') {
      const interval = setInterval(() => {
        setMessageIndex((prev) => (prev + 1) % 4);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const steps: PipelineStep[] = [
    {
      id: 'input',
      title: 'Property Data',
      subtitle: status === 'processing' && currentStep === 'input'
        ? STEP_MESSAGES.input[messageIndex % 3]
        : 'Complete',
      description: 'Location & field data',
      icon: MapPin,
      status: status === 'processing' && currentStep === 'input' ? 'processing' : 'completed',
    },
    {
      id: 'vector',
      title: 'Soil Analysis',
      subtitle: currentStep === 'vector' && status === 'processing'
        ? STEP_MESSAGES.vector[messageIndex]
        : !['input', 'vector'].includes(currentStep) || status === 'completed'
        ? 'Complete'
        : 'Waiting',
      description: 'CSR2 & county data',
      icon: Database,
      status: currentStep === 'vector' && status === 'processing'
        ? 'processing'
        : status === 'processing' && currentStep === 'input'
        ? 'pending'
        : !['input', 'vector'].includes(currentStep) || status === 'completed'
        ? 'completed'
        : 'pending',
    },
    {
      id: 'analysis',
      title: 'AI Valuation',
      subtitle: currentStep === 'analysis'
        ? STEP_MESSAGES.analysis[messageIndex]
        : ['input', 'vector'].includes(currentStep)
        ? 'Waiting'
        : 'Complete',
      description: 'Multi-method analysis',
      icon: Brain,
      status: ['input', 'vector'].includes(currentStep)
        ? 'pending'
        : currentStep === 'analysis'
        ? 'processing'
        : 'completed',
    },
    {
      id: 'research',
      title: 'Market Research',
      subtitle: currentStep === 'research'
        ? STEP_MESSAGES.research[messageIndex]
        : ['input', 'vector', 'analysis'].includes(currentStep)
        ? 'Waiting'
        : 'Complete',
      description: 'Comparable sales',
      icon: Search,
      status: ['input', 'vector', 'analysis'].includes(currentStep)
        ? 'pending'
        : currentStep === 'research'
        ? 'processing'
        : 'completed',
    },
    {
      id: 'report',
      title: 'Final Report',
      subtitle: currentStep === 'report'
        ? STEP_MESSAGES.report[messageIndex % 3]
        : status === 'completed'
        ? 'Ready'
        : 'Waiting',
      description: 'Complete valuation',
      icon: FileText,
      status: status === 'completed'
        ? 'completed'
        : currentStep === 'report'
        ? 'processing'
        : 'pending',
    },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);
  const progressPercent = status === 'completed'
    ? 100
    : ((currentStepIndex + (status === 'processing' ? 0.5 : 0)) / (steps.length - 1)) * 100;

  return (
    <div className={cn('bg-white rounded-xl border border-warm-200 shadow-terra overflow-hidden', className)}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-warm-100 bg-gradient-to-r from-warm-50 to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-field/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-field" />
            </div>
            <div>
              <h3 className="font-semibold text-terra-black">Valuation Pipeline</h3>
              <p className="text-xs text-warm-500">AI-powered property analysis</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {status === 'processing' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gold/10 border border-gold/20"
              >
                <Loader2 className="h-4 w-4 text-gold animate-spin" />
                <span className="text-sm font-mono font-medium text-gold-dark">
                  {formatTime(elapsedTime)}
                </span>
              </motion.div>
            )}
            {status === 'completed' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-field/10 border border-field/20"
              >
                <CheckCircle2 className="h-4 w-4 text-field" />
                <span className="text-sm font-medium text-field">
                  Complete ({formatTime(elapsedTime)})
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Progress Bar */}
        {status === 'processing' && (
          <div className="mt-4">
            <div className="h-1.5 bg-warm-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-field via-field-spring to-gold rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progressPercent, 95)}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Pipeline Content */}
      <div className="p-6">
        {/* Desktop: Horizontal Layout */}
        <div className="hidden md:block">
          <div className="relative">
            {/* Connection Line */}
            <div className="absolute top-7 left-7 right-7 h-0.5 bg-warm-200" />
            <motion.div
              className="absolute top-7 left-7 h-0.5 bg-field"
              initial={{ width: 0 }}
              animate={{
                width: `calc(${Math.min(progressPercent, 100)}% - 56px)`,
              }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />

            {/* Steps */}
            <div className="relative flex justify-between">
              {steps.map((step, index) => (
                <StepItem
                  key={step.id}
                  step={step}
                  index={index}
                  showDetails={showDetails}
                  isHorizontal
                />
              ))}
            </div>
          </div>
        </div>

        {/* Mobile: Vertical Layout */}
        <div className="md:hidden space-y-1">
          {steps.map((step, index) => (
            <div key={step.id} className="relative">
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'absolute left-5 top-14 w-0.5 h-8',
                    step.status === 'completed' ? 'bg-field' :
                    step.status === 'processing' ? 'bg-gold' :
                    'bg-warm-200'
                  )}
                />
              )}
              <StepItem
                step={step}
                index={index}
                showDetails={showDetails}
                isHorizontal={false}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Footer Note */}
      <div className="px-6 py-3 bg-warm-50 border-t border-warm-100">
        <p className="text-xs text-warm-500 text-center">
          {status === 'processing'
            ? 'Analysis typically completes within 2 minutes'
            : status === 'completed'
            ? 'Your valuation report is ready for review'
            : 'Ready to begin property analysis'}
        </p>
      </div>
    </div>
  );
}

// Individual step component
function StepItem({
  step,
  index,
  showDetails,
  isHorizontal,
}: {
  step: PipelineStep;
  index: number;
  showDetails: boolean;
  isHorizontal: boolean;
}) {
  const Icon = step.icon;
  const isProcessing = step.status === 'processing';
  const isCompleted = step.status === 'completed';
  const isPending = step.status === 'pending';

  const iconContainerClasses = cn(
    'relative w-14 h-14 rounded-xl flex items-center justify-center transition-all duration-500',
    isCompleted && 'bg-field text-wheat-cream shadow-terra',
    isProcessing && 'bg-gold/20 text-gold border-2 border-gold shadow-gold-glow',
    isPending && 'bg-warm-100 text-warm-400 border border-warm-200'
  );

  if (isHorizontal) {
    return (
      <div className="flex flex-col items-center">
        <motion.div
          className={iconContainerClasses}
          animate={isProcessing ? {
            scale: [1, 1.05, 1],
            boxShadow: [
              '0 0 0 0 rgba(212, 160, 60, 0.4)',
              '0 0 20px 10px rgba(212, 160, 60, 0.1)',
              '0 0 0 0 rgba(212, 160, 60, 0.4)',
            ],
          } : {}}
          transition={isProcessing ? {
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          } : {}}
        >
          {isProcessing ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <Icon className="w-6 h-6" />
          )}

          {/* Completion Badge */}
          {isCompleted && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-terra"
            >
              <CheckCircle2 className="w-4 h-4 text-field" />
            </motion.div>
          )}
        </motion.div>

        <div className="mt-3 text-center">
          <p className={cn(
            'text-sm font-semibold transition-colors duration-300',
            isCompleted && 'text-field',
            isProcessing && 'text-gold-dark',
            isPending && 'text-warm-400'
          )}>
            {step.title}
          </p>

          <AnimatePresence mode="wait">
            <motion.p
              key={step.subtitle}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className={cn(
                'text-xs mt-1 max-w-[100px]',
                isProcessing ? 'text-gold font-medium' :
                isCompleted ? 'text-field' :
                'text-warm-400'
              )}
            >
              {step.subtitle}
            </motion.p>
          </AnimatePresence>

          {showDetails && step.description && isPending && (
            <p className="text-[10px] text-warm-400 mt-1">{step.description}</p>
          )}
        </div>
      </div>
    );
  }

  // Vertical layout for mobile
  return (
    <div className="flex items-start gap-4 py-3">
      <motion.div
        className={cn(iconContainerClasses, 'w-10 h-10')}
        animate={isProcessing ? { scale: [1, 1.1, 1] } : {}}
        transition={isProcessing ? { duration: 1.5, repeat: Infinity } : {}}
      >
        {isProcessing ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Icon className="w-5 h-5" />
        )}

        {isCompleted && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm">
            <CheckCircle2 className="w-3 h-3 text-field" />
          </div>
        )}
      </motion.div>

      <div className="flex-1 pt-1">
        <p className={cn(
          'text-sm font-semibold',
          isCompleted && 'text-field',
          isProcessing && 'text-gold-dark',
          isPending && 'text-warm-400'
        )}>
          {step.title}
        </p>
        <AnimatePresence mode="wait">
          <motion.p
            key={step.subtitle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
              'text-xs mt-0.5',
              isProcessing ? 'text-gold font-medium' : 'text-warm-500'
            )}
          >
            {step.subtitle}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default ValuationPipelineTerra;
