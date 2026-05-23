import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // text-base (16 px) on mobile so iOS Safari doesn't auto-zoom on
          // focus; tighter text-sm (14 px) restored from sm: upward.
          "flex h-10 w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-base sm:text-sm text-[#1e293b] placeholder:text-[#94a3b8] transition-colors focus:outline-none focus:ring-2 focus:ring-[#104e98] focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
