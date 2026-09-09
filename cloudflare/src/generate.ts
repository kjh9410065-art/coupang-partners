/**
 * 수동 생성용 Worker 모듈입니다.
 * 메인 Worker의 실제 생성 파이프라인을 그대로 사용하되,
 * 수동 생성에서는 같은 상품군만 반복되지 않도록 검색 주제를 바꿉니다.
 */

import app from "./index";
import { validateLatestContent } from "./quality-run";
import { createShortAffiliateLink } from "./affiliate";

/** 수동 생성 API에서 사용할 경로입니다. */
export const MANUAL_GENERATE_ROUTE = "/generate";

/** 수동 생성에서 자동으로 순환할 상품 검색 주제입니다. */
const MANUAL_KEYWORDS = [
  "무선청소기",
  "차량용 청소기",
  "캠핑용품",
  "주방 수납용품",
  "생활용품",
  "컴퓨터 주변기기",
  "무선이어폰",
  "공기청정기",
  "운동용품",
  "차량용품",
  "여행용품",
  "욕실용품",
  "조명용품",
  "보온용품",
  "반려동물용품",
];

const MANUAL_KEYWORD_HISTORY = "history:manual-keywords";
const TREND_CACHE_KEY = "trend:today";
const MAX_MANUAL_KEYWORD_HISTORY = 30;

/** 수동 생성 요청의 검색어를 읽습니다. */
export function getGenerateKeyword(request: Request): string | null {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim();
  return keyword ? keyword.slice(0, 100) : null;
}

/**
 * 수동 생성용 검색어를 결정합니다.
 * 직접 keyword를 지정하지 않으면 최근 수동 생성 주제와 현재 자동 생성 주제를 피하면서
 * 서로 다른 상품군을 순환합니다.
 */
async function getManualKeyword(env: Parameters<typeof app.fetch>[1], requestedKeyword: string | null): Promise<string> {
  if (requestedKeyword) return requestedKeyword;

  const history = await env.CONTENT_STORE.get(MANUAL_KEYWORD_HISTORY, "json") as string[] | null;
  const daily = await env.CONTENT_STORE.get(TREND_CACHE_KEY, "json") as { keyword?: string } | null;
  const used = new Set([...(history ?? []), daily?.keyword ?? ""]);

  const selected = MANUAL_KEYWORDS.find((keyword) => !used.has(keyword)) ?? MANUAL_KEYWORDS[0];
  const nextHistory = [...(history ?? []), selected].slice(-MAX_MANUAL_KEYWORD_HISTORY);
  await env.CONTENT_STORE.put(MANUAL_KEYWORD_HISTORY, JSON.stringify(nextHistory));
  return selected;
}

/**
 * 자동 생성용 오늘의 트렌드 캐시를 잠시 수동 생성 주제로 바꿉니다.
 * 생성이 끝나면 원래 값을 복원해 오전 자동 생성 기준에는 영향을 주지 않습니다.
 */
async function runWithManualKeyword(
  env: Parameters<typeof app.fetch>[1],
  ctx: ExecutionContext,
  keyword: string,
) {
  const previousTrend = await env.CONTENT_STORE.get(TREND_CACHE_KEY);
  const previousTrendExpiration = previousTrend ? 60 * 60 * 30 : undefined;

  await env.CONTENT_STORE.put(
    TREND_CACHE_KEY,
    JSON.stringify({ date: new Date().toISOString().slice(0, 10), keyword, source: "manual" }),
    previousTrendExpiration ? { expirationTtl: previousTrendExpiration } : undefined,
  );

  try {
    const controller = { scheduledTime: Date.now(), cron: "manual" } as ScheduledController;
    await app.scheduled(controller, env, ctx);
  } finally {
    if (previousTrend) {
      await env.CONTENT_STORE.put(TREND_CACHE_KEY, previousTrend, { expirationTtl: previousTrendExpiration });
    } else {
      await env.CONTENT_STORE.delete(TREND_CACHE_KEY);
    }
  }
}

/**
 * 생성된 최신 글의 상품 ID를 쿠팡 Deeplink API에 보내 짧은 제휴 링크를 붙입니다.
 * 긴 /re/AFFSDP?... 주소를 그대로 사용하지 않고 shortenUrl을 사용합니다.
 */
async function attachManualAffiliateLink(
  env: Parameters<typeof app.fetch>[1],
): Promise<string> {
  const latest = await env.CONTENT_STORE.get("latest", "json") as any;
  const productId = latest?.recommendation?.product?.productId;
  if (!productId) throw new Error("생성된 콘텐츠에서 쿠팡 상품 ID를 찾을 수 없습니다.");

  const subId = `flick-manual-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
  const shortUrl = await createShortAffiliateLink(env, productId, subId);

  // 게시용 링크만 짧은 제휴 링크로 교체하고 상품 원본 정보는 그대로 보존합니다.
  latest.blog = {
    ...(latest.blog ?? {}),
    partnerUrl: shortUrl,
    productUrl: shortUrl,
  };
  latest.affiliate = {
    ...(latest.affiliate ?? {}),
    originalProductId: productId,
    shortUrl,
    subId,
    platform: "manual",
    createdAt: new Date().toISOString(),
  };

  await env.CONTENT_STORE.put("latest", JSON.stringify(latest));
  return shortUrl;
}

/**
 * 자동 생성과 동일한 실제 콘텐츠 생성 파이프라인을 수동으로 실행하고
 * 생성 직후 품질 검사와 단축 제휴 링크 처리를 수행합니다.
 */
export async function runManualGenerate(
  request: Request,
  env: Parameters<typeof app.fetch>[1],
  ctx: ExecutionContext,
): Promise<Response> {
  const requestedKeyword = getGenerateKeyword(request);
  const manualKeyword = await getManualKeyword(env, requestedKeyword);

  try {
    await runWithManualKeyword(env, ctx, manualKeyword);

    // 생성된 긴 쿠팡 제휴 링크를 공식 Deeplink 단축 링크로 교체합니다.
    const shortUrl = await attachManualAffiliateLink(env);
    const quality = await validateLatestContent(env);

    return Response.json({
      ok: true,
      message: "수동 콘텐츠 생성과 품질 검사 및 단축 링크 처리가 완료되었습니다.",
      requestedKeyword,
      keyword: manualKeyword,
      shortUrl,
      quality,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return Response.json({ ok: false, message, requestedKeyword, keyword: manualKeyword }, { status: 500 });
  }
}
