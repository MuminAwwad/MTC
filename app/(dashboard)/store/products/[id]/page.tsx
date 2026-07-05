import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreProductEditForm } from "@/components/store/StoreProductEditForm";
import { StoreManualProductForm } from "@/components/store/StoreManualProductForm";
import { getStoreAdminProductById } from "@/lib/store/catalog";

export const dynamic = "force-dynamic";

export default async function StoreProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getStoreAdminProductById(id);
  if (!detail) notFound();

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/store/products" aria-label="عودة">
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <h2 className="text-lg font-semibold text-[#1e293b]">
          {detail.origin === "manual" ? "تعديل منتج يدوي" : "مراجعة منتج مُزامن"}
        </h2>
      </div>

      {detail.origin === "manual" ? (
        <StoreManualProductForm
          productId={detail.id}
          initial={{
            name: detail.source.name,
            nameAr: detail.source.nameAr,
            brand: detail.source.brand,
            category: detail.source.category,
            kind: detail.source.kind,
            price: detail.source.price,
            was: detail.source.was,
            currency: detail.source.currency,
            stockQty: detail.source.stockQty,
            stockLabel: detail.source.stockLabel,
            description: detail.source.description,
            descriptionAr: detail.source.descriptionAr,
            icon: detail.source.icon,
            images: detail.source.images,
            variants: detail.variants,
            status: detail.status,
          }}
        />
      ) : (
        <StoreProductEditForm detail={detail} />
      )}
    </div>
  );
}
