"use client";

import { useState } from "react";
import { MessageCircle, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/shared";
import {
  buildInvoiceWhatsAppMessage,
  buildInvoiceWhatsAppUrl,
} from "@/lib/whatsapp";
import type { Currency } from "@prisma/client";

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string | null;
  currency: Currency;
  total: number;
  remaining: number;
}

type Phase = "idle" | "preparing" | "ready" | "sharing";

/**
 * Two-click flow because the Web Share API requires the share() call to
 * happen during the same user-gesture as the click, and the PDF render
 * (iframe load → html2canvas → jsPDF) takes longer than the gesture
 * window. First click builds the PDF; the button then offers a fresh-
 * gesture second click that calls navigator.share with the file already
 * in hand — or downloads + opens wa.me as a desktop fallback.
 */
async function buildInvoicePdf(invoiceId: string): Promise<Blob> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-99999px";
  iframe.style.top = "0";
  iframe.style.width = "794px"; // A4 width @ 96 DPI
  iframe.style.height = "1123px";
  iframe.style.border = "0";
  // ?pdf=1 tells the print page to drop the screen-only action bar so the
  // screenshot doesn't capture our own buttons.
  iframe.src = `/print/invoices/${invoiceId}?pdf=1`;
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => reject(new Error("iframe load failed"));
    });

    const doc = iframe.contentDocument;
    if (!doc) throw new Error("no iframe document");
    if (doc.fonts && "ready" in doc.fonts) {
      await doc.fonts.ready;
    }
    await new Promise((r) => setTimeout(r, 200));

    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas-pro"),
      import("jspdf"),
    ]);

    const target = doc.body;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: target.scrollWidth,
      windowHeight: target.scrollHeight,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidthMm = 210;
    const pageHeightMm = 297;
    const imgWidthMm = pageWidthMm;
    const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    if (imgHeightMm <= pageHeightMm) {
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidthMm, imgHeightMm);
    } else {
      let heightLeft = imgHeightMm;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
      heightLeft -= pageHeightMm;
      while (heightLeft > 0) {
        position -= pageHeightMm;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidthMm, imgHeightMm);
        heightLeft -= pageHeightMm;
      }
    }

    return pdf.output("blob");
  } finally {
    iframe.remove();
  }
}

export function InvoiceShareButton(props: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const buildMessage = (url: string | null) =>
    buildInvoiceWhatsAppMessage({
      invoiceNumber: props.invoiceNumber,
      customerName: props.customerName,
      currency: props.currency,
      total: props.total,
      remaining: props.remaining,
      pdfUrl: url,
    });

  const prepare = async () => {
    setPhase("preparing");
    try {
      const blob = await buildInvoicePdf(props.invoiceId);

      // Upload to Supabase Storage so the WhatsApp message can carry a
      // public link the customer can tap from any device. The fetch is
      // already async so we ride out the same render cycle.
      let publicUrl: string | null = null;
      try {
        const fd = new FormData();
        fd.append(
          "file",
          new File([blob], `invoice-${props.invoiceNumber}.pdf`, {
            type: "application/pdf",
          })
        );
        const res = await fetch(`/api/invoices/${props.invoiceId}/share-link`, {
          method: "POST",
          body: fd,
        });
        if (res.ok) {
          const data = (await res.json()) as { url?: string };
          publicUrl = data.url ?? null;
        } else {
          const data = await res.json().catch(() => ({}));
          console.warn("share-link failed:", data);
        }
      } catch (uploadErr) {
        // Non-fatal: we still have the PDF locally and can fall back to the
        // download + manual-attach flow.
        console.warn("share-link upload error:", uploadErr);
      }

      setPdfBlob(blob);
      setPdfUrl(publicUrl);
      setPhase("ready");
    } catch (e) {
      console.error(e);
      toast("تعذّر إنشاء ملف الفاتورة", "error");
      setPhase("idle");
    }
  };

  const send = async () => {
    if (!pdfBlob) return;
    const file = new File([pdfBlob], `invoice-${props.invoiceNumber}.pdf`, {
      type: "application/pdf",
    });
    const message = buildMessage(pdfUrl);

    // Mobile detection — UA-Client-Hints first, then UA sniff. On desktop
    // we skip navigator.share entirely because (a) the OS share sheet often
    // has no useful target for a PDF and silently aborts, and (b) the
    // attempt consumes the click gesture so the wa.me fallback then gets
    // popup-blocked.
    const isMobile =
      typeof navigator !== "undefined" &&
      ((navigator as Navigator & { userAgentData?: { mobile?: boolean } })
        .userAgentData?.mobile ??
        /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent));

    const canShareFile =
      isMobile &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });

    const openWhatsApp = () => {
      // If we have a public link, the link is the PDF — no manual attach.
      // Without a link, fall back to downloading + manual attach.
      if (!pdfUrl) {
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `invoice-${props.invoiceNumber}.pdf`;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      }

      window.open(
        buildInvoiceWhatsAppUrl({
          invoiceNumber: props.invoiceNumber,
          customerName: props.customerName,
          customerPhone: props.customerPhone,
          currency: props.currency,
          total: props.total,
          remaining: props.remaining,
          pdfUrl,
        }),
        "_blank",
        "noopener,noreferrer"
      );
    };

    setPhase("sharing");
    try {
      if (canShareFile) {
        await navigator.share({
          files: [file],
          title: `فاتورة ${props.invoiceNumber}`,
          text: message,
        });
        toast("تم إرسال الفاتورة");
      } else {
        openWhatsApp();
        toast(
          pdfUrl
            ? "تم فتح واتساب — الرابط في الرسالة يفتح الفاتورة"
            : "تم تنزيل الفاتورة — أرفقها يدويًا في واتساب",
          pdfUrl ? "success" : "warning"
        );
      }
      setPhase("idle");
      setPdfBlob(null);
      setPdfUrl(null);
    } catch (e) {
      // User dismissed the share sheet — keep the PDF cached so they can retry.
      if (e instanceof Error && e.name === "AbortError") {
        setPhase("ready");
        return;
      }
      console.error("InvoiceShareButton send failed:", e);
      toast("تعذّر المشاركة عبر واتساب", "error");
      setPhase("ready");
    }
  };

  const onClick = () => {
    if (phase === "idle") return prepare();
    if (phase === "ready") return send();
  };

  const isBusy = phase === "preparing" || phase === "sharing";

  return (
    <Button
      type="button"
      variant={phase === "ready" ? "default" : "outline"}
      disabled={isBusy}
      onClick={onClick}
      className={
        phase === "ready"
          ? "gap-2 bg-[#25d366] hover:bg-[#1da851] text-white"
          : "gap-2 text-[#25d366] border-[#25d366]/40 hover:bg-[#25d366]/10 hover:text-[#1da851]"
      }
    >
      {isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : phase === "ready" ? (
        <Send className="h-4 w-4" />
      ) : (
        <MessageCircle className="h-4 w-4" />
      )}
      {phase === "idle" && "واتساب"}
      {phase === "preparing" && "جاري التحضير..."}
      {phase === "ready" && "اضغط للإرسال"}
      {phase === "sharing" && "جاري الإرسال..."}
    </Button>
  );
}
