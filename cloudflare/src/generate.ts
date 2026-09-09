/**
 * 수동 생성용 Worker 모듈입니다.
 *
 * 현재는 메인 Worker의 생성 함수가 private이므로 실제 호출은 다음 연결 단계에서 합니다.
 * 이 파일 자체가 배포를 깨뜨리지 않도록 메인 Worker를 import하지 않습니다.
 */

/** 수동 생성 API에서 사용할 경로입니다. */
export const MANUAL_GENERATE_ROUTE = "/generate";

/** 수동 생성 요청에서 사용할 검색어를 안전하게 읽습니다. */
export function getGenerateKeyword(request: Request): string | null {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim();
  return keyword ? keyword.slice(0, 100) : null;
}

/**
 * 메인 Worker 연결 전의 안전한 대기 응답입니다.
 * 다음 패치에서 index.ts의 실제 생성 함수와 연결합니다.
 */
export function manualGeneratePlaceholder(): Response {
  return Response.json({
    ok: false,
    message: "수동 생성 기능 연결 준비 완료",
  }, { status: 501 });
}
