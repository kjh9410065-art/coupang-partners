import test from "node:test";
import assert from "node:assert/strict";
import { saveBlogDraft, handleDraftSync, authorized, draftKey } from "../src/draft-sync.ts";

const token = "test-token-example-for-automated-sync-123456";
function memoryKv() {
  const data = new Map();
  return {
    data,
    async get(key, type) {
      const item = data.get(key);
      if (item === undefined) return null;
      return type === "json" ? JSON.parse(item) : item;
    },
    async put(key, item) {
      data.set(key, item);
    },
    async list({ prefix }) {
      return { keys: [...data.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
    },
  };
}
function sample(date = "2026-10-15", slot = "morning", productId = "111") {
  const url = "https://link.coupang.com/a/test";
  return {
    date, slot,
    recommendation: {
      keyword: "생활용품",
      generatedAt: "2026-10-15T00:00:00.000Z",
      product: {
        productId, rank: 1, productName: "수납함 12L", productPrice: 20000,
        productImage: "https://thumbnail.coupangcdn.com/test.jpg",
        partnerUrl: url,
      },
    },
    blog: {
      title: "수납함 상품 정보",
      body: "수납 공간을 정리할 때는 물건의 부피와 보관 위치를 고려하는 편이 좋습니다. ".repeat(5) + "\n\n" +
            "수납함을 살펴볼 때 구성 정보를 확인해 활용할 상황에 맞는지 판단할 수 있습니다. ".repeat(5) +
            "\n\n" + url,
    },
  };
}
const mockImage = async () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
  status: 200, headers: { "content-type": "image/jpeg" },
});

test("requires an authenticated secret to read drafts", async () => {
  const env = { CONTENT_STORE: memoryKv() };
  const req = new Request("https://test.workers.dev/sync/drafts");
  assert.equal(authorized(req, env), false);
  assert.equal((await handleDraftSync(req, env)).status, 401);
  assert.equal((await handleDraftSync(req, { ...env, DRAFT_SYNC_TOKEN: token })).status, 401);
});

test("saves official image bytes together with a copy-ready draft", async () => {
  const env = { CONTENT_STORE: memoryKv(), DRAFT_SYNC_TOKEN: token };
  const draft = await saveBlogDraft(env, sample(), mockImage);
  assert.equal(draft.id, "2026-10-15-morning");
  assert.equal(draft.imageFilename, "product.jpg");
  assert.equal(draft.productPrice, 20000);
  const req = (path) => new Request("https://test.workers.dev" + path, {
    headers: { Authorization: "Bearer " + token },
  });
  const listing = await (await handleDraftSync(req("/sync/drafts"), env)).json();
  assert.equal(listing.drafts.length, 1);
  assert.equal(listing.drafts[0].body.includes(draft.partnerUrl), true);
  const image = await handleDraftSync(req("/sync/drafts/" + draft.id + "/image"), env);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.deepEqual([...new Uint8Array(await image.arrayBuffer())], [0xff, 0xd8, 0xff, 0xd9]);
});

test("retries do not duplicate an existing draft or redownload its image", async () => {
  const env = { CONTENT_STORE: memoryKv() };
  await saveBlogDraft(env, sample(), mockImage);
  const result = await saveBlogDraft(env, sample(), () => { throw new Error("should not fetch again"); });
  assert.equal(result.id, "2026-10-15-morning");
  assert.equal(env.CONTENT_STORE.data.size, 2);
});

test("one date has separate morning and evening drafts", async () => {
  const env = { CONTENT_STORE: memoryKv(), DRAFT_SYNC_TOKEN: token };
  await saveBlogDraft(env, sample(), mockImage);
  await saveBlogDraft(env, sample("2026-10-15", "evening", "222"), mockImage);
  assert.equal(env.CONTENT_STORE.data.size, 4);
  assert.ok(env.CONTENT_STORE.data.has(draftKey("2026-10-15-evening")));
});

test("missing or unsupported product image prevents an incomplete draft", async () => {
  const env = { CONTENT_STORE: memoryKv() };
  await assert.rejects(() => saveBlogDraft(env, sample(), async () => new Response("html", { headers: { "content-type": "text/html" } })), /지원하지 않는/);
  assert.equal(env.CONTENT_STORE.data.size, 0);
});
