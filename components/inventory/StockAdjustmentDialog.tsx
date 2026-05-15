"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/shared";

interface StockAdjustmentDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (newQty: number) => void;
  productId: string;
  productName: string;
  currentStock: number;
}

export function StockAdjustmentDialog({
  open,
  onClose,
  onSuccess,
  productId,
  productName,
  currentStock,
}: StockAdjustmentDialogProps) {
  const [type, setType] = useState<"IN" | "OUT" | "ADJUSTMENT">("IN");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const preview =
    type === "IN"
      ? currentStock + (parseInt(qty) || 0)
      : type === "OUT"
      ? currentStock - (parseInt(qty) || 0)
      : parseInt(qty) || 0;

  const handleSubmit = async () => {
    if (!qty || parseInt(qty) <= 0) {
      setError("يرجى إدخال كمية صحيحة");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/products/${productId}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, qty: parseInt(qty), note }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "حدث خطأ");
        return;
      }

      onSuccess(data.newStockQty);
      setQty("");
      setNote("");
      onClose();
    } catch {
      setError("حدث خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  };

  const TYPE_LABELS = {
    IN: "إضافة للمخزون",
    OUT: "صرف من المخزون",
    ADJUSTMENT: "تعديل الرصيد",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل المخزون</DialogTitle>
          <p className="text-sm text-[#64748b]">{productName}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-[#f8fafc] rounded-lg p-3 flex justify-between items-center">
            <span className="text-sm text-[#64748b]">الرصيد الحالي</span>
            <span className="font-bold text-[#0b2345] text-lg">{currentStock}</span>
          </div>

          <FormField label="نوع الحركة">
            <Select
              value={type}
              onValueChange={(v) => setType(v as typeof type)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IN">إضافة للمخزون</SelectItem>
                <SelectItem value="OUT">صرف من المخزون</SelectItem>
                <SelectItem value="ADJUSTMENT">تعديل الرصيد (تحديد قيمة)</SelectItem>
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="الكمية" htmlFor="qty">
            <Input
              id="qty"
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={
                type === "ADJUSTMENT" ? "الرصيد الجديد" : "أدخل الكمية"
              }
              dir="ltr"
            />
          </FormField>

          {qty && parseInt(qty) > 0 && (
            <div className="bg-blue-50 rounded-lg p-3 flex justify-between items-center">
              <span className="text-sm text-blue-700">الرصيد بعد التعديل</span>
              <span
                className={`font-bold text-lg ${
                  preview < 0 ? "text-red-600" : "text-blue-700"
                }`}
              >
                {preview}
              </span>
            </div>
          )}

          <FormField label="ملاحظة (اختياري)">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="سبب التعديل..."
              rows={2}
            />
          </FormField>

          {error && (
            <p className="text-sm text-[#ef4444] bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "جاري الحفظ..." : TYPE_LABELS[type]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
