import "server-only";
import { put } from "@vercel/blob";

// Reuses the same native Gemini generateContent + Google Search grounding
// call as lib/product-description.ts (the OpenAI-compatible endpoint used
// elsewhere in this app doesn't support the google_search tool). Grounding
// gives us real webpage URLs about the product; from those we scrape the
// page's og:image meta tag rather than calling a dedicated image-search API
// (none is configured for this project) — a pragmatic approximation, not a
// real image search.
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_GENERATE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface ImageCandidate {
  imageUrl: string;
  sourceTitle: string;
  sourceUri: string;
}

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

function extractOgImage(html: string): string | null {
  // Attribute order varies (property before/after content), so try both.
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Search the web for `name` and return a few candidate product images
 * scraped from the top grounding sources' og:image tags. Best-effort: pages
 * that fail to fetch or have no og:image are silently skipped. */
export async function findProductImageCandidates(name: string): Promise<ImageCandidate[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("لم يتم ضبط GEMINI_API_KEY في إعدادات البيئة");

  const res = await fetch(`${GEMINI_GENERATE_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `ابحث عن الصفحة الرسمية أو صفحة منتج موثوقة لهذا المنتج: "${name}".` }] }],
      tools: [{ google_search: {} }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Gemini generateContent error:", res.status, errText);
    throw new Error("تعذّر الاتصال بنموذج الذكاء الاصطناعي");
  }

  const data = await res.json();
  const chunks: GroundingChunk[] = data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((c) => (c.web?.uri ? { title: c.web.title ?? c.web.uri, uri: c.web.uri } : null))
    .filter((s): s is { title: string; uri: string } => s !== null)
    .slice(0, 4);

  const results = await Promise.all(
    sources.map(async (s): Promise<ImageCandidate | null> => {
      try {
        const pageRes = await fetch(s.uri, { signal: AbortSignal.timeout(5000) });
        if (!pageRes.ok) return null;
        const html = await pageRes.text();
        const imageUrl = extractOgImage(html);
        if (!imageUrl) return null;
        // Resolve protocol-relative / relative URLs against the source page.
        const absolute = new URL(imageUrl, s.uri).toString();
        return { imageUrl: absolute, sourceTitle: s.title, sourceUri: s.uri };
      } catch {
        return null;
      }
    })
  );

  return results.filter((r): r is ImageCandidate => r !== null).slice(0, 3);
}

const MAX_BYTES = 10 * 1024 * 1024;

/** Download an externally-found candidate image and re-host it on our own
 * Blob storage, so the product doesn't depend on a third-party URL staying
 * alive or allowing hotlinking. */
export async function adoptExternalImage(url: string, ownerId: string): Promise<{ url: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("تخزين الصور غير مهيأ (BLOB_READ_WRITE_TOKEN غير موجود)");
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("تعذّر تحميل الصورة من المصدر");
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error("الرابط لا يشير إلى صورة صالحة");
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) throw new Error("حجم الصورة يتجاوز 10 ميغابايت");

  const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
  const blob = await put(`products/${ownerId}/web-${Date.now()}.${ext}`, buffer, {
    access: "public",
    contentType,
  });
  return { url: blob.url };
}
