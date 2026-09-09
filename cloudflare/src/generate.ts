/**
 * 수동 생성용 Worker 모듈입니다.
 * 메인 Worker의 실제 콘텐츠 생성 파이프라인을 실행한 뒤
 * 품질 검사와 쿠팡 단축 제휴 링크 생성까지 완료합니다.
 */

import app from "./index";
import { validateLatestContent } from "./quality-run";
import { createShortAffiliateLink } from "./affiliate";

/** 수동 생성 API에서 사용할 경로입니다. */
export const MANUAL_GENERATE_ROUTE = "/generate";

/** 수동 생성 요청의 검색어를 읽습니다. */
export function getGenerateKeyword(request: Request): string | null {
  const url = new URL(request.url);
  const keyword = url.searchParams.get("keyword")?.trim();
  return keyword ? keyword.slice(0, 100) : null;
}

/**
 * 수동 생성 요청의 최신 글에 쿠팡 단축 제휴 링크를 연결합니다.
 * 검색 API가 반환한 긴 /re/AFF... URL을 그대로 사용하지 않고,
 * Deeplink API의 shortenUrl(예: https://link.coupang.com/a/xxxxx)을 사용합니다.
 */
async function attachManualAffiliateLink(env: Parameters<typeof app.fetch>[1]) {
  const latest = await env.CONTENT_STORE.get("latest", "json") as any;
  const product = latest?.recommendation?.product;

  if (!product?.productId) {
    return { latest, shortUrl: "" };
  }

  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const subId = `flick-naver-manual-${date}`;
  const shortUrl = await createShortAffiliateLink(env, product.productId, subId);

  // 게시용 URL은 반드시 Deeplink API가 반환한 shortenUrl을 사용합니다.
  const updated = {
    ...latest,
    blog: {
      ...(latest.blog ?? {}),
      partnerUrl: shortUrl,
      productUrl: shortUrl,
    },
    affiliate: {
      ...(latest.affiliate ?? {}),
      originalProductId: product.productId,
      shortUrl,
      subId,
      platform: "naver",
      mode: "manual",
      createdAt: new Date().toISOString(),
    },
  };

  await env.CONTENT_STORE.put("latest", JSON.stringify(updated));
  return { latest: updated, shortUrl };
}

/**
 * 자동 생성과 동일한 실제 콘텐츠 생성 파이프라인을 수동으로 실행하고
 * 생성 직후 품질 검사와 단축 제휴 링크 생성을 완료합니다.
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

    let shortUrl = "";
    if (quality?.ok) {
      const linked = await attachManualAffiliateLink(env);
      shortUrl = linked.shortUrl;
    }

    return Response.json({
      ok: true,
      message: "수동 콘텐츠 생성, 품질 검사, 단축 제휴 링크 생성이 완료되었습니다.",
      requestedKeyword,
      quality,
      affiliate: shortUrl ? { ok: true, shortUrl } : { ok: false, message: "상품 정보가 없어 단축 링크를 만들지 않았습니다." },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return Response.json({ ok: false, message, requestedKeyword }, { status: 500 });
  }
}
