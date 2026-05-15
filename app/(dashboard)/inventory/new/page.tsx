import { PageHeader } from "@/components/shared";
import { ProductForm } from "@/components/inventory/ProductForm";

export const metadata = { title: "منتج جديد - MTC Electronics" };

export default function NewProductPage() {
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="إضافة منتج جديد"
        breadcrumb={[
          { label: "الرئيسية", href: "/dashboard" },
          { label: "المخزون", href: "/inventory" },
          { label: "منتج جديد" },
        ]}
      />
      <ProductForm />
    </div>
  );
}
