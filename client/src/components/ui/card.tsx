import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const cardVariants = cva(
  "rounded-lg text-card-foreground transition-all duration-200",
  {
    variants: {
      variant: {
        // Original shadcn variant
        default: "border bg-card shadow-sm",

        // TerraValue Design System variants
        elevated: "bg-white border border-warm-200 shadow-terra hover:shadow-terra-lg",
        inset: "bg-warm-50 shadow-inset-terra border border-warm-200/50",
        data: "bg-wheat-cream border border-warm-200 bg-[url('/patterns/grid-paper.svg')] bg-[length:40px_40px]",
        contour: "bg-white border border-warm-200 shadow-terra bg-[url('/patterns/contour-lines.svg')] bg-[length:200px_200px] bg-opacity-30",
        ghost: "bg-transparent border-none shadow-none",
        outline: "bg-transparent border-2 border-warm-200 hover:border-warm-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, className }))}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "font-display text-xl leading-none tracking-tight text-terra-black",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-warm-500", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

// TerraValue-specific card components

const MetricCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    label: string
    value: string | number
    unit?: string
    trend?: "up" | "down" | "neutral"
    subtext?: string
  }
>(({ className, label, value, unit, trend, subtext, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "bg-warm-50 rounded-lg p-4 border border-warm-200/50",
      className
    )}
    {...props}
  >
    <span className="text-xs font-semibold uppercase tracking-wider text-warm-500 block mb-1">
      {label}
    </span>
    <div className="flex items-baseline gap-1">
      <span className="font-mono text-2xl font-semibold text-terra-black">
        {value}
      </span>
      {unit && (
        <span className="text-sm text-warm-400 font-mono">{unit}</span>
      )}
    </div>
    {subtext && (
      <span className="text-xs text-warm-400 mt-1 block">{subtext}</span>
    )}
  </div>
))
MetricCard.displayName = "MetricCard"

const CSR2Badge = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & {
    value: number
    showLabel?: boolean
  }
>(({ className, value, showLabel = true, ...props }, ref) => {
  const getQuality = (csr: number) => {
    if (csr >= 82) return { label: "Excellent", class: "bg-csr-excellent/10 text-csr-excellent border-csr-excellent/20" }
    if (csr >= 65) return { label: "Good", class: "bg-csr-good/10 text-csr-good border-csr-good/20" }
    if (csr >= 50) return { label: "Fair", class: "bg-csr-fair/10 text-csr-fair border-csr-fair/20" }
    return { label: "Poor", class: "bg-csr-poor/10 text-csr-poor border-csr-poor/20" }
  }

  const quality = getQuality(value)

  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border",
        quality.class,
        className
      )}
      {...props}
    >
      <span className="font-mono">{value.toFixed(1)}</span>
      {showLabel && <span className="opacity-75">• {quality.label}</span>}
    </span>
  )
})
CSR2Badge.displayName = "CSR2Badge"

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  cardVariants,
  MetricCard,
  CSR2Badge,
}
