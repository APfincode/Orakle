import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-electric-500 text-oracle-900 shadow-lg shadow-electric-500/20 hover:bg-electric-400 hover:shadow-electric-500/40 hover:-translate-y-0.5 transition-all duration-200",
        destructive:
          "bg-loss-500 text-white shadow-lg shadow-loss-500/20 hover:bg-loss-500/90 hover:shadow-loss-500/40 hover:-translate-y-0.5 transition-all duration-200",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground hover:border-accent transition-all duration-200",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:-translate-y-0.5 transition-all duration-200",
        ghost: "hover:bg-accent hover:text-accent-foreground hover:bg-white/5 transition-all duration-200",
        link: "text-primary underline-offset-4 hover:underline",
        glass: "bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 hover:border-white/20 text-white transition-all duration-200",
        glow: "bg-mystic-600 text-white shadow-lg shadow-mystic-600/20 hover:bg-mystic-500 hover:shadow-mystic-600/50 hover:-translate-y-0.5 transition-all duration-200",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
