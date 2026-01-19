import { ReactNode, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, PanInfo, useDragControls } from 'framer-motion';
import { cn } from '@/lib/utils';
import { X, GripHorizontal } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  snapPoints?: ('min' | 'mid' | 'max')[];
  defaultSnap?: 'min' | 'mid' | 'max';
  showHandle?: boolean;
  showCloseButton?: boolean;
  className?: string;
}

// Snap point heights (percentage of viewport)
const SNAP_HEIGHTS = {
  min: 25,
  mid: 50,
  max: 85,
};

export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  subtitle,
  snapPoints = ['min', 'mid', 'max'],
  defaultSnap = 'mid',
  showHandle = true,
  showCloseButton = true,
  className = '',
}: BottomSheetProps) {
  const [currentSnap, setCurrentSnap] = useState<'min' | 'mid' | 'max'>(defaultSnap);
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();

  // Reset snap point when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentSnap(defaultSnap);
    }
  }, [isOpen, defaultSnap]);

  // Handle keyboard escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const currentHeight = SNAP_HEIGHTS[currentSnap];

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    const velocity = info.velocity.y;
    const offset = info.offset.y;
    const sheetHeight = sheetRef.current?.getBoundingClientRect().height || 0;
    const viewportHeight = window.innerHeight;

    // Calculate drag percentage of viewport
    const dragPercent = (offset / viewportHeight) * 100;

    // Quick swipe down - close or snap down
    if (velocity > 500 || dragPercent > 20) {
      const currentIndex = snapPoints.indexOf(currentSnap);
      if (currentIndex === 0 || dragPercent > 40) {
        onClose();
      } else {
        setCurrentSnap(snapPoints[currentIndex - 1] as any);
      }
      return;
    }

    // Quick swipe up - snap up
    if (velocity < -500 || dragPercent < -20) {
      const currentIndex = snapPoints.indexOf(currentSnap);
      if (currentIndex < snapPoints.length - 1) {
        setCurrentSnap(snapPoints[currentIndex + 1] as any);
      }
      return;
    }

    // Slow drag - find nearest snap point
    const newHeight = currentHeight - dragPercent;
    let nearestSnap = snapPoints[0];
    let minDiff = Infinity;

    snapPoints.forEach((snap) => {
      const diff = Math.abs(SNAP_HEIGHTS[snap] - newHeight);
      if (diff < minDiff) {
        minDiff = diff;
        nearestSnap = snap;
      }
    });

    setCurrentSnap(nearestSnap as any);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-terra-black/40 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: `${100 - currentHeight}%` }}
            exit={{ y: '100%' }}
            transition={{
              type: 'spring',
              damping: 30,
              stiffness: 300,
            }}
            drag="y"
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={handleDragEnd}
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 lg:hidden',
              'bg-wheat-cream rounded-t-2xl shadow-terra-lg',
              'border-t border-x border-warm-200',
              'flex flex-col',
              isDragging && 'cursor-grabbing',
              className
            )}
            style={{
              height: `${SNAP_HEIGHTS.max}vh`,
              touchAction: 'none',
            }}
          >
            {/* Handle */}
            {showHandle && (
              <div
                className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => dragControls.start(e)}
              >
                <div className="w-10 h-1 rounded-full bg-warm-300" />
              </div>
            )}

            {/* Header */}
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between px-4 pb-3 border-b border-warm-200">
                <div>
                  {title && (
                    <h3 className="font-semibold text-terra-black">{title}</h3>
                  )}
                  {subtitle && (
                    <p className="text-xs text-warm-500">{subtitle}</p>
                  )}
                </div>
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center text-warm-600 hover:bg-warm-200 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Snap indicators */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
              {snapPoints.map((snap) => (
                <button
                  key={snap}
                  onClick={() => setCurrentSnap(snap)}
                  className={cn(
                    'w-1.5 h-1.5 rounded-full transition-all duration-200',
                    currentSnap === snap
                      ? 'bg-field scale-125'
                      : 'bg-warm-300 hover:bg-warm-400'
                  )}
                />
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Preset for property details sheet
interface PropertyDetailsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  property?: {
    address?: string;
    county?: string;
    state?: string;
    acreage?: number;
    csr2?: number;
    estimatedValue?: number;
  };
}

export function PropertyDetailsSheet({
  isOpen,
  onClose,
  property,
}: PropertyDetailsSheetProps) {
  if (!property) return null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={property.address || 'Property Details'}
      subtitle={property.county ? `${property.county} County, ${property.state}` : undefined}
    >
      <div className="space-y-4">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl p-3 border border-warm-200">
            <p className="text-xs text-warm-500 mb-1">Acres</p>
            <p className="font-mono text-lg font-semibold text-terra-black">
              {property.acreage?.toFixed(1) || '--'}
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-warm-200">
            <p className="text-xs text-warm-500 mb-1">CSR2</p>
            <p className="font-mono text-lg font-semibold text-terra-black">
              {property.csr2?.toFixed(1) || '--'}
            </p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-warm-200">
            <p className="text-xs text-warm-500 mb-1">Est. Value</p>
            <p className="font-mono text-lg font-semibold text-field">
              {property.estimatedValue
                ? `$${(property.estimatedValue / 1000).toFixed(0)}K`
                : '--'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button className="flex-1 btn-terra py-3 rounded-xl text-sm font-medium">
            Start Valuation
          </button>
          <button className="flex-1 btn-terra-secondary py-3 rounded-xl text-sm font-medium">
            View Details
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

// Action sheet for quick actions
interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  actions: {
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    variant?: 'default' | 'danger';
  }[];
}

export function ActionSheet({ isOpen, onClose, title, actions }: ActionSheetProps) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      snapPoints={['min']}
      defaultSnap="min"
      showCloseButton={false}
    >
      <div className="space-y-2">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={() => {
              action.onClick();
              onClose();
            }}
            className={cn(
              'w-full flex items-center gap-3 p-4 rounded-xl transition-colors',
              action.variant === 'danger'
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-white hover:bg-warm-50 text-terra-black'
            )}
          >
            {action.icon}
            <span className="font-medium">{action.label}</span>
          </button>
        ))}
        <button
          onClick={onClose}
          className="w-full p-4 rounded-xl bg-warm-100 text-warm-600 font-medium hover:bg-warm-200 transition-colors mt-2"
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}

export default BottomSheet;
