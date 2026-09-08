/**
 * 쿠팡파트너스 자동 수익형 콘텐츠 시스템의 Cloudflare Worker입니다.
 *
 * 현재 연결된 기능:
 * - /health : Worker 정상 작동 확인
 * - /secrets-check : API 키 값 자체는 노출하지 않고 Secret 등록 여부만 확인
 * - scheduled() : 나중에 Cron으로 자동 상품 추천/콘텐츠 생성을 실행할 자리
 *
 * API 키는 코드에 넣지 않습니다.
 * Cloudflare Workers Secrets에서 env를 통해 안전하게 읽습니다.
 */

export interface Env {
  // 쿠팡파트너스 Access Key - Cloudflare Secret으로 관리합니다.
  COUPANG_ACCESS_KEY: string;

  // 쿠팡파트너스 Secret Key - Cloudflare Secret으로 관리합니다.
  COUPANG_SECRET_KEY: string;

  // Gemini API Key - Cloudflare Secret으로 관리합니다.
  GEMINI_API_KEY: string;
}

export default {
  /**
   * 웹 요청을 처리합니다.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Worker 자체가 정상 작동하는지 확인하는 기본 엔드포인트입니다.
    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "coupang-partners-automation",
        message: "Cloudflare Worker 정상 작동 중",
      });
    }

    // 실제 API 키 값은 절대 반환하지 않고, 등록 여부만 확인합니다.
    if (url.pathname === "/secrets-check") {
      return Response.json({
        ok: true,
        secrets: {
          coupangAccessKey: Boolean(env.COUPANG_ACCESS_KEY),
          coupangSecretKey: Boolean(env.COUPANG_SECRET_KEY),
          geminiApiKey: Boolean(env.GEMINI_API_KEY),
        },
      });
    }

    // 등록되지 않은 경로입니다.
    return Response.json(
      {
        ok: false,
        message: "존재하지 않는 경로입니다.",
      },
      { status: 404 },
    );
  },

  /**
   * Cloudflare Cron Trigger가 실행할 자동화 작업입니다.
   * 실제 상품 추천/글 생성은 다음 단계에서 연결합니다.
   */
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    console.log("자동화 작업 시작:", controller.cron);

    // 다음 단계에서 쿠팡 상품 추천 → Gemini 콘텐츠 생성 → 저장을 연결합니다.
    // ctx.waitUntil(...)을 이용하면 후속 비동기 작업을 안전하게 연결할 수 있습니다.
  },
};
