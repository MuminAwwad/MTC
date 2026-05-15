import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#104e98] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[#104e98] text-white hover:bg-[#0b3d7a] shadow-sm",
        destructive: "bg-[#ef4444] text-white hover:bg-[#dc2626] shadow-sm",
        outline: "border border-[#e2e8f0] bg-white text-[#1e293b] hover:bg-[#f8fafc]",
        secondary: "bg-[#f1f5f9] text-[#1e293b] hover:bg-[#e2e8f0]",
        ghost: "text-[#1e293b] hover:bg-[#f1f5f9]",
        link: "text-[#104e98] underline-offset-4 hover:underline",
        success: "bg-[#22c55e] text-white hover:bg-[#16a34a] shadow-sm",
        warning: "bg-[#f59e0b] text-white hover:bg-[#d97706] shadow-sm",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs rounded-md",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
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
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
