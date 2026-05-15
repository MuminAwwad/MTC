import { formatCurrency } from "@/lib/formatters";
import type { Currency } from "@prisma/client";
import { cn } from "@/lib/utils";

interface CurrencyDisplayProps {
  amount: number | string | null | undefined;
  currency?: Currency;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function CurrencyDisplay({
  amount,
  currency = "ILS",
  className,
  size = "md",
}: CurrencyDisplayProps) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums ltr",
        {
          "text-sm": size === "sm",
          "text-base": size === "md",
          "text-xl font-bold": size === "lg",
        },
        className
      )}
      dir="ltr"
    >
      {formatCurrency(amount, currency)}
    </span>
  );
}
