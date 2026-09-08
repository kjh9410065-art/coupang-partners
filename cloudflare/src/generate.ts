/**
 * 수동 생성용 보조 Worker 모듈입니다.
 *
 * 현재 메인 Worker의 생성 함수가 private 상태라 직접 호출할 수 없으므로,
 * 이 파일은 다음 단계에서 메인 Worker에 연결할 수 있도록 준비합니다.
 */

export const MANUAL_GENERATE_ROUTE = "/generate";

/**
 * 수동 생성 경로가 추가될 때 사용할 기본 응답입니다.
 * 메인 Worker에 연결되기 전까지는 실제 API를 호출하지 않습니다.
 */
export function manualGeneratePlaceholder(): Response {
  return Response.json({
    ok: false,
    message: "수동 생성 기능 연결 준비 완료",
  }, { status: 501 });
}
