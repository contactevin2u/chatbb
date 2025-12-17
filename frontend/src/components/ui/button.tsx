import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hotpink-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95 transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-r from-hotpink-500 to-purple-500 text-white hover:from-hotpink-600 hover:to-purple-600 hover:shadow-hotpink-lg hover:scale-105',
        destructive:
          'bg-gradient-to-r from-rose-500 to-red-500 text-white hover:from-rose-600 hover:to-red-600 hover:shadow-lg hover:scale-105',
        outline:
          'border-2 border-hotpink-300 dark:border-hotpink-700 bg-background hover:bg-hotpink-50 dark:hover:bg-hotpink-950/30 hover:border-hotpink-400 text-hotpink-600 dark:text-hotpink-300 hover:scale-105',
        secondary:
          'bg-gradient-to-r from-lavender-100 to-hotpink-100 dark:from-purple-900/50 dark:to-hotpink-900/50 text-purple-700 dark:text-purple-200 hover:from-lavender-200 hover:to-hotpink-200 dark:hover:from-purple-900/70 dark:hover:to-hotpink-900/70 hover:scale-105',
        ghost: 'hover:bg-hotpink-100 dark:hover:bg-purple-900/50 text-hotpink-600 dark:text-hotpink-300 hover:text-hotpink-700 dark:hover:text-hotpink-100',
        link: 'text-hotpink-500 dark:text-hotpink-400 underline-offset-4 hover:underline hover:text-hotpink-600 dark:hover:text-hotpink-300',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-11 rounded-xl px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
