/**
 * 수동 생성용 Worker 모듈입니다.
 *
 * 메인 Worker에서 사용할 수 있도록 생성 요청의 입력값을 정리하고,
 * 실제 생성은 index.ts의 공개 함수가 담당하도록 연결하는 중간 계층입니다.
 *
 * 현재 단계에서는 API 키를 직접 다루지 않으며 Cloudflare Worker의 Env를 그대로 전달합니다.
 */

import { createManualContent, type Env } from "./index";

/** 수동 생성 API에서 사용할 경로입니다. */
export const MANUAL_GENERATE_ROUTE = "/generate";

/** 수동 생성 요청에 사용할 환경 타입입니다. */
export type GenerateEnv = Env;

/**
 * URL 쿼리에서 검색어를 안전하게 읽습니다.
 * 검색어가 없으면 null을 반환해 호출부에서 기본값을 선택할 수 있게 합니다.
 */
export function getGenerateKeyword(request: Request): string | null {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim();
  return keyword ? keyword.slice(0, 100) : null;
}

/**
 * 수동 콘텐츠 생성 요청을 실행합니다.
 * 실제 상품 검색/선정/본문 생성/저장은 메인 생성 파이프라인을 재사용합니다.
 */
export async function runManualGenerate(env: GenerateEnv, keyword: string) {
  return createManualContent(env, keyword);
}
