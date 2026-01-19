import { cn } from '@/lib/utils';
import { Check, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface FormStep {
  id: string;
  title: string;
  shortTitle?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface FormStepperProps {
  steps: FormStep[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
  allowNavigation?: boolean;
  className?: string;
}

export function FormStepper({
  steps,
  currentStep,
  onStepClick,
  allowNavigation = false,
  className = '',
}: FormStepperProps) {
  return (
    <div className={cn('w-full', className)}>
      {/* Desktop Stepper */}
      <div className="hidden md:flex items-center justify-between relative">
        {/* Background Track */}
        <div className="absolute left-0 right-0 top-5 h-0.5 bg-warm-200" />

        {/* Progress Track */}
        <motion.div
          className="absolute left-0 top-5 h-0.5 bg-field"
          initial={{ width: 0 }}
          animate={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        />

        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isPending = index > currentStep;
          const Icon = step.icon;

          return (
            <div
              key={step.id}
              className="relative flex flex-col items-center z-10"
              style={{ flex: index === steps.length - 1 ? '0 0 auto' : '1 1 0' }}
            >
              {/* Step Circle */}
              <motion.button
                type="button"
                onClick={() => allowNavigation && onStepClick?.(index)}
                disabled={!allowNavigation || isPending}
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                  'focus:outline-none focus:ring-2 focus:ring-field focus:ring-offset-2',
                  isCompleted && 'bg-field border-field text-wheat-cream',
                  isCurrent && 'bg-white border-field text-field shadow-terra',
                  isPending && 'bg-warm-100 border-warm-300 text-warm-400',
                  allowNavigation && !isPending && 'cursor-pointer hover:scale-110',
                  !allowNavigation && 'cursor-default'
                )}
                whileHover={allowNavigation && !isPending ? { scale: 1.1 } : {}}
                whileTap={allowNavigation && !isPending ? { scale: 0.95 } : {}}
              >
                <AnimatePresence mode="wait">
                  {isCompleted ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 180 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Check className="w-5 h-5" strokeWidth={3} />
                    </motion.div>
                  ) : Icon ? (
                    <motion.div
                      key="icon"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Icon className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <motion.span
                      key="number"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="font-mono text-sm font-bold"
                    >
                      {index + 1}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>

              {/* Step Label */}
              <div className="mt-3 text-center">
                <motion.p
                  className={cn(
                    'text-sm font-medium transition-colors duration-300',
                    isCompleted && 'text-field',
                    isCurrent && 'text-terra-black',
                    isPending && 'text-warm-400'
                  )}
                  animate={{
                    fontWeight: isCurrent ? 600 : 500,
                  }}
                >
                  {step.shortTitle || step.title}
                </motion.p>
                {step.description && isCurrent && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-warm-500 mt-0.5 max-w-[120px]"
                  >
                    {step.description}
                  </motion.p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile Stepper - Compact Pill */}
      <div className="md:hidden">
        <div className="flex items-center justify-between bg-warm-100 rounded-full p-1">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => allowNavigation && onStepClick?.(index)}
                disabled={!allowNavigation}
                className={cn(
                  'flex-1 flex items-center justify-center py-2 px-3 rounded-full transition-all duration-300',
                  isCurrent && 'bg-field text-wheat-cream shadow-terra',
                  isCompleted && 'text-field',
                  !isCurrent && !isCompleted && 'text-warm-400'
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" strokeWidth={3} />
                ) : (
                  <span className="font-mono text-xs font-bold">{index + 1}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Current Step Info */}
        <div className="mt-3 text-center">
          <p className="text-sm font-semibold text-terra-black">
            {steps[currentStep]?.title}
          </p>
          {steps[currentStep]?.description && (
            <p className="text-xs text-warm-500 mt-0.5">
              {steps[currentStep].description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Step navigation buttons
interface StepNavigationProps {
  currentStep: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  onSubmit?: () => void;
  isLastStep: boolean;
  canProceed?: boolean;
  isLoading?: boolean;
  previousLabel?: string;
  nextLabel?: string;
  submitLabel?: string;
  className?: string;
}

export function StepNavigation({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  onSubmit,
  isLastStep,
  canProceed = true,
  isLoading = false,
  previousLabel = 'Previous',
  nextLabel = 'Continue',
  submitLabel = 'Submit',
  className = '',
}: StepNavigationProps) {
  return (
    <div className={cn('flex items-center justify-between pt-6 border-t border-warm-200', className)}>
      {/* Previous Button */}
      <button
        type="button"
        onClick={onPrevious}
        disabled={currentStep === 0 || isLoading}
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200',
          currentStep === 0
            ? 'text-warm-300 cursor-not-allowed'
            : 'text-warm-600 hover:bg-warm-100 hover:text-warm-800'
        )}
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        <span>{previousLabel}</span>
      </button>

      {/* Step Counter */}
      <div className="hidden sm:flex items-center gap-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-2 h-2 rounded-full transition-all duration-300',
              i < currentStep && 'bg-field',
              i === currentStep && 'bg-field w-6',
              i > currentStep && 'bg-warm-300'
            )}
          />
        ))}
      </div>

      {/* Next/Submit Button */}
      {isLastStep ? (
        <motion.button
          type="button"
          onClick={onSubmit}
          disabled={!canProceed || isLoading}
          className={cn(
            'btn-terra px-6 py-2.5 rounded-lg font-medium',
            (!canProceed || isLoading) && 'opacity-50 cursor-not-allowed'
          )}
          whileHover={canProceed && !isLoading ? { scale: 1.02 } : {}}
          whileTap={canProceed && !isLoading ? { scale: 0.98 } : {}}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4\" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </span>
          ) : (
            submitLabel
          )}
        </motion.button>
      ) : (
        <motion.button
          type="button"
          onClick={onNext}
          disabled={!canProceed || isLoading}
          className={cn(
            'flex items-center gap-2 btn-terra px-6 py-2.5 rounded-lg font-medium',
            (!canProceed || isLoading) && 'opacity-50 cursor-not-allowed'
          )}
          whileHover={canProceed && !isLoading ? { scale: 1.02 } : {}}
          whileTap={canProceed && !isLoading ? { scale: 0.98 } : {}}
        >
          <span>{nextLabel}</span>
          <ChevronRight className="w-4 h-4" />
        </motion.button>
      )}
    </div>
  );
}

// Container for step content with animations
interface StepContentProps {
  children: React.ReactNode;
  stepKey: string | number;
  className?: string;
}

export function StepContent({ children, stepKey, className = '' }: StepContentProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

export default FormStepper;
