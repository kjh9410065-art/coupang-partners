/**
 * 쿠팡파트너스 자동 수익형 콘텐츠 시스템의 Cloudflare Worker입니다.
 *
 * 현재는 기반만 구성합니다.
 * - /health : Worker가 정상적으로 실행되는지 확인
 * - scheduled() : 나중에 Cron으로 상품 추천/콘텐츠 생성을 실행할 자리
 *
 * API 키는 코드에 넣지 않습니다.
 * 실제 배포 시 Cloudflare Workers Secrets에 등록하고 env에서 읽습니다.
 */

export interface Env {
  // 쿠팡파트너스 Access Key - Cloudflare Secret으로 등록할 예정입니다.
  COUPANG_ACCESS_KEY: string;

  // 쿠팡파트너스 Secret Key - Cloudflare Secret으로 등록할 예정입니다.
  COUPANG_SECRET_KEY: string;

  // Gemini API Key - Cloudflare Secret으로 등록할 예정입니다.
  GEMINI_API_KEY: string;
}

export default {
  /**
   * 웹 요청을 처리합니다.
   * 우선 상태 확인용 /health 엔드포인트만 제공합니다.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "coupang-partners-automation",
        message: "Cloudflare Worker 정상 작동 중",
      });
    }

    return Response.json(
      {
        ok: false,
        message: "존재하지 않는 경로입니다.",
      },
      { status: 404 },
    );
  },

  /**
   * Cloudflare Cron Trigger가 실행할 작업입니다.
   * 실제 자동 상품 추천/글 생성은 다음 단계에서 연결합니다.
   *
   * Cron은 UTC 기준으로 실행되므로 한국 시간은 나중에 원하는 시간에 맞춰 설정합니다.
   */
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log("자동화 작업 시작:", controller.cron);

    // TODO: 쿠팡 상품 추천 → Gemini 콘텐츠 생성 → 저장 작업을 연결합니다.
    // ctx.waitUntil(...)을 이용하면 후속 비동기 작업을 스케줄 실행과 연결할 수 있습니다.
  },
};
