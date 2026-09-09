/**
 * 수동 생성용 Worker 모듈입니다.
 *
 * 메인 Worker의 실제 scheduled() 생성 파이프라인을 그대로 호출합니다.
 * 따라서 수동 실행도 자동 실행과 동일한 상품 선정/본문 생성 로직을 사용합니다.
 */

import app from "./index";

/** 수동 생성 API에서 사용할 경로입니다. */
export const MANUAL_GENERATE_ROUTE = "/generate";

/**
 * 수동 생성 요청의 검색어를 읽습니다.
 * 현재 메인 파이프라인은 당일 트렌드 키워드를 기준으로 동작하므로
 * 검색어는 실행 기록에 참고용으로만 반환합니다.
 */
export function getGenerateKeyword(request: Request): string | null {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim();
  return keyword ? keyword.slice(0, 100) : null;
}

/**
 * 자동 생성과 동일한 실제 콘텐츠 생성 파이프라인을 수동으로 실행합니다.
 * 쿠팡 API 검색과 Gemini 호출이 실제로 발생하므로 테스트 버튼을 반복해서 누르지 않습니다.
 */
export async function runManualGenerate(
  request: Request,
  env: Parameters<typeof app.fetch>[1],
  ctx: ExecutionContext,
): Promise<Response> {
  const requestedKeyword = getGenerateKeyword(request);

  // scheduled()와 동일한 현재 시각을 사용해 실제 자동 생성 함수를 호출합니다.
  const controller = {
    scheduledTime: Date.now(),
    cron: "manual",
  } as ScheduledController;

  try {
    await app.scheduled(controller, env, ctx);

    return Response.json({
      ok: true,
      message: "수동 콘텐츠 생성이 완료되었습니다.",
      requestedKeyword,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return Response.json({
      ok: false,
      message,
      requestedKeyword,
    }, { status: 500 });
  }
}
