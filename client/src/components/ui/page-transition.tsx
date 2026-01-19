import { motion, AnimatePresence, Variants } from 'framer-motion';
import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  pageKey: string;
  variant?: 'fade' | 'slideUp' | 'slideLeft' | 'scale' | 'cartographic';
  className?: string;
}

// Transition variants for different page effects
const pageVariants: Record<string, Variants> = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },
  slideLeft: {
    initial: { opacity: 0, x: 30 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -30 },
  },
  scale: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.05 },
  },
  // Custom cartographic-style transition with subtle layer reveal
  cartographic: {
    initial: {
      opacity: 0,
      y: 10,
      filter: 'blur(4px)',
    },
    animate: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
    },
    exit: {
      opacity: 0,
      y: -5,
      filter: 'blur(2px)',
    },
  },
};

const pageTransition = {
  type: 'tween',
  ease: [0.25, 0.1, 0.25, 1], // Custom easing for smooth feel
  duration: 0.35,
};

export function PageTransition({
  children,
  pageKey,
  variant = 'cartographic',
  className = '',
}: PageTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants[variant]}
        transition={pageTransition}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Stagger children animation wrapper
interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}

export function StaggerContainer({
  children,
  className = '',
  staggerDelay = 0.1,
}: StaggerContainerProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      className={className}
      variants={{
        initial: {},
        animate: {
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

// Individual stagger item
interface StaggerItemProps {
  children: ReactNode;
  className?: string;
}

export function StaggerItem({ children, className = '' }: StaggerItemProps) {
  return (
    <motion.div
      className={className}
      variants={{
        initial: { opacity: 0, y: 15 },
        animate: {
          opacity: 1,
          y: 0,
          transition: {
            type: 'spring',
            stiffness: 300,
            damping: 24,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

// Fade in on scroll (intersection observer based)
interface FadeInViewProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
}

export function FadeInView({
  children,
  className = '',
  delay = 0,
  direction = 'up',
}: FadeInViewProps) {
  const directionOffset = {
    up: { y: 20 },
    down: { y: -20 },
    left: { x: 20 },
    right: { x: -20 },
    none: {},
  };

  return (
    <motion.div
      className={className}
      initial={{
        opacity: 0,
        ...directionOffset[direction],
      }}
      whileInView={{
        opacity: 1,
        x: 0,
        y: 0,
      }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{
        type: 'spring',
        stiffness: 260,
        damping: 20,
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}

// Hover lift effect for cards
interface HoverLiftProps {
  children: ReactNode;
  className?: string;
  scale?: number;
  y?: number;
}

export function HoverLift({
  children,
  className = '',
  scale = 1.02,
  y = -4,
}: HoverLiftProps) {
  return (
    <motion.div
      className={className}
      whileHover={{
        scale,
        y,
        transition: {
          type: 'spring',
          stiffness: 400,
          damping: 25,
        },
      }}
      whileTap={{ scale: 0.98 }}
    >
      {children}
    </motion.div>
  );
}

// Pulse animation for loading/active states
interface PulseProps {
  children: ReactNode;
  className?: string;
  isActive?: boolean;
}

export function Pulse({ children, className = '', isActive = true }: PulseProps) {
  return (
    <motion.div
      className={className}
      animate={
        isActive
          ? {
              scale: [1, 1.02, 1],
              opacity: [1, 0.8, 1],
            }
          : {}
      }
      transition={{
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {children}
    </motion.div>
  );
}

// Number counter animation
interface CounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  decimals?: number;
}

export function Counter({
  value,
  duration = 1,
  prefix = '',
  suffix = '',
  className = '',
  decimals = 0,
}: CounterProps) {
  return (
    <motion.span
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {prefix}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {value.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}
      </motion.span>
      {suffix}
    </motion.span>
  );
}

export default PageTransition;
