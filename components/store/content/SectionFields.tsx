"use client";

// Auto-generated settings form for a section instance, driven by the FieldDef
// descriptors in lib/store/sections.ts. Localized text fields write {en, ar}
// objects; plain fields write strings; `list` fields write arrays of records —
// exactly the shapes the storefront's renderer reads.

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImageField } from "./ImageField";
import type { FieldDef } from "@/lib/store/sections";
import type { LocalizedText } from "@/lib/store/types";

type Settings = Record<string, unknown>;

const asLoc = (v: unknown): LocalizedText => {
  if (v && typeof v === "object") {
    const o = v as Partial<LocalizedText>;
    return { en: o.en ?? "", ar: o.ar ?? "" };
  }
  return { en: "", ar: "" };
};

const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

function LocalizedInput({
  field,
  value,
  onChange,
  textarea,
}: {
  field: FieldDef;
  value: LocalizedText;
  onChange: (v: LocalizedText) => void;
  textarea?: boolean;
}) {
  const C = textarea ? Textarea : Input;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <C
        dir="rtl"
        rows={textarea ? 3 : undefined}
        value={value.ar}
        onChange={(e) => onChange({ ...value, ar: e.target.value })}
        placeholder={`${field.labelAr} (عربي)`}
      />
      <C
        dir="ltr"
        rows={textarea ? 3 : undefined}
        value={value.en}
        onChange={(e) => onChange({ ...value, en: e.target.value })}
        placeholder={`${field.labelEn} (EN)`}
      />
    </div>
  );
}

function SingleField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const selectCls =
    "w-full h-10 rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#104e98]";

  switch (field.type) {
    case "text":
    case "textarea":
      if (field.localized) {
        return (
          <LocalizedInput
            field={field}
            value={asLoc(value)}
            onChange={onChange}
            textarea={field.type === "textarea"}
          />
        );
      }
      return field.type === "textarea" ? (
        <Textarea rows={3} value={asStr(value)} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={asStr(value)} onChange={(e) => onChange(e.target.value)} />
      );
    case "link":
      return (
        <Input
          dir="ltr"
          value={asStr(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/catalog أو https://…"
        />
      );
    case "image":
      return <ImageField value={asStr(value)} onChange={onChange} />;
    case "number":
      return (
        <Input
          type="number"
          dir="ltr"
          value={value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );
    case "toggle":
      return (
        <label className="flex items-center gap-2 text-sm text-[#1e293b] cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 accent-[#104e98]"
          />
          تفعيل
        </label>
      );
    case "select":
      return (
        <select className={selectCls} value={asStr(value)} onChange={(e) => onChange(e.target.value)}>
          <option value="">— افتراضي —</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "color":
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={asStr(value) || "#104e98"}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-14 rounded-lg border border-[#e2e8f0] cursor-pointer"
          />
          <Input dir="ltr" value={asStr(value)} onChange={(e) => onChange(e.target.value)} placeholder="#104e98" />
        </div>
      );
    case "list": {
      const items = Array.isArray(value) ? (value as Settings[]) : [];
      return (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="rounded-lg border border-[#e2e8f0] p-3 space-y-2 relative">
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="absolute top-2 left-2 text-[#94a3b8] hover:text-red-600"
                aria-label="حذف العنصر"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              {(field.itemFields ?? []).map((sub) => (
                <div key={sub.key} className="space-y-1">
                  <span className="text-xs text-[#64748b]">{sub.labelAr}</span>
                  <SingleField
                    field={sub}
                    value={item[sub.key]}
                    onChange={(v) =>
                      onChange(items.map((it, j) => (j === i ? { ...it, [sub.key]: v } : it)))
                    }
                  />
                </div>
              ))}
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, {}])}>
            <Plus className="h-4 w-4" />
            {field.addLabelAr ?? "إضافة عنصر"}
          </Button>
        </div>
      );
    }
    default:
      return null;
  }
}

/** Render all of a section's fields against its settings object. */
export function SectionFields({
  fields,
  settings,
  onChange,
}: {
  fields: FieldDef[];
  settings: Settings;
  onChange: (next: Settings) => void;
}) {
  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <span className="block text-sm font-medium text-[#1e293b]">{field.labelAr}</span>
          {field.help && <span className="block text-xs text-[#94a3b8]">{field.help}</span>}
          <SingleField
            field={field}
            value={settings[field.key]}
            onChange={(v) => onChange({ ...settings, [field.key]: v })}
          />
        </div>
      ))}
      {fields.length === 0 && (
        <p className="text-sm text-[#64748b]">هذا القسم بلا إعدادات قابلة للتعديل.</p>
      )}
    </div>
  );
}
