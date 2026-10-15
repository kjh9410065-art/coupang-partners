import test from "node:test";
import assert from "node:assert/strict";
import { getTodayRecommendation, koreaDate } from "../src/recommend.ts";

function cachedDraft(minutesAgo) {
  return {
    date: koreaDate(),
    keyword: "무선청소기",
    generatedAt: new Date(Date.now() - minutesAgo * 60000).toISOString(),
    product: { productId: "101", productName: "이전 상품", productPrice: 10000, partnerUrl: "https://link.coupang.com/a/old" },
  };
}

test("30분 이내의 최신 캐시가 있으면 추가 API 호출 없이 유지한다", async () => {
  const original = globalThis.fetch;
  const cached = cachedDraft(5);
  try {
    globalThis.fetch = async () => { throw new Error("fresh cache should avoid network"); };
    const record = await getTodayRecommendation({
      COUPANG_ACCESS_KEY: "test",
      COUPANG_SECRET_KEY: "test",
      CONTENT_STORE: { async get() { return cached; }, async put() {} },
    });
    assert.equal(record.product.productPrice, 10000);
  } finally {
    globalThis.fetch = original;
  }
});

test("30분을 넘긴 캐시는 새 쿠팡 가격으로 갱신한다", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const cache = cachedDraft(31);
  try {
    globalThis.fetch = async (url) => {
      calls++;
      const u = String(url);
      if (u.includes("trends.google.com")) return new Response("<rss></rss>", { status: 200 });
      if (u.includes("/products/search")) {
        return Response.json({ rCode: "0", data: { productData: [
          { productId: 101, productName: "새 무선청소기", productPrice: 21000, productImage: "https://example.com/p.jpg", productUrl: "https://www.coupang.com/vp/products/101", rank: 1, isRocket: true },
        ] } });
      }
      if (u.includes("/v1/deeplink")) {
        return Response.json({ rCode: "0", data: [{ shortenUrl: "https://link.coupang.com/a/new" }] });
      }
      throw new Error("Unexpected request: " + u);
    };
    const record = await getTodayRecommendation({
      COUPANG_ACCESS_KEY: "test",
      COUPANG_SECRET_KEY: "test",
      CONTENT_STORE: { async get() { return cache; }, async put(_key, value) { Object.assign(cache, JSON.parse(value)); } },
    });
    assert.equal(record.product.productPrice, 21000);
    assert.ok(calls >= 3);
  } finally {
    globalThis.fetch = original;
  }
});
