import app from "./index";
import { runBootstrap, type BootstrapEnv } from "./bootstrap";

/**
 * 기존 Worker 기능은 그대로 유지하면서
 * 배포 직후 1회 실제 생성 테스트를 실행할 수 있는 경로만 추가합니다.
 */
const handler = {
  async fetch(request: Request, env: BootstrapEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // 브라우저에서 직접 실행되는 것을 막고 POST만 허용합니다.
    if (url.pathname === "/generate-bootstrap") {
      if (request.method !== "POST") {
        return Response.json({ ok: false, message: "POST 요청만 허용됩니다." }, { status: 405 });
      }

      try {
        // 쿼리로 검색어를 지정하지 않으면 현재 기본 상품군으로 1회 생성합니다.
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

  // 기존 자동 Cron 실행을 그대로 유지합니다.
  async scheduled(controller: ScheduledController, env: BootstrapEnv, ctx: ExecutionContext) {
    return app.scheduled(controller, env, ctx);
  },
};

export default handler;
