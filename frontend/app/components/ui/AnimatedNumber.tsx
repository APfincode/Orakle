import { useEffect, useRef } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'
import { cn } from '@/lib/utils'

interface AnimatedNumberProps {
    value: number
    format?: (value: number) => string
    className?: string
    prefix?: string
    suffix?: string
    damping?: number
    stiffness?: number
}

export function AnimatedNumber({
    value,
    format = (v) => v.toFixed(2),
    className,
    prefix = '',
    suffix = '',
    damping = 30,
    stiffness = 100
}: AnimatedNumberProps) {
    const spring = useSpring(value, { damping, stiffness })
    const displayValue = useTransform(spring, (current) => format(current))
    const prevValue = useRef(value)
    const isProfit = value >= 0
    const isChangePositive = value > prevValue.current

    useEffect(() => {
        spring.set(value)
        prevValue.current = value
    }, [value, spring])

    return (
        <motion.span
            className={cn("font-numeric tabular-nums inline-block", className)}
            animate={{
                scale: [1, 1.05, 1],
                color: isChangePositive
                    ? ['inherit', 'var(--profit-500)', 'inherit']
                    : ['inherit', 'var(--loss-500)', 'inherit']
            }}
            transition={{ duration: 0.3 }}
        >
            {prefix}
            <motion.span>{displayValue}</motion.span>
            {suffix}
        </motion.span>
    )
}
