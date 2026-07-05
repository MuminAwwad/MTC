import Link from "next/link";
import { Database, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";
import { PagesManager } from "@/components/store/content/PagesManager";
import { listStorePages } from "@/lib/store/content";
import { hasStoreDb } from "@/lib/store/db";

export const dynamic = "force-dynamic";

export default async function StoreContentPage() {
  if (!hasStoreDb()) {
    return (
      <EmptyState
        icon={Database}
        title="قاعدة بيانات المتجر غير مهيأة"
        description="أضف STORE_DATABASE_URL إلى متغيرات البيئة ثم أعد تشغيل التطبيق."
      />
    );
  }

  const pages = await listStorePages();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href="/store/content/settings">
            <Settings2 className="h-4 w-4" />
            الإعدادات العامة (الإعلان، التذييل، الهوية)
          </Link>
        </Button>
      </div>
      <PagesManager pages={pages} />
    </div>
  );
}
