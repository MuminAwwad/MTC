// Section catalog for the storefront content editor — ported VERBATIM from the
// storefront repo's lib/content/sections/schema.ts. The storefront renders
// these section types; keep the type keys, field keys, and defaults in
// lock-step with that repo. CLIENT-SAFE — pure data, no server imports.
// `icon` values are Material Symbols names from the storefront; the palette
// here maps them to lucide equivalents for display only.

export type FieldType =
  | "text"
  | "textarea"
  | "image"
  | "number"
  | "toggle"
  | "select"
  | "color"
  | "link"
  | "list";

export interface FieldDef {
  key: string;
  labelEn: string;
  labelAr: string;
  type: FieldType;
  /** When true the editor shows separate English + Arabic inputs. */
  localized?: boolean;
  help?: string;
  options?: { value: string; label: string }[];
  /** For `list` fields: the sub-fields of each repeatable item. */
  itemFields?: FieldDef[];
  /** For `list` fields: label of the "add item" button. */
  addLabelEn?: string;
  addLabelAr?: string;
}

export interface SectionSchema {
  type: string;
  nameEn: string;
  nameAr: string;
  /** Material Symbols icon name (matches the existing Icon component). */
  icon: string;
  fields: FieldDef[];
  defaults: Record<string, unknown>;
}

const tx = (key: string, en: string, ar: string, localized = true): FieldDef => ({
  key,
  labelEn: en,
  labelAr: ar,
  type: "text",
  localized,
});

