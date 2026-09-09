/**
 * 저장된 최신 콘텐츠에 품질 검사를 적용하는 실행 모듈입니다.
 * 생성 로직과 분리해 기존 파이프라인을 크게 건드리지 않고 품질 상태를 기록합니다.
 */

import { validateContentQuality, type QualityResult } from "./quality";

export interface QualityRunEnv {
  CONTENT_STORE: KVNamespace;
}

/** 최신 네이버 글을 검사하고 검사 결과를 해당 글에 기록합니다. */
export async function validateLatestContent(env: QualityRunEnv): Promise<QualityResult | null> {
  const latest = await env.CONTENT_STORE.get("latest", "json") as any;
  const blog = latest?.blog;
  const product = latest?.recommendation?.product;

  if (!blog || !product?.productName) return null;

  const result = validateContentQuality({
    keyword: String(latest.keyword ?? ""),
    productName: String(product.productName),
    titles: blog.titles,
    selectedTitle: blog.selectedTitle,
    body: blog.body,
  });

  // 품질 결과를 최신 기록과 별도의 KV에 저장해 대시보드에서 바로 확인할 수 있게 합니다.
  await env.CONTENT_STORE.put("latest:quality", JSON.stringify({ checkedAt: new Date().toISOString(), ...result }));

  // 최신 글에도 품질 상태를 함께 남겨 나중에 발행 단계에서 사용할 수 있게 합니다.
  latest.quality = {
    ...(latest.quality ?? {}),
    ...result.metrics,
    score: result.score,
    passed: result.ok,
    reasons: result.reasons,
  };
  await env.CONTENT_STORE.put("latest", JSON.stringify(latest));

  return result;
}
