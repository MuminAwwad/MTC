import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared";
import { GlobalSettingsEditor } from "@/components/store/content/GlobalSettingsEditor";
import { getSiteSettingsForEditor } from "@/lib/store/content";
import { hasStoreDb } from "@/lib/store/db";

export const dynamic = "force-dynamic";

export default async function StoreContentSettingsPage() {
  if (!hasStoreDb()) {
    return (
      <EmptyState
        icon={Database}
        title="قاعدة بيانات المتجر غير مهيأة"
        description="أضف STORE_DATABASE_URL إلى متغيرات البيئة ثم أعد تشغيل التطبيق."
      />
    );
  }

  const { config, hasUnpublishedDraft } = await getSiteSettingsForEditor();

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/store/content">
          <ArrowRight className="h-4 w-4" /> عودة إلى الصفحات
        </Link>
      </Button>
      <GlobalSettingsEditor initial={config} hasUnpublishedDraft={hasUnpublishedDraft} />
    </div>
  );
}
