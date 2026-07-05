"use client";

/* eslint-disable @next/next/no-img-element */

// Image input for the content editor: paste a URL, upload to the store's Blob
// bucket, or pick from the media library.

import { useEffect, useRef, useState } from "react";
import { Upload, Images, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/shared/Toast";

interface MediaAsset {
  id: number;
  url: string;
  pathname: string | null;
}

export function ImageField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [uploadsEnabled, setUploadsEnabled] = useState(true);

  useEffect(() => {
    if (!pickerOpen || assets !== null) return;
    fetch("/api/store/media")
      .then((r) => r.json())
      .then((d) => {
        setAssets(d.assets ?? []);
        setUploadsEnabled(Boolean(d.uploadsEnabled));
      })
      .catch(() => setAssets([]));
  }, [pickerOpen, assets]);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/store/media", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || data?.error) {
        toast(data?.error ?? "تعذّر رفع الصورة", "error");
      } else {
        onChange(data.url);
        setAssets(null); // refresh the picker next time it opens
        toast("تم رفع الصورة");
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…/image.jpg"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files)}
        />
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="h-10 w-10 shrink-0"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="رفع صورة"
          title="رفع صورة"
        >
          <Upload className={`h-4 w-4 ${uploading ? "animate-pulse" : ""}`} />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="h-10 w-10 shrink-0"
          onClick={() => setPickerOpen(true)}
          aria-label="مكتبة الوسائط"
          title="مكتبة الوسائط"
        >
          <Images className="h-4 w-4" />
        </Button>
      </div>

      {value && (
        <div className="relative inline-block">
          <img
            src={value}
            alt=""
            className="h-16 w-16 rounded-lg border border-[#e2e8f0] object-cover"
          />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-1.5 -left-1.5 bg-white border border-[#e2e8f0] rounded-full p-0.5 text-[#64748b] hover:text-red-600"
            aria-label="إزالة الصورة"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>مكتبة الوسائط</DialogTitle>
          </DialogHeader>
          {!uploadsEnabled && (
            <p className="text-xs text-yellow-700 bg-yellow-50 rounded-lg p-2">
              رفع الصور غير مهيأ بعد (BLOB_READ_WRITE_TOKEN). يمكنك لصق روابط صور خارجية.
            </p>
          )}
          {assets === null ? (
            <p className="text-sm text-[#64748b] p-4">جارٍ التحميل…</p>
          ) : assets.length === 0 ? (
            <p className="text-sm text-[#64748b] p-4">لا توجد صور في المكتبة بعد.</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-80 overflow-y-auto">
              {assets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onChange(a.url);
                    setPickerOpen(false);
                  }}
                  className="aspect-square rounded-lg border border-[#e2e8f0] overflow-hidden hover:ring-2 hover:ring-[#104e98]"
                >
                  <img src={a.url} alt={a.pathname ?? ""} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
