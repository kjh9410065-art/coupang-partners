// 쿠팡 공식 Partners Open API 연동. 인증키는 Worker 환경변수에서만 읽습니다.
const API_HOST = "https://api-gateway.coupang.com";
const SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const DEEPLINK_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";

export class CoupangError extends Error {
  constructor(code) {
    super(code);
    this.name = "CoupangError";
    this.code = code;
  }
}

async function authorization(env, method, path, query = "") {
  if (!env?.COUPANG_ACCESS_KEY || !env?.COUPANG_SECRET_KEY) throw new CoupangError("COUPANG_NOT_CONFIGURED");
  const signedDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
  const message = signedDate + method.toUpperCase() + path + query;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env.COUPANG_SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  const signature = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return "CEA algorithm=HmacSHA256, access-key=" + env.COUPANG_ACCESS_KEY +
    ", signed-date=" + signedDate + ", signature=" + signature;
}

async function callCoupang(env, method, path, query = "", payload, fetchImpl = fetch) {
  const url = API_HOST + path + (query ? "?" + query : "");
  const headers = {
    Authorization: await authorization(env, method, path, query),
    "Content-Type": "application/json;charset=UTF-8"
  };
  let response;
  try {
    response = await fetchImpl(url, {
      method, headers,
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new CoupangError("UPSTREAM_UNREACHABLE");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new CoupangError("UPSTREAM_INVALID_JSON");
  }
  if (!response.ok || String(data?.rCode) !== "0") {
    // 쿠팡의 원본 오류를 외부 응답에 출력하지 않습니다.
    throw new CoupangError("UPSTREAM_REJECTED");
  }
  return data.data;
}

export async function searchProducts(env, keyword, limit = 10, fetchImpl = fetch) {
  const query = new URLSearchParams({ keyword, limit: String(limit) }).toString();
  const result = await callCoupang(env, "GET", SEARCH_PATH, query, undefined, fetchImpl);
  if (!Array.isArray(result?.productData)) throw new CoupangError("UPSTREAM_INVALID_DATA");
  return result.productData
    .map((product) => ({
      productId: String(product.productId ?? "").trim(),
      productName: String(product.productName ?? "").trim(),
      productImage: String(product.productImage ?? ""),
      productUrl: String(product.productUrl ?? ""),
      rank: Number(product.rank) || 999,
      isRocket: Boolean(product.isRocket)
    }))
    .filter((product) => /^\d+$/.test(product.productId) && product.productName &&
      /^https:\/\/(www\.)?coupang\.com\//i.test(product.productUrl))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}

export async function createPartnerLink(env, productId, fetchImpl = fetch) {
  // 외부에서 전달받은 임의 URL이 아닌, 검증된 상품 ID로만 딥링크 발급
  if (typeof productId !== "string" || !/^\d{4,20}$/.test(productId)) {
    throw new CoupangError("INVALID_PRODUCT_ID");
  }
  const productUrl = "https://www.coupang.com/vp/products/" + productId;
  const result = await callCoupang(env, "POST", DEEPLINK_PATH, "", {
    coupangUrls: [productUrl]
  }, fetchImpl);
  const partnerUrl = result?.[0]?.shortenUrl;
  if (typeof partnerUrl !== "string") throw new CoupangError("UPSTREAM_INVALID_LINK");
  let parsed;
  try { parsed = new URL(partnerUrl); } catch { throw new CoupangError("UPSTREAM_INVALID_LINK"); }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || !["link.coupang.com", "coupa.ng", "www.coupang.com", "coupang.com"].includes(hostname)) {
    throw new CoupangError("UPSTREAM_INVALID_LINK");
  }
  return { productId, productUrl, partnerUrl };
}
