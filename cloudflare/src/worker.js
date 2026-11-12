// TCFLiCK 쿠팡 파트너스 API v2
// 원고 작성·게시 기능과 분리된 상품 검색 및 제휴 링크 전용 서비스입니다.
import { authorized, tokenConfigured } from "./auth.js";
import { CoupangError, searchProducts, createPartnerLink } from "./coupang.js";

const VERSION = "2.0.0";
const HEADERS = {
  "Content-Type": "application/json;charset=UTF-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}
function failure(code, status = 400) {
  return respond({ ok: false, error: code }, status);
}
async function readJson(request) {
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    throw { status: 415, code: "JSON_CONTENT_TYPE_REQUIRED" };
  }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 8192) throw { status: 413, code: "PAYLOAD_TOO_LARGE" };
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 8192) throw { status: 413, code: "PAYLOAD_TOO_LARGE" };
  let data;
  try { data = JSON.parse(text); } catch { throw { status: 400, code: "INVALID_JSON" }; }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw { status: 400, code: "INVALID_JSON_OBJECT" };
  return data;
}
function getKeyword(value) {
  if (typeof value !== "string") throw { status: 400, code: "INVALID_KEYWORD" };
  const keyword = value.trim();
  if (keyword.length < 2 || keyword.length > 60 || /[\u0000-\u001F\u007F]/.test(keyword)) {
    throw { status: 400, code: "INVALID_KEYWORD" };
  }
  return keyword;
}
function getLimit(value, fallback = 10) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 10) throw { status: 400, code: "INVALID_LIMIT" };
  return value;
}
function getProductId(value) {
  if (typeof value !== "string" || !/^\d{4,20}$/.test(value)) throw { status: 400, code: "INVALID_PRODUCT_ID" };
  return value;
}

export async function handleRequest(request, env, _ctx, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (request.method === "GET" && path === "/health") {
    return respond({ ok: true, service: "coupang-partners", version: VERSION, status: "alive" });
  }
  if (request.method === "GET" && path === "/") {
    return respond({ ok: true, service: "coupang-partners", version: VERSION,
      endpoints: ["/health", "/v1/products/search", "/v1/links", "/v1/recommend"] });
  }
  if (path === "/recommend" || path.startsWith("/sync/")) return failure("LEGACY_ENDPOINT_REMOVED", 410);
  const routes = ["/v1/products/search", "/v1/links", "/v1/recommend"];
  if (!routes.includes(path)) return failure("NOT_FOUND", 404);
  if (request.method !== "POST") return failure("METHOD_NOT_ALLOWED", 405);
  if (!tokenConfigured(env)) return failure("SERVICE_NOT_CONFIGURED", 503);
  if (!authorized(request, env)) return failure("UNAUTHORIZED", 401);

  try {
    const body = await readJson(request);
    if (path === "/v1/products/search") {
      const keyword = getKeyword(body.keyword);
      const limit = getLimit(body.limit);
      const products = await searchProducts(env, keyword, limit, fetchImpl);
      return respond({ ok: true, keyword, count: products.length, products });
    }
    if (path === "/v1/links") {
      const productId = getProductId(body.productId);
      return respond({ ok: true, ...(await createPartnerLink(env, productId, fetchImpl)) });
    }
    // 한 번의 API 호출로 서로 다른 상품 최대 2개 선택 및 단축링크 발급
    if (!Array.isArray(body.keywords) || body.keywords.length < 1 || body.keywords.length > 5) {
      return failure("INVALID_KEYWORDS");
    }
    const keywords = [...new Set(body.keywords.map(getKeyword))];
    const count = body.count === undefined ? 1 : body.count;
    if (!Number.isInteger(count) || count < 1 || count > 2) return failure("INVALID_COUNT");
    const excluded = body.excludeProductIds === undefined ? [] : body.excludeProductIds;
    if (!Array.isArray(excluded) || excluded.length > 100 ||
        !excluded.every((id) => typeof id === "string" && /^\d{4,20}$/.test(id))) {
      return failure("INVALID_EXCLUSIONS");
    }
    const seen = new Set(excluded);
    const selections = [];
    for (const keyword of keywords) {
      const products = await searchProducts(env, keyword, 10, fetchImpl);
      for (const product of products) {
        if (seen.has(product.productId)) continue;
        seen.add(product.productId);
        const link = await createPartnerLink(env, product.productId, fetchImpl);
        selections.push({ keyword, ...product, ...link });
        if (selections.length >= count) break;
      }
      if (selections.length >= count) break;
    }
    if (!selections.length) return failure("NO_AVAILABLE_PRODUCT", 404);
    return respond({ ok: true, count: selections.length, products: selections });
  } catch (error) {
    if (error instanceof CoupangError) {
      return failure(error.code, error.code === "COUPANG_NOT_CONFIGURED" ? 503 : 502);
    }
    if (error?.status && error?.code) return failure(error.code, error.status);
    return failure("INTERNAL_ERROR", 500);
  }
}

export default { fetch: handleRequest };
