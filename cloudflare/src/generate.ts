/**
 * 수동 생성용 Worker 모듈입니다.
 * 메인 Worker의 실제 scheduled() 생성 파이프라인을 그대로 호출한 뒤
 * 최신 콘텐츠 품질 검사까지 실행합니다.
 */

import app from "./index";
import { validateLatestContent } from "./quality-run";

/** 수동 생성 API에서 사용할 경로입니다. */
export const MANUAL_GENERATE_ROUTE = "/generate";

/** 수동 생성 요청의 검색어를 읽습니다. */
export function getGenerateKeyword(request: Request): string | null {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim();
  return keyword ? keyword.slice(0, 100) : null;
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
  const controller = { scheduledTime: Date.now(), cron: "manual" } as ScheduledController;

  try {
    await app.scheduled(controller, env, ctx);
    const quality = await validateLatestContent(env);

    return Response.json({
      ok: true,
      message: "수동 콘텐츠 생성과 품질 검사가 완료되었습니다.",
      requestedKeyword,
      quality,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return Response.json({ ok: false, message, requestedKeyword }, { status: 500 });
  }
}
