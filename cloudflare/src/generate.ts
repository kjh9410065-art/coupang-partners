/**
 * 수동 생성용 Worker 모듈입니다.
 *
 * 메인 Worker의 자동 생성 파이프라인을 직접 복제하지 않고,
 * 공개된 수동 생성 함수 하나만 호출하도록 연결합니다.
 * API 키는 이 파일에서 다루지 않습니다.
 */

import { createManualContent, type Env } from "./index";

/** 수동 생성 API에서 사용할 경로입니다. */
export const MANUAL_GENERATE_ROUTE = "/generate";

/** 수동 생성 요청에 사용할 환경 타입입니다. */
export type GenerateEnv = Env;

/** URL 쿼리에서 검색어를 안전하게 읽습니다. */
export function getGenerateKeyword(request: Request): string | null {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim();
  return keyword ? keyword.slice(0, 100) : null;
}

/** 메인 Worker의 실제 콘텐츠 생성 파이프라인을 실행합니다. */
export async function runManualGenerate(env: GenerateEnv, keyword: string) {
  return createManualContent(env, keyword);
}
