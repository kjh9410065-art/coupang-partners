import test from "node:test";
import assert from "node:assert/strict";
import { buildBlog, DISCLOSURE } from "../src/blog.ts";

const recommendation = {
  keyword: "캠핑 수납",
  generatedAt: "2026-10-15T07:10:00.000Z",
  product: {
    productName: "접이식 캠핑 수납함 30L",
    productPrice: 19000,
    partnerUrl: "https://link.coupang.com/a/mock",
    isRocket: true,
    productId: 12345,
  },
};
const safe = [
  "캠핑 장비를 정리할 때는 어떤 물건을 담을지에 따라 수납함을 선택하는 기준이 달라집니다. 이번 제품은 접이식 캠핑 수납함으로 소개되어 있어 보관할 공간과 짐의 부피를 먼저 생각하고 살펴보기 좋습니다. 여러 물건을 한곳에 모아 두려는 상황이라면 수납함의 크기를 어떻게 활용할지 고민해 볼 만합니다.",
  "표기된 상품명에는 30L라는 용량이 포함되어 있습니다. 작은 소품을 한꺼번에 정리하려는지, 부피가 큰 물건을 담으려는지에 따라 적절한 수납 형태는 달라질 수 있습니다. 실제 사용 장소의 공간을 먼저 살펴본 다음 구매 여부를 판단하는 편이 합리적입니다.",
].join("\n\n");

test("AI 원고를 검토한 뒤 고지문 중복 없이 복사 가능한 결과를 만든다", async () => {
  let calls = 0;
  const ai = { async run() { calls++; return { response: safe }; } };
  const result = await buildBlog(recommendation, ai);
  assert.equal(calls, 1);
  assert.equal(result.titles.length, 3);
  assert.match(result.body, /19,000원/);
  assert.match(result.body, /2026/);
  assert.ok(result.body.includes(recommendation.product.partnerUrl));
  assert.ok(!result.body.includes(DISCLOSURE));
  assert.equal(result.body.split(recommendation.product.partnerUrl).length - 1, 1);
});

test("명시적인 AI 연결 없이 그럴듯한 가짜 본문을 만들어내지 않는다", async () => {
  await assert.rejects(() => buildBlog(recommendation), /Workers AI/);
});

test("후기인 척하는 AI 출력을 두 번 검사한 뒤 차단한다", async () => {
  let calls = 0;
  const ai = { async run() { calls++; return { response: "직접 사용해보니 정말 좋았습니다.\n\n" + safe }; } };
  await assert.rejects(() => buildBlog(recommendation, ai), /품질 검사를 통과/);
  assert.equal(calls, 2);
});

test("상품명에서 확인되지 않은 숫자 사양을 차단한다", async () => {
  const ai = { async run() { return { response: safe + "\n\n배터리 용량은 5000mAh입니다." }; } };
  await assert.rejects(() => buildBlog(recommendation, ai), /품질 검사를 통과/);
});

test("본문 가격을 AI가 작성하면 쿠팡 가격과 중복될 수 있어 차단한다", async () => {
  const ai = { async run() { return { response: safe + "\n\n판매 가격은 19,000원입니다." }; } };
  await assert.rejects(() => buildBlog(recommendation, ai), /품질 검사를 통과/);
});
