import app from "./index";
import { runBootstrap, type BootstrapEnv } from "./bootstrap";

/**
 * 기존 Worker 기능을 감싸는 진입점입니다.
 *
 * 이번 패치에서는 자동 Cron이 중복 실행되는 상황을 막기 위한
 * 짧은 실행 잠금만 추가합니다.
 * - 같은 날짜에 이미 실행 중이면 두 번째 실행을 건너뜁니다.
 * - 잠금은 최대 45분 후 자동으로 만료됩니다.
 * - 실제 콘텐츠 생성 로직은 기존 index.ts에 그대로 맡깁니다.
 */
const DAILY_LOCK_PREFIX = "lock:daily:";
const DAILY_LOCK_TTL = 45 * 60;

/** 현재 Cron 실행의 날짜 키를 만듭니다. */
function getRunDate(controller: ScheduledController): string {
  return new Date(controller.scheduledTime).toISOString().slice(0, 10);
}

const handler = {
  async fetch(request: Request, env: BootstrapEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // 초기 생성은 KV 잠금으로 단 한 번만 실행되므로 배포 확인을 위해 GET도 허용합니다.
    if (url.pathname === "/generate-bootstrap") {
      try {
        const keyword = url.searchParams.get("keyword")?.trim() || "무선청소기";
        const result = await runBootstrap(env, keyword);
        return Response.json({ ok: true, message: "초기 콘텐츠 생성이 완료되었습니다.", ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        return Response.json({ ok: false, message }, { status: 500 });
      }
    }

    // 기존 대시보드, /health, /latest, /status 등은 원래 Worker로 그대로 전달합니다.
    return app.fetch(request, env, ctx);
  },

  /**
   * 매일 오전 9시(한국시간)에 실행됩니다.
   *
   * Cloudflare Cron이 예기치 않게 중복 전달되거나 수동 재실행되는 경우에도
   * 같은 날짜에 쿠팡 검색/Gemini 생성이 중복 호출되지 않도록 보호합니다.
   */
  async scheduled(controller: ScheduledController, env: BootstrapEnv, ctx: ExecutionContext) {
    const runDate = getRunDate(controller);
    const lockKey = `${DAILY_LOCK_PREFIX}${runDate}`;

    // 이미 같은 날짜의 생성 작업이 진행 중이면 추가 API 호출 없이 종료합니다.
    const existingLock = await env.CONTENT_STORE.get(lockKey);
    if (existingLock) {
      console.log(`오늘(${runDate}) 자동 생성이 이미 실행 중이므로 중복 실행을 건너뜁니다.`);
      return;
    }

    // 잠금은 45분 뒤 자동 만료됩니다. Worker가 비정상 종료되어도 영구적으로 남지 않습니다.
    await env.CONTENT_STORE.put(
      lockKey,
      JSON.stringify({ startedAt: new Date().toISOString(), cron: controller.cron }),
      { expirationTtl: DAILY_LOCK_TTL },
    );

    try {
      // 실제 트렌드 선택 → 상품 선정 → 이미지 → 본문 생성은 기존 로직을 그대로 사용합니다.
      await app.scheduled(controller, env, ctx);
    } catch (error) {
      // index.ts에서 이미 상세 실패 상태를 기록하므로 여기서는 로그만 남기고 오류는 다시 전달합니다.
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      console.error(`일일 자동 생성 실패 (${runDate}):`, message);
      throw error;
    } finally {
      // 작업이 정상/실패 어느 쪽이든 끝났으면 잠금을 제거합니다.
      // 실패 시에는 Cloudflare Cron의 재실행 가능성을 막지 않고 정상적인 다음 실행을 허용합니다.
      await env.CONTENT_STORE.delete(lockKey);
    }
  },
};

export default handler;
