/**
 * Cloudflare KV에 검증된 블로그 원고와 공식 상품 이미지를 별도로 저장합니다.
 * 비공개 동기화 API는 DRAFT_SYNC_TOKEN(길이 32 이상) 없이는 항상 거절합니다.
 * 이미지 파일도 생성 당시에 KV에 보관하므로 PC가 꺼져 있어도 원본을 유지합니다.
 */

export interface SyncEnv {
  CONTENT_STORE?: KVNamespace;
  DRAFT_SYNC_TOKEN?: string;
}
export interface StoredDraft {
  id: string;
  date: string;
  slot: "morning" | "evening";
  createdAt: string;
  keyword: string;
  productId: string;
  rank: number;
  productName: string;
  productPrice: number;
  priceCheckedAt: string;
  title: string;
  body: string;
  disclosure: string;
  partnerUrl: string;
  imageFilename: string;
  imageMime: string;
}
export const DISCLOSURE_TEXT = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";
export const draftKey = (id: string) => "blogdraft:" + id;
export const imageKey = (id: string) => "blogimage:" + id;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
function isValidId(id: string) {
  return /^\d{4}-\d{2}-\d{2}-(morning|evening)$/.test(id);
}

/** 민감한 동기화 자료가 외부에 노출되지 않도록 인증을 강제합니다. */
export function authorized(request: Request, env: SyncEnv): boolean {
  const secret = env.DRAFT_SYNC_TOKEN;
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get("Authorization") ?? "";
  if (!supplied.startsWith("Bearer ")) return false;
  const token = supplied.slice(7);
  if (token.length !== secret.length) return false;
  // 일치하는 지점에서 곧바로 반환하지 않고 전체 문자열을 검사합니다.
  let mismatch = 0;
  for (let i = 0; i < secret.length; i++) mismatch |= secret.charCodeAt(i) ^ token.charCodeAt(i);
  return mismatch === 0;
}

/** 공식 상품 이미지 1장을 저장한 뒤에만 원고를 공개 대기 상태로 확정합니다. */
export async function saveBlogDraft(
  env: SyncEnv,
  input: {
    date: string;
    slot: "morning" | "evening";
    recommendation: any;
    blog: { title: string; body: string };
  },
  fetchImage: typeof fetch = fetch,
): Promise<StoredDraft> {
  if (!env.CONTENT_STORE) throw new Error("CONTENT_STORE KV가 연결되지 않았습니다.");
  const { date, slot, recommendation, blog } = input;
  const id = date + "-" + slot;
  if (!isValidId(id)) throw new Error("초안 날짜 또는 구분이 올바르지 않습니다.");
  const existing = await env.CONTENT_STORE.get(draftKey(id), "json") as StoredDraft | null;
  if (existing) return existing;

  const product = recommendation?.product ?? {};
  const productId = String(product.productId ?? "");
  const imageUrl = String(product.productImage ?? "");
  const partnerUrl = String(product.partnerUrl ?? "");
  if (!productId || !/^https:\/\//.test(imageUrl) || !/^https:\/\//.test(partnerUrl)) {
    throw new Error("공식 상품 이미지 또는 쿠팡 파트너스 링크가 없습니다.");
  }
  const imageResponse = await fetchImage(imageUrl, { signal: AbortSignal.timeout(12000) });
  if (!imageResponse.ok) throw new Error("쿠팡 이미지 조회 실패: HTTP " + imageResponse.status);
  const reportedSize = Number(imageResponse.headers.get("content-length") ?? "0");
  if (reportedSize > MAX_IMAGE_BYTES) throw new Error("상품 이미지 크기가 허용 범위를 초과합니다.");
  const imageBytes = await imageResponse.arrayBuffer();
  if (!imageBytes.byteLength || imageBytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("상품 이미지가 비었거나 허용 범위를 초과합니다.");
  }
  // 일부 CDN이 image/jpeg 대신 application/octet-stream을 반환하므로 파일 시그니처를 검증합니다.
  const view = new Uint8Array(imageBytes);
  const jpeg = view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff;
  const png = view.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => view[i] === n);
  const webp = view.length >= 12 && String.fromCharCode(...view.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...view.slice(8, 12)) === "WEBP";
  const extension = jpeg ? "jpg" : png ? "png" : webp ? "webp" : null;
  if (!extension) throw new Error("지원하지 않는 상품 이미지 형식입니다.");
  const mime = extension === "jpg" ? "image/jpeg" : extension === "png" ? "image/png" : "image/webp";

  const title = String(blog.title ?? "").trim();
  const content = String(blog.body ?? "").trim();
  if (!title || content.length < 160 || !content.includes(partnerUrl)) {
    throw new Error("검증된 본문 또는 제휴 링크가 없어 초안을 저장하지 않았습니다.");
  }
  const draft: StoredDraft = {
    id, date, slot, createdAt: new Date().toISOString(),
    keyword: String(recommendation.keyword ?? ""),
    productId,
    rank: Number(product.rank) || 0,
    productName: String(product.productName ?? ""),
    productPrice: Number(product.productPrice) || 0,
    priceCheckedAt: String(recommendation.generatedAt ?? new Date().toISOString()),
    title, body: content, disclosure: DISCLOSURE_TEXT,
    partnerUrl, imageFilename: "product." + extension, imageMime: mime,
  };
  // 데이터의 일부만 남는 경우 다시 시도할 수 있도록 본문은 마지막에 기록합니다.
  await env.CONTENT_STORE.put(imageKey(id), imageBytes, { expirationTtl: 60 * 60 * 24 * 120 });
  await env.CONTENT_STORE.put(draftKey(id), JSON.stringify(draft), { expirationTtl: 60 * 60 * 24 * 120 });
  return draft;
}

