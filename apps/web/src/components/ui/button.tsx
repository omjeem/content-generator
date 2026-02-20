'use client'
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  variant?: 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'

    const base = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

    const variants = {
      default: 'bg-linkedin text-white hover:bg-linkedin-dark focus-visible:ring-linkedin',
      outline: 'border border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus-visible:ring-gray-300',
      ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      destructive: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600',
      secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-300',
    }

    const sizes = {
      sm: 'h-8 px-3 text-sm gap-1.5',
      md: 'h-10 px-4 text-sm gap-2',
      lg: 'h-11 px-6 text-base gap-2',
    }

    // asChild uses Radix Slot which requires exactly one child — no spinner
    if (asChild) {
      return (
        <Comp
          ref={ref}
          className={cn(base, variants[variant], sizes[size], className)}
          {...props}
        >
          {children}
        </Comp>
      )
    }

    return (
      <Comp
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        )}
        {children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'
