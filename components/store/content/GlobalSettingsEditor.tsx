"use client";

// Editor for the storefront's global content: announcement bar, header nav,
// footer (tagline/columns/social/copyright), and brand theme. Draft/publish
// like the page editor. The SiteConfig shape is owned by the storefront.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard, FormField } from "@/components/shared";
import { useToast } from "@/components/shared/Toast";
import type {
  FooterColumn,
  LocalizedText,
  NavLink,
  SiteConfig,
  SocialLink,
} from "@/lib/store/types";

const loc = (v?: LocalizedText): LocalizedText => ({ en: v?.en ?? "", ar: v?.ar ?? "" });

function LocInputs({
  value,
  onChange,
  placeholderAr,
  placeholderEn,
}: {
  value: LocalizedText;
  onChange: (v: LocalizedText) => void;
  placeholderAr?: string;
  placeholderEn?: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Input dir="rtl" value={value.ar} onChange={(e) => onChange({ ...value, ar: e.target.value })} placeholder={placeholderAr ?? "عربي"} />
      <Input dir="ltr" value={value.en} onChange={(e) => onChange({ ...value, en: e.target.value })} placeholder={placeholderEn ?? "English"} />
    </div>
  );
}

function NavLinksEditor({
  links,
  onChange,
  addLabel,
}: {
  links: NavLink[];
  onChange: (links: NavLink[]) => void;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {links.map((l, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-7 gap-2 items-center">
          <Input dir="rtl" className="sm:col-span-2" value={l.labelAr} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, labelAr: e.target.value } : x)))} placeholder="التسمية (عربي)" />
          <Input dir="ltr" className="sm:col-span-2" value={l.labelEn} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, labelEn: e.target.value } : x)))} placeholder="Label (EN)" />
          <Input dir="ltr" className="sm:col-span-2" value={l.href} onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, href: e.target.value } : x)))} placeholder="/catalog" />
          <Button type="button" size="icon-sm" variant="ghost" className="text-red-600 hover:bg-red-50 justify-self-end" onClick={() => onChange(links.filter((_, j) => j !== i))} aria-label="حذف الرابط">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={() => onChange([...links, { labelEn: "", labelAr: "", href: "" }])}>
        <Plus className="h-4 w-4" /> {addLabel}
      </Button>
    </div>
  );
}

const SOCIAL_PLATFORMS = ["whatsapp", "instagram", "facebook", "x", "tiktok", "youtube", "link"];

