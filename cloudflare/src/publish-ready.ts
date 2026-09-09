/**
 * 최신 콘텐츠를 게시 대기열에 넣기 전에 최종 조건을 확인합니다.
 */

import { checkPublishReady, type PublishCheckResult } from "./publish";
import { enqueuePublishReady } from "./publish-queue";

export interface PublishReadyEnv {
  CONTENT_STORE: KVNamespace;
}

/** 네이버 최신 콘텐츠를 검사하고 게시 대기열에 등록합니다. */
export async function prepareLatestForPublish(env: PublishReadyEnv): Promise<PublishCheckResult & { queued: boolean; queueId?: string }> {
  const latest = await env.CONTENT_STORE.get("latest", "json") as any;
  if (!latest) {
    return { publishReady: false, queued: false, reasons: ["최신 콘텐츠가 없습니다."], checkedAt: new Date().toISOString() };
  }

  const blog = latest.blog ?? latest;
  const quality = latest.quality ?? await env.CONTENT_STORE.get("latest:quality", "json") as any;
  const product = latest.recommendation?.product;

  const check = checkPublishReady({
    platform: "naver",
    disclosure: blog.disclosure,
    productUrl: blog.partnerUrl ?? product?.productUrl,
    selectedTitle: blog.selectedTitle,
    body: blog.body,
    productImage: blog.imageUrls?.[0] ?? blog.productImage ?? product?.productImage,
    quality: { ok: quality?.ok === true || quality?.passed === true, score: quality?.score },
  });

  if (!check.publishReady) return { ...check, queued: false };

  const queueItem = await enqueuePublishReady(env, {
    platform: "naver",
    storageKey: "latest",
    title: blog.selectedTitle,
    keyword: latest.keyword ?? "",
  });

  return { ...check, queued: true, queueId: queueItem.queueId };
}