/** 인증된 클라이언트만 지난 120일 내 글 목록과 이미지 파일을 읽을 수 있습니다. */
export async function handleDraftSync(request: Request, env: SyncEnv): Promise<Response> {
  if (!authorized(request, env)) return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  const url = new URL(request.url);
  if (request.method !== "GET") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  if (!env.CONTENT_STORE) return jsonResponse({ ok: false, error: "KV binding missing" }, 503);
  if (url.pathname === "/sync/drafts") {
    const records: StoredDraft[] = [];
    let cursor: string | undefined;
    do {
      const listing = await env.CONTENT_STORE.list({ prefix: "blogdraft:", limit: 1000, ...(cursor ? { cursor } : {}) });
      const pages = await Promise.all(listing.keys.map((key) => env.CONTENT_STORE!.get(key.name, "json") as Promise<StoredDraft | null>));
      for (const record of pages) if (record && isValidId(record.id)) records.push(record);
      cursor = listing.list_complete ? undefined : listing.cursor;
    } while (cursor && records.length < 3000);
    records.sort((a, b) => a.id.localeCompare(b.id));
    return jsonResponse({ ok: true, drafts: records });
  }
  const match = url.pathname.match(/^\/sync\/drafts\/(\d{4}-\d{2}-\d{2}-(?:morning|evening))\/image$/);
  if (match) {
    const id = match[1];
    const stored = await env.CONTENT_STORE.get(draftKey(id), "json") as StoredDraft | null;
    if (!stored) return jsonResponse({ ok: false, error: "No draft" }, 404);
    const bytes = await env.CONTENT_STORE.get(imageKey(id), "arrayBuffer");
    if (!bytes) return jsonResponse({ ok: false, error: "Image expired" }, 404);
    return new Response(bytes, {
      headers: {
        "Content-Type": stored.imageMime,
        "Content-Disposition": 'attachment; filename="' + stored.imageFilename + '"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return jsonResponse({ ok: false, error: "Not Found" }, 404);
}
