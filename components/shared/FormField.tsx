import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  error,
  required,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-[#ef4444] mr-1">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-[#64748b]">{hint}</p>}
      {error && <p className="text-xs text-[#ef4444]">{error}</p>}
    </div>
  );
}
