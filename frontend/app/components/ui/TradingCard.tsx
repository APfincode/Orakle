import * as React from "react"
import { cn } from "@/lib/utils"

const TradingCard = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn(
            "rounded-xl border border-white/5 bg-oracle-800/50 backdrop-blur-md shadow-lg",
            "hover:border-electric-500/30 hover:shadow-electric-500/10 hover:-translate-y-0.5 transition-all duration-300",
            className
        )}
        {...props}
    />
))
TradingCard.displayName = "TradingCard"

const TradingCardHeader = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("flex flex-col space-y-1.5 p-6", className)}
        {...props}
    />
))
TradingCardHeader.displayName = "TradingCardHeader"

const TradingCardTitle = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h3
        ref={ref}
        className={cn(
            "text-lg font-semibold leading-none tracking-tight text-white font-sans",
            className
        )}
        {...props}
    />
))
TradingCardTitle.displayName = "TradingCardTitle"

const TradingCardDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <p
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
    />
))
TradingCardDescription.displayName = "TradingCardDescription"

const TradingCardContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
TradingCardContent.displayName = "TradingCardContent"

const TradingCardFooter = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("flex items-center p-6 pt-0", className)}
        {...props}
    />
))
TradingCardFooter.displayName = "TradingCardFooter"

export { TradingCard, TradingCardHeader, TradingCardFooter, TradingCardTitle, TradingCardDescription, TradingCardContent }
