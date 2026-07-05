"use client";

// Drag-and-drop page editor for the storefront: an ordered list of sections
// (left) with a settings panel for the selected section (right). Edits are
// held in local state; "حفظ المسودة" persists the draft, "نشر" makes it live.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Save,
  Globe,
  LayoutTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared";
import { useToast } from "@/components/shared/Toast";
import { SectionFields } from "./SectionFields";
import { SECTION_SCHEMAS, SECTION_SCHEMA_BY_TYPE } from "@/lib/store/sections";
import type { PageLayout, SectionAppearance, SectionInstance } from "@/lib/store/types";
import { cn } from "@/lib/utils";

function sectionName(type: string): string {
  return SECTION_SCHEMA_BY_TYPE[type]?.nameAr ?? type;
}

function SortableRow({
  section,
  selected,
  onSelect,
  onToggle,
  onDelete,
}: {
  section: SectionInstance;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: section.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border p-2.5 bg-white",
        selected ? "border-[#104e98] ring-1 ring-[#104e98]" : "border-[#e2e8f0]",
        isDragging && "opacity-60 shadow-lg",
        !section.visible && "opacity-60"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-[#94a3b8] hover:text-[#64748b] touch-none"
        aria-label="سحب لإعادة الترتيب"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button type="button" onClick={onSelect} className="flex-1 text-right text-sm font-medium text-[#1e293b]">
        {sectionName(section.type)}
        {!section.visible && <span className="mr-2 text-xs text-[#94a3b8]">(مخفي)</span>}
      </button>
      <button
        type="button"
        onClick={onToggle}
        className="text-[#94a3b8] hover:text-[#104e98]"
        aria-label={section.visible ? "إخفاء القسم" : "إظهار القسم"}
      >
        {section.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-[#94a3b8] hover:text-red-600"
        aria-label="حذف القسم"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

const APPEARANCE_SELECTS: Array<{
  key: keyof SectionAppearance;
  label: string;
  options: Array<{ value: string; label: string }>;
}> = [
  {
    key: "background",
    label: "الخلفية",
    options: [
      { value: "surface", label: "فاتحة" },
      { value: "muted", label: "رمادية" },
      { value: "dark", label: "داكنة" },
      { value: "navy", label: "كحلية" },
      { value: "primary", label: "لون العلامة" },
      { value: "custom", label: "لون مخصص" },
    ],
  },
  {
    key: "paddingTop",
    label: "مسافة علوية",
    options: ["sm", "md", "lg", "xl"].map((v) => ({ value: v, label: v })),
  },
  {
    key: "paddingBottom",
    label: "مسافة سفلية",
    options: ["sm", "md", "lg", "xl"].map((v) => ({ value: v, label: v })),
  },
  {
    key: "align",
    label: "المحاذاة",
    options: [
      { value: "start", label: "بداية" },
      { value: "center", label: "وسط" },
      { value: "end", label: "نهاية" },
    ],
  },
  {
    key: "maxWidth",
    label: "العرض",
    options: [
      { value: "wide", label: "عريض" },
      { value: "full", label: "كامل" },
    ],
  },
];

export function StorefrontEditor({
  slug,
  title,
  initialLayout,
  hasUnpublishedDraft,
}: {
  slug: string;
  title: string;
  initialLayout: PageLayout;
  hasUnpublishedDraft: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [layout, setLayout] = useState<PageLayout>(initialLayout);
  const [selectedId, setSelectedId] = useState<string | null>(initialLayout[0]?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const selected = useMemo(
    () => layout.find((s) => s.id === selectedId) ?? null,
    [layout, selectedId],
  );

  const update = (next: PageLayout) => {
    setLayout(next);
    setDirty(true);
  };

  const updateSection = (id: string, patch: Partial<SectionInstance>) =>
    update(layout.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = layout.findIndex((s) => s.id === active.id);
    const to = layout.findIndex((s) => s.id === over.id);
    update(arrayMove(layout, from, to));
  }

  function addSection(type: string) {
    const schema = SECTION_SCHEMA_BY_TYPE[type];
    const section: SectionInstance = {
      id: crypto.randomUUID(),
      type,
      visible: true,
      settings: { ...(schema?.defaults ?? {}) },
    };
    update([...layout, section]);
    setSelectedId(section.id);
    setPaletteOpen(false);
  }

  async function persist(publish: boolean) {
    setBusy(publish ? "publish" : "draft");
    try {
      const res = await fetch(`/api/store/content/pages/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout, publish }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        toast(data?.error ?? "حدث خطأ ما", "error");
      } else {
        setDirty(false);
        toast(publish ? "تم النشر — أصبحت الصفحة ظاهرة للعملاء" : "تم حفظ المسودة");
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-5 w-5 text-[#104e98]" />
          <h2 className="text-lg font-semibold text-[#1e293b]">{title}</h2>
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
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => persist(true)}
            className="bg-green-600 hover:bg-green-700"
          >
            <Globe className="h-4 w-4" />
            {busy === "publish" ? "جارٍ النشر..." : "نشر"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Sections list */}
        <div className="lg:col-span-2 space-y-3">
          <SectionCard title="أقسام الصفحة">
            {layout.length === 0 ? (
              <p className="text-sm text-[#64748b]">لا توجد أقسام بعد — أضف أول قسم.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={layout.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {layout.map((s) => (
                      <SortableRow
                        key={s.id}
                        section={s}
                        selected={s.id === selectedId}
                        onSelect={() => setSelectedId(s.id)}
                        onToggle={() => updateSection(s.id, { visible: !s.visible })}
                        onDelete={() => {
                          update(layout.filter((x) => x.id !== s.id));
                          if (selectedId === s.id) setSelectedId(null);
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <div className="mt-3">
              {paletteOpen ? (
                <div className="grid grid-cols-2 gap-2">
                  {SECTION_SCHEMAS.map((s) => (
                    <button
                      key={s.type}
                      type="button"
                      onClick={() => addSection(s.type)}
                      className="rounded-lg border border-[#e2e8f0] p-2.5 text-sm text-right text-[#1e293b] hover:border-[#104e98] hover:bg-[#e8f0fc]/40 transition-colors"
                    >
                      {s.nameAr}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPaletteOpen(false)}
                    className="rounded-lg border border-transparent p-2.5 text-sm text-[#64748b] hover:text-[#1e293b]"
                  >
                    إلغاء
                  </button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="outline" onClick={() => setPaletteOpen(true)}>
                  <Plus className="h-4 w-4" /> إضافة قسم
                </Button>
              )}
            </div>
          </SectionCard>
        </div>

        {/* Settings panel */}
        <div className="lg:col-span-3">
          {selected ? (
            <div className="space-y-4">
              <SectionCard title={`إعدادات: ${sectionName(selected.type)}`}>
                <SectionFields
                  fields={SECTION_SCHEMA_BY_TYPE[selected.type]?.fields ?? []}
                  settings={selected.settings}
                  onChange={(settings) => updateSection(selected.id, { settings })}
                />
              </SectionCard>

              <SectionCard title="المظهر">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {APPEARANCE_SELECTS.map(({ key, label, options }) => (
                    <label key={key} className="space-y-1.5 text-sm">
                      <span className="block font-medium text-[#1e293b]">{label}</span>
                      <select
                        className="w-full h-10 rounded-lg border border-[#e2e8f0] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#104e98]"
                        value={(selected.appearance?.[key] as string) ?? ""}
                        onChange={(e) =>
                          updateSection(selected.id, {
                            appearance: {
                              ...selected.appearance,
                              [key]: e.target.value || undefined,
                            },
                          })
                        }
                      >
                        <option value="">— افتراضي —</option>
                        {options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {selected.appearance?.background === "custom" && (
                    <label className="space-y-1.5 text-sm">
                      <span className="block font-medium text-[#1e293b]">لون الخلفية</span>
                      <input
                        type="color"
                        value={selected.appearance?.bgColor ?? "#ffffff"}
                        onChange={(e) =>
                          updateSection(selected.id, {
                            appearance: { ...selected.appearance, bgColor: e.target.value },
                          })
                        }
                        className="h-10 w-14 rounded-lg border border-[#e2e8f0] cursor-pointer"
                      />
                    </label>
                  )}
                </div>
              </SectionCard>
            </div>
          ) : (
            <SectionCard>
              <p className="text-sm text-[#64748b] py-8 text-center">
                اختر قسماً من القائمة لتعديل إعداداته، أو أضف قسماً جديداً.
              </p>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
