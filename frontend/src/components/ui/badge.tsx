import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-pink-sm hover:shadow-pink',
        secondary:
          'border-transparent bg-gradient-to-r from-lavender-100 to-pink-100 dark:from-purple-900/50 dark:to-pink-900/50 text-purple-700 dark:text-purple-200',
        destructive:
          'border-transparent bg-gradient-to-r from-rose-500 to-red-500 text-white',
        outline: 'text-pink-700 dark:text-pink-300 border-pink-300 dark:border-pink-700',
        success:
          'border-transparent bg-gradient-to-r from-emerald-400 to-teal-400 text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
