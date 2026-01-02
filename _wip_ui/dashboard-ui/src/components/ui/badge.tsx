import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success: "border-transparent bg-emerald-500/20 text-emerald-400",
        warning: "border-transparent bg-amber-500/20 text-amber-400",
        info: "border-transparent bg-blue-500/20 text-blue-400",
        error: "border-transparent bg-red-500/20 text-red-400",
        // Status variants
        active: "border-transparent bg-emerald-500/20 text-emerald-400",
        working: "border-transparent bg-blue-500/20 text-blue-400",
        idle: "border-transparent bg-slate-500/20 text-slate-400",
        pending: "border-transparent bg-amber-500/20 text-amber-400",
        in_progress: "border-transparent bg-blue-500/20 text-blue-400",
        completed: "border-transparent bg-emerald-500/20 text-emerald-400",
        blocked: "border-transparent bg-red-500/20 text-red-400",
        // Priority variants
        critical: "border-transparent bg-red-600 text-white",
        high: "border-transparent bg-orange-500 text-white",
        medium: "border-transparent bg-amber-500 text-black",
        low: "border-transparent bg-slate-600 text-slate-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
