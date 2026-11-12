import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { handleRequest } from "../src/worker.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const token = "0123456789abcdef0123456789abcdef";
const env = {
  BLOG_API_TOKEN: token,
  COUPANG_ACCESS_KEY: "access-for-tests",
  COUPANG_SECRET_KEY: "secret-for-tests"
};
const p = (id, rank) => ({
  productId: id, productName: "테스트 물품 " + id,
  productImage: "https://example.com/" + id + ".jpg",
  productUrl: "https://www.coupang.com/vp/products/" + id,
  productPrice: 12345, rank, isRocket: true
});
function client(path, body, opts = {}) {
  const headers = opts.headers || { Authorization: "Bearer " + token, "Content-Type": "application/json" };
  return new Request("https://worker.example" + path, {
    method: opts.method || "POST", headers,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) })
  });
}
function mockFetch(calls = [], products = [p("12345678", 1), p("23456789", 2)], link = "https://link.coupang.com/a/abc") {
  return async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/products/search?")) {
      return Response.json({ rCode: "0", data: { productData: products } });
    }
    if (url.includes("/v1/deeplink")) {
      return Response.json({ rCode: "0", data: [{ shortenUrl: link }] });
    }
    return Response.json({ rCode: "400", rMessage: "bad" }, { status: 400 });
  };
}
async function run(req, injected = mockFetch(), customEnv = env) {
  const res = await handleRequest(req, customEnv, undefined, { fetchImpl: injected });
  return { status: res.status, json: await res.json(), headers: res.headers };
}

test("GET health available without auth and does not claim Coupang API checked", async () => {
  const r = await run(new Request("https://worker.example/health", { method: "GET" }));
  assert.equal(r.status, 200);
  assert.equal(r.json.status, "alive");
  assert.equal(r.json.version, "2.0.0");
});
test("all business API routes require Bearer token", async () => {
  for (const path of ["/v1/products/search", "/v1/links", "/v1/recommend"]) {
    const r = await run(client(path, {}, { headers: { "Content-Type": "application/json" } }));
    assert.equal(r.status, 401);
  }
  const r = await run(client("/v1/links", {}, { headers: { Authorization: "Bearer wrong", "Content-Type": "application/json" } }));
  assert.equal(r.status, 401);
});
test("missing service token fails closed", async () => {
  const r = await run(client("/v1/products/search", { keyword: "가습기" }), mockFetch(), { ...env, BLOG_API_TOKEN: "" });
  assert.equal(r.status, 503);
  assert.equal(r.json.error, "SERVICE_NOT_CONFIGURED");
});
test("product search returns product information but no price", async () => {
  const calls = [];
  const r = await run(client("/v1/products/search", { keyword: "주방용품", limit: 2 }), mockFetch(calls));
  assert.equal(r.status, 200);
  assert.equal(r.json.count, 2);
  assert.equal(r.json.products[0].productId, "12345678");
  assert.equal(r.json.products[0].productPrice, undefined);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes("keyword="));
  assert.match(calls[0].init.headers.Authorization, /^CEA algorithm=HmacSHA256/);
});
test("product ID is used to build canonical Coupang URL for deep link", async () => {
  const calls = [];
  const r = await run(client("/v1/links", { productId: "12345678" }), mockFetch(calls));
  assert.equal(r.status, 200);
  assert.equal(r.json.partnerUrl, "https://link.coupang.com/a/abc");
  assert.equal(JSON.parse(calls[0].init.body).coupangUrls[0], "https://www.coupang.com/vp/products/12345678");
});
test("recommend selects two distinct IDs and excludes previously used product", async () => {
  const calls = [];
  const r = await run(client("/v1/recommend", {
    keywords: ["주방용품", "생활용품"], count: 2, excludeProductIds: ["12345678"]
  }), mockFetch(calls, [p("12345678", 1), p("23456789", 2), p("34567890", 3)]));
  assert.equal(r.status, 200);
  assert.equal(r.json.count, 2);
  assert.deepEqual(r.json.products.map(x => x.productId), ["23456789", "34567890"]);
  assert.ok(r.json.products.every(x => x.partnerUrl));
});
test("rejects invalid input, invalid JSON and oversized payload", async () => {
  assert.equal((await run(client("/v1/products/search", { keyword: "x" }))).status, 400);
  assert.equal((await run(client("/v1/links", { productId: "../hi" }))).status, 400);
  assert.equal((await run(client("/v1/recommend", { keywords: [], count: 3 }))).status, 400);
  assert.equal((await run(client("/v1/products/search", "NOT JSON"))).status, 400);
  assert.equal((await run(client("/v1/products/search", "x".repeat(9000)))).status, 413);
});
test("disallows non-Coupang affiliate URLs returned by upstream", async () => {
  const r = await run(client("/v1/links", { productId: "12345678" }), mockFetch([], [], "https://evil.example/link"));
  assert.equal(r.status, 502);
  assert.equal(r.json.error, "UPSTREAM_INVALID_LINK");
});
test("does not leak upstream errors or secrets in response", async () => {
  const upstream = async () => Response.json({ rCode: "403", rMessage: "secret-for-tests" }, { status: 403 });
  const r = await run(client("/v1/products/search", { keyword: "생활용품" }), upstream);
  assert.equal(r.status, 502);
  assert.equal(r.json.error, "UPSTREAM_REJECTED");
  assert.ok(!JSON.stringify(r.json).includes("secret-for-tests"));
});
test("legacy paths are retired without triggering old blog-generation flow", async () => {
  const r = await run(new Request("https://worker.example/recommend", { method: "GET" }));
  assert.equal(r.status, 410);
});
