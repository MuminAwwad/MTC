import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StorefrontEditor } from "@/components/store/content/StorefrontEditor";
import { getStorePageForEditor } from "@/lib/store/content";

export const dynamic = "force-dynamic";

export default async function StorePageEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getStorePageForEditor(slug);
  if (!page) notFound();

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/store/content">
          <ArrowRight className="h-4 w-4" /> عودة إلى الصفحات
        </Link>
      </Button>
      <StorefrontEditor
        slug={page.slug}
        title={page.titleAr || page.titleEn || (page.slug === "home" ? "الصفحة الرئيسية" : page.slug)}
        initialLayout={page.layout}
        hasUnpublishedDraft={page.hasUnpublishedDraft}
      />
    </div>
  );
}