export const SECTION_SCHEMAS: SectionSchema[] = [
  {
    type: "hero",
    nameEn: "Hero",
    nameAr: "البانر الرئيسي",
    icon: "wallpaper",
    fields: [
      tx("eyebrow", "Eyebrow", "نص علوي"),
      tx("title", "Title", "العنوان"),
      tx("accent", "Accent (highlighted)", "كلمة مميّزة"),
      { ...tx("subtitle", "Subtitle", "الوصف"), type: "textarea" },
      { key: "image", labelEn: "Image", labelAr: "الصورة", type: "image" },
      tx("primaryLabel", "Primary button", "زر رئيسي"),
      { ...tx("primaryHref", "Primary link", "رابط رئيسي", false) },
      tx("secondaryLabel", "Secondary button", "زر ثانوي"),
      { ...tx("secondaryHref", "Secondary link", "رابط ثانوي", false) },
      tx("badgeTitle", "Badge title", "عنوان الشارة"),
      tx("badgeSubtitle", "Badge subtitle", "وصف الشارة"),
    ],
    defaults: {},
  },
  {
    type: "categoryGrid",
    nameEn: "Category grid",
    nameAr: "شبكة الفئات",
    icon: "grid_view",
    fields: [tx("heading", "Heading", "العنوان")],
    defaults: {},
  },
  {
    type: "featuredProducts",
    nameEn: "Featured products",
    nameAr: "منتجات مميّزة",
    icon: "star",
    fields: [
      tx("heading", "Heading", "العنوان"),
      tx("viewAllLabel", "View-all label", "نص (عرض الكل)"),
      { key: "limit", labelEn: "How many", labelAr: "العدد", type: "number" },
    ],
    defaults: { limit: 4 },
  },
  {
    type: "digitalBand",
    nameEn: "Digital products band",
    nameAr: "شريط المنتجات الرقمية",
    icon: "bolt",
    fields: [
      tx("heading", "Heading", "العنوان"),
      { ...tx("subtitle", "Subtitle", "الوصف"), type: "textarea" },
      tx("viewAllLabel", "View-all label", "نص (عرض الكل)"),
      { key: "limit", labelEn: "How many", labelAr: "العدد", type: "number" },
    ],
    defaults: { limit: 3 },
  },
  {
    type: "repairBanner",
    nameEn: "Repair tracking banner",
    nameAr: "شريط تتبّع الصيانة",
    icon: "build_circle",
    fields: [
      tx("title", "Title", "العنوان"),
      { ...tx("description", "Description", "الوصف"), type: "textarea" },
      tx("placeholder", "Input placeholder", "نص الحقل"),
      tx("buttonLabel", "Button label", "نص الزر"),
    ],
    defaults: {},
  },
  {
    type: "trustRow",
    nameEn: "Trust badges",
    nameAr: "شارات الثقة",
    icon: "verified_user",
    fields: [
      { ...tx("icon1", "Badge 1 — icon", "الشارة 1 — الأيقونة", false) },
      tx("title1", "Badge 1 — title", "الشارة 1 — العنوان"),
      tx("body1", "Badge 1 — text", "الشارة 1 — النص"),
      { ...tx("icon2", "Badge 2 — icon", "الشارة 2 — الأيقونة", false) },
      tx("title2", "Badge 2 — title", "الشارة 2 — العنوان"),
      tx("body2", "Badge 2 — text", "الشارة 2 — النص"),
      { ...tx("icon3", "Badge 3 — icon", "الشارة 3 — الأيقونة", false) },
      tx("title3", "Badge 3 — title", "الشارة 3 — العنوان"),
      tx("body3", "Badge 3 — text", "الشارة 3 — النص"),
      { ...tx("icon4", "Badge 4 — icon", "الشارة 4 — الأيقونة", false) },
      tx("title4", "Badge 4 — title", "الشارة 4 — العنوان"),
      tx("body4", "Badge 4 — text", "الشارة 4 — النص"),
    ],
    defaults: {},
  },

  // ── Flexible content blocks ────────────────────────────────────────────────
  {
    type: "richText",
    nameEn: "Rich text / heading",
    nameAr: "نص وعنوان",
    icon: "title",
    fields: [
      tx("heading", "Heading", "العنوان"),
      { ...tx("body", "Body", "النص"), type: "textarea" },
    ],
    defaults: {},
  },
  {
    type: "imageText",
    nameEn: "Image + text",
    nameAr: "صورة ونص",
    icon: "image",
    fields: [
      { key: "image", labelEn: "Image", labelAr: "الصورة", type: "image" },
      {
        key: "imagePosition",
        labelEn: "Image position",
        labelAr: "موضع الصورة",
        type: "select",
        options: [
          { value: "start", label: "البداية" },
          { value: "end", label: "النهاية" },
        ],
      },
      tx("eyebrow", "Eyebrow", "نص علوي"),
      tx("heading", "Heading", "العنوان"),
      { ...tx("body", "Body", "النص"), type: "textarea" },
      tx("buttonLabel", "Button label", "نص الزر"),
      { key: "buttonHref", labelEn: "Button link", labelAr: "رابط الزر", type: "link" },
    ],
    defaults: { imagePosition: "start" },
  },
  {
    type: "ctaBanner",
    nameEn: "CTA banner",
    nameAr: "شريط دعوة لإجراء",
    icon: "campaign",
    fields: [
      tx("title", "Title", "العنوان"),
      { ...tx("subtitle", "Subtitle", "الوصف"), type: "textarea" },
      tx("buttonLabel", "Button label", "نص الزر"),
      { key: "buttonHref", labelEn: "Button link", labelAr: "رابط الزر", type: "link" },
    ],
    defaults: {},
  },
  {
    type: "gallery",
    nameEn: "Gallery",
    nameAr: "معرض صور",
    icon: "collections",
    fields: [
      tx("heading", "Heading", "العنوان"),
      {
        key: "columns",
        labelEn: "Columns",
        labelAr: "عدد الأعمدة",
        type: "select",
        options: [
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "4", label: "4" },
        ],
      },
      {
        key: "items",
        labelEn: "Images",
        labelAr: "الصور",
        type: "list",
        addLabelEn: "Add image",
        addLabelAr: "إضافة صورة",
        itemFields: [
          { key: "image", labelEn: "Image", labelAr: "الصورة", type: "image" },
          tx("caption", "Caption", "تعليق"),
          { key: "href", labelEn: "Link", labelAr: "رابط", type: "link" },
        ],
      },
    ],
    defaults: { columns: "3", items: [] },
  },
  {
    type: "faq",
    nameEn: "FAQ",
    nameAr: "أسئلة شائعة",
    icon: "quiz",
    fields: [
      tx("heading", "Heading", "العنوان"),
      {
        key: "items",
        labelEn: "Questions",
        labelAr: "الأسئلة",
        type: "list",
        addLabelEn: "Add question",
        addLabelAr: "إضافة سؤال",
        itemFields: [
          tx("q", "Question", "السؤال"),
          { ...tx("a", "Answer", "الإجابة"), type: "textarea" },
        ],
      },
    ],
    defaults: { items: [] },
  },
  {
    type: "spacer",
    nameEn: "Spacer / divider",
    nameAr: "فاصل",
    icon: "horizontal_rule",
    fields: [
      {
        key: "height",
        labelEn: "Height",
        labelAr: "الارتفاع",
        type: "select",
        options: [
          { value: "sm", label: "صغير" },
          { value: "md", label: "متوسط" },
          { value: "lg", label: "كبير" },
          { value: "xl", label: "كبير جداً" },
        ],
      },
      { key: "divider", labelEn: "Show divider line", labelAr: "إظهار خط فاصل", type: "toggle" },
    ],
    defaults: { height: "md" },
  },
];

export const SECTION_SCHEMA_BY_TYPE: Record<string, SectionSchema> = Object.fromEntries(
  SECTION_SCHEMAS.map((s) => [s.type, s]),
);
