/**
 * 수동 생성용 Worker 모듈입니다.
 * 메인 Worker의 실제 생성 파이프라인을 그대로 사용하되,
 * 수동 생성에서는 같은 상품군만 반복되지 않도록 검색 주제를 바꿉니다.
 */

import app from "./index";
import { validateLatestContent } from "./quality-run";

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
 * 자동 생성과 동일한 실제 콘텐츠 생성 파이프라인을 수동으로 실행하고
 * 생성 직후 품질 검사를 기록합니다.
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
    const quality = await validateLatestContent(env);

    return Response.json({
      ok: true,
      message: "수동 콘텐츠 생성과 품질 검사가 완료되었습니다.",
      requestedKeyword,
      keyword: manualKeyword,
      quality,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return Response.json({ ok: false, message, requestedKeyword, keyword: manualKeyword }, { status: 500 });
  }
}