export function GlobalSettingsEditor({
  initial,
  hasUnpublishedDraft,
}: {
  initial: SiteConfig;
  hasUnpublishedDraft: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [config, setConfig] = useState<SiteConfig>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);

  const set = (patch: Partial<SiteConfig>) => {
    setConfig((c) => ({ ...c, ...patch }));
    setDirty(true);
  };

  async function persist(publish: boolean) {
    setBusy(publish ? "publish" : "draft");
    try {
      const res = await fetch("/api/store/content/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, publish }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        toast(data?.error ?? "حدث خطأ ما", "error");
      } else {
        setDirty(false);
        toast(publish ? "تم النشر على كامل المتجر" : "تم حفظ المسودة");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  const columns = config.footer?.columns ?? [];
  const social = config.footer?.social ?? [];
  const selectCls =
    "w-full h-10 rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#104e98]";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-[#1e293b]">إعدادات الواجهة العامة</h2>
          {(dirty || hasUnpublishedDraft) && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              {dirty ? "تغييرات غير محفوظة" : "مسودة غير منشورة"}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => persist(false)}>
            <Save className="h-4 w-4" />
            {busy === "draft" ? "جارٍ الحفظ..." : "حفظ المسودة"}
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => persist(true)} className="bg-green-600 hover:bg-green-700">
            <Globe className="h-4 w-4" />
            {busy === "publish" ? "جارٍ النشر..." : "نشر"}
          </Button>
        </div>
      </div>

      <SectionCard title="شريط الإعلان">
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#104e98]"
              checked={config.announcement?.enabled ?? false}
              onChange={(e) =>
                set({ announcement: { ...config.announcement, enabled: e.target.checked, text: loc(config.announcement?.text) } })
              }
            />
            إظهار شريط الإعلان أعلى المتجر
          </label>
          <FormField label="نص الإعلان">
            <LocInputs
              value={loc(config.announcement?.text)}
              onChange={(text) => set({ announcement: { enabled: config.announcement?.enabled ?? false, text, href: config.announcement?.href } })}
            />
          </FormField>
          <FormField label="رابط الإعلان (اختياري)">
            <Input dir="ltr" value={config.announcement?.href ?? ""} onChange={(e) => set({ announcement: { enabled: config.announcement?.enabled ?? false, text: loc(config.announcement?.text), href: e.target.value || undefined } })} placeholder="/catalog" />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="الترويسة">
        <div className="space-y-3">
          <FormField label="نص التوصيل (الشريط العلوي)">
            <LocInputs
              value={loc(config.header?.deliveryText)}
              onChange={(deliveryText) => set({ header: { ...config.header, deliveryText } })}
            />
          </FormField>
          <FormField label="قائمة التنقل" hint="اتركها فارغة لاستخدام القائمة الافتراضية">
            <NavLinksEditor
              links={config.header?.nav ?? []}
              onChange={(nav) => set({ header: { ...config.header, nav } })}
              addLabel="إضافة رابط"
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="التذييل">
        <div className="space-y-4">
          <FormField label="الشعار النصي (tagline)">
            <LocInputs value={loc(config.footer?.tagline)} onChange={(tagline) => set({ footer: { ...config.footer, tagline } })} />
          </FormField>

          <FormField label="أعمدة الروابط" hint="اتركها فارغة لاستخدام الأعمدة الافتراضية">
            <div className="space-y-3">
              {columns.map((col, i) => (
                <div key={i} className="rounded-lg border border-[#e2e8f0] p-3 space-y-2 relative">
                  <button type="button" onClick={() => set({ footer: { ...config.footer, tagline: loc(config.footer?.tagline), columns: columns.filter((_, j) => j !== i) } })} className="absolute top-2 left-2 text-[#94a3b8] hover:text-red-600" aria-label="حذف العمود">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <LocInputs
                    value={{ en: col.titleEn, ar: col.titleAr }}
                    onChange={(t) => {
                      const next = columns.map((x, j) => (j === i ? { ...x, titleEn: t.en, titleAr: t.ar } : x));
                      set({ footer: { ...config.footer, tagline: loc(config.footer?.tagline), columns: next } });
                    }}
                    placeholderAr="عنوان العمود (عربي)"
                    placeholderEn="Column title (EN)"
                  />
                  <NavLinksEditor
                    links={col.links}
                    onChange={(links) => {
                      const next = columns.map((x, j) => (j === i ? { ...x, links } : x));
                      set({ footer: { ...config.footer, tagline: loc(config.footer?.tagline), columns: next } });
                    }}
                    addLabel="إضافة رابط للعمود"
                  />
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  set({
                    footer: {
                      ...config.footer,
                      tagline: loc(config.footer?.tagline),
                      columns: [...columns, { titleEn: "", titleAr: "", links: [] } satisfies FooterColumn],
                    },
                  })
                }
              >
                <Plus className="h-4 w-4" /> إضافة عمود
              </Button>
            </div>
          </FormField>

          <FormField label="روابط التواصل الاجتماعي">
            <div className="space-y-2">
              {social.map((s, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-7 gap-2 items-center">
                  <select
                    className={`${selectCls} sm:col-span-2`}
                    value={s.platform}
                    onChange={(e) => {
                      const next = social.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x));
                      set({ footer: { ...config.footer, tagline: loc(config.footer?.tagline), social: next } });
                    }}
                  >
                    {SOCIAL_PLATFORMS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <Input
                    dir="ltr"
                    className="sm:col-span-4"
                    value={s.href}
                    onChange={(e) => {
                      const next = social.map((x, j) => (j === i ? { ...x, href: e.target.value } : x));
                      set({ footer: { ...config.footer, tagline: loc(config.footer?.tagline), social: next } });
                    }}
                    placeholder="https://…"
                  />
                  <Button type="button" size="icon-sm" variant="ghost" className="text-red-600 hover:bg-red-50 justify-self-end" onClick={() => set({ footer: { ...config.footer, tagline: loc(config.footer?.tagline), social: social.filter((_, j) => j !== i) } })} aria-label="حذف الرابط">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => set({ footer: { ...config.footer, tagline: loc(config.footer?.tagline), social: [...social, { platform: "whatsapp", href: "" } satisfies SocialLink] } })}>
                <Plus className="h-4 w-4" /> إضافة رابط تواصل
              </Button>
            </div>
          </FormField>

          <FormField label="سطر الحقوق (copyright)">
            <LocInputs value={loc(config.footer?.copyright)} onChange={(copyright) => set({ footer: { ...config.footer, tagline: loc(config.footer?.tagline), copyright } })} />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard title="الهوية البصرية">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField label="لون العلامة الأساسي">
            <div className="flex items-center gap-2">
              <input type="color" value={config.theme?.brandColor ?? "#104e98"} onChange={(e) => set({ theme: { ...config.theme, brandColor: e.target.value } })} className="h-10 w-14 rounded-lg border border-[#e2e8f0] cursor-pointer" />
              <Input dir="ltr" value={config.theme?.brandColor ?? ""} onChange={(e) => set({ theme: { ...config.theme, brandColor: e.target.value || undefined } })} placeholder="افتراضي" />
            </div>
          </FormField>
          <FormField label="لون التمييز">
            <div className="flex items-center gap-2">
              <input type="color" value={config.theme?.accentColor ?? "#06b6d4"} onChange={(e) => set({ theme: { ...config.theme, accentColor: e.target.value } })} className="h-10 w-14 rounded-lg border border-[#e2e8f0] cursor-pointer" />
              <Input dir="ltr" value={config.theme?.accentColor ?? ""} onChange={(e) => set({ theme: { ...config.theme, accentColor: e.target.value || undefined } })} placeholder="افتراضي" />
            </div>
          </FormField>
          <FormField label="الزوايا">
            <select className={selectCls} value={config.theme?.corners ?? ""} onChange={(e) => set({ theme: { ...config.theme, corners: (e.target.value || undefined) as "sharp" | "rounded" | "pill" | undefined } })}>
              <option value="">— افتراضي —</option>
              <option value="sharp">حادة</option>
              <option value="rounded">مستديرة</option>
              <option value="pill">دائرية</option>
            </select>
          </FormField>
        </div>
      </SectionCard>
    </div>
  );
}
