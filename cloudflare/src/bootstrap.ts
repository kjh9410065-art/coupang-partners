/**
 * 배포 직후 자동 콘텐츠 생성 확인용 1회성 모듈입니다.
 * 본 자동 생성과 동일한 상품 소개형 글 구조를 사용합니다.
 */

export interface BootstrapEnv {
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
  GEMINI_API_KEY: string;
  CONTENT_STORE: KVNamespace;
}

import { buildProductPost } from "./content-template-fixed";

const COUPANG_HOST = "https://api-gateway.coupang.com";
const COUPANG_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";
const BOOTSTRAP_LOCK = "bootstrap-generation-completed";
const USED_PRODUCTS_KEY = "history:products";
const USED_TITLES_KEY = "history:titles";
const MAX_HISTORY = 120;

async function auth(env: BootstrapEnv, method: string, path: string, query: string) {
  const signedDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
  const message = signedDate + method.toUpperCase() + path + query;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.COUPANG_SECRET_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const hex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${hex}`;
}

async function search(env: BootstrapEnv, keyword: string) {
  const query = `keyword=${encodeURIComponent(keyword)}`;
  const response = await fetch(`${COUPANG_HOST}${COUPANG_SEARCH_PATH}?${query}`, {
    headers: { Authorization: await auth(env, "GET", COUPANG_SEARCH_PATH, query), "Content-Type": "application/json;charset=UTF-8" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`쿠팡 API 오류 (${response.status}): ${text.slice(0, 400)}`);
  const data = JSON.parse(text);
  return Array.isArray(data?.data?.productData) ? data.data.productData.map((p: any) => ({
    productId: p.productId ?? null,
    productName: p.productName ?? "",
    productImage: p.productImage ?? "",
    productUrl: p.productUrl ?? "",
  })) : [];
}

export async function runBootstrap(env: BootstrapEnv, keyword = "무선청소기") {
  if (await env.CONTENT_STORE.get(BOOTSTRAP_LOCK)) throw new Error("이미 1회 생성 테스트가 완료되었습니다.");
  const products = await search(env, keyword);
  if (!products.length) throw new Error("쿠팡 검색 결과가 없습니다.");
  const usedProductIds = await env.CONTENT_STORE.get(USED_PRODUCTS_KEY, "json") as string[] | null;
  const product = products.find((p: any) => !usedProductIds?.includes(String(p.productId)));
  if (!product) throw new Error("이번 검색 결과가 모두 과거 홍보 상품입니다.");
  const generated = buildProductPost(keyword, product.productName, [product.productName]);
  const blog = {
    disclosure: DISCLOSURE,
    titles: generated.titles,
    selectedTitle: generated.selectedTitle,
    body: generated.body,
    imageUrls: product.productImage ? [product.productImage] : [],
    partnerUrl: product.productUrl,
  };
  const now = new Date();
  const record = { savedAt: now.toISOString(), keyword, recommendation: { product, reason: "검색어와 상품명을 기준으로 선정했습니다." }, blog };
  const storageKey = `post:${now.toISOString()}`;
  await env.CONTENT_STORE.put(storageKey, JSON.stringify(record));
  await env.CONTENT_STORE.put("latest", JSON.stringify(record));
  await env.CONTENT_STORE.put(USED_PRODUCTS_KEY, JSON.stringify([...(usedProductIds ?? []), String(product.productId)].slice(-MAX_HISTORY)));
  const historyTitles = await env.CONTENT_STORE.get(USED_TITLES_KEY, "json") as string[] | null;
  await env.CONTENT_STORE.put(USED_TITLES_KEY, JSON.stringify([...(historyTitles ?? []), ...blog.titles].slice(-MAX_HISTORY)));
  await env.CONTENT_STORE.put(BOOTSTRAP_LOCK, JSON.stringify({ completedAt: now.toISOString(), storageKey }));
  await env.CONTENT_STORE.put("last-run", JSON.stringify({ status: "success", type: "bootstrap", keyword, storageKey, finishedAt: now.toISOString() }));
  return { storageKey, record };
}
