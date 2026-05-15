import { cn } from "@/lib/utils";
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_COLORS,
  DEBT_STATUS_LABELS,
  DEBT_STATUS_COLORS,
} from "@/lib/constants";
import type {
  InvoiceStatus,
  TicketStatus,
  TicketPriority,
  DebtStatus,
} from "@prisma/client";

type StatusType =
  | { type: "invoice"; status: InvoiceStatus }
  | { type: "ticket"; status: TicketStatus }
  | { type: "priority"; status: TicketPriority }
  | { type: "debt"; status: DebtStatus }
  | { type: "custom"; label: string; color: string };

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  let label = "";
  let colorClass = "";

  switch (status.type) {
    case "invoice":
      label = INVOICE_STATUS_LABELS[status.status];
      colorClass = INVOICE_STATUS_COLORS[status.status];
      break;
    case "ticket":
      label = TICKET_STATUS_LABELS[status.status];
      colorClass = TICKET_STATUS_COLORS[status.status];
      break;
    case "priority":
      label = TICKET_PRIORITY_LABELS[status.status];
      colorClass = TICKET_PRIORITY_COLORS[status.status];
      break;
    case "debt":
      label = DEBT_STATUS_LABELS[status.status];
      colorClass = DEBT_STATUS_COLORS[status.status];
      break;
    case "custom":
      label = status.label;
      colorClass = status.color;
      break;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        colorClass,
        className
      )}
    >
      {label}
    </span>
  );
}
