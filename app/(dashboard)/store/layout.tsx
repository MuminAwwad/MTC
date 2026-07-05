import { StoreNav } from "@/components/store/StoreNav";
import { PageHeader } from "@/components/shared";

export const metadata = { title: "المتجر الإلكتروني - MTC Electronics" };

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="المتجر الإلكتروني"
        subtitle="إدارة كتالوج المتجر ومحتوى الواجهة"
        breadcrumb={[{ label: "الرئيسية", href: "/dashboard" }, { label: "المتجر" }]}
      />
      <StoreNav />
      {children}
    </div>
  );
}
