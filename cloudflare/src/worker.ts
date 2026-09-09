import app from "./index";
import { runBootstrap, type BootstrapEnv } from "./bootstrap";
import { generateTistoryContent } from "./tistory";
import { renderCombinedDashboard } from "./dashboard";

/**
 * Cloudflare Worker의 최종 진입점입니다.
 * 네이버/티스토리 자동 생성과 통합 대시보드를 연결합니다.
 */
const DAILY_LOCK_PREFIX = "lock:daily:";
const DAILY_LOCK_TTL = 45 * 60;
const TISTORY_LATEST_KEY = "latest:tistory";

/** Cron 실행 시 사용할 날짜 키를 만듭니다. */
function getRunDate(controller: ScheduledController): string {
  return new Date(controller.scheduledTime).toISOString().slice(0, 10);
}

/** 네이버 최신 결과에서 티스토리 생성에 필요한 상품 정보만 추출합니다. */
function getLatestProduct(record: any) {
  const product = record?.recommendation?.product;
  if (!product?.productId || !product?.productName) return null;

  return {
    productId: product.productId,
    productName: product.productName,
    productPrice: product.productPrice ?? null,
    productImage: product.productImage ?? "",
    productUrl: product.productUrl ?? "",
    keyword: record.keyword ?? product.keyword ?? "",
    rank: product.rank ?? null,
    isRocket: Boolean(product.isRocket),
    isFreeShipping: Boolean(product.isFreeShipping),
  };
}

/** 티스토리 결과를 KV에 저장하고 최신 결과 포인터를 갱신합니다. */
async function saveTistoryContent(env: BootstrapEnv, content: any, sourceRecord: any) {
  const now = new Date();
  const record = {
    savedAt: now.toISOString(),
    keyword: sourceRecord.keyword ?? "",
    sourcePostKey: sourceRecord.savedAt ? `post:${sourceRecord.savedAt}` : null,
    content,
  };
  const storageKey = `tistory:post:${now.toISOString()}`;

  await env.CONTENT_STORE.put(storageKey, JSON.stringify(record));
  await env.CONTENT_STORE.put(TISTORY_LATEST_KEY, JSON.stringify({ storageKey, ...record }));
  return { storageKey, record };
}

const handler = {
  async fetch(request: Request, env: BootstrapEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // 첫 화면은 네이버와 티스토리 최신 글을 함께 보여주는 통합 대시보드입니다.
    if (url.pathname === "/") return renderCombinedDashboard(env);

    // 초기 생성 테스트용 경로입니다.
    if (url.pathname === "/generate-bootstrap") {
      try {
        const keyword = url.searchParams.get("keyword")?.trim() || "무선청소기";
        const result = await runBootstrap(env, keyword);
        return Response.json({ ok: true, message: "초기 콘텐츠 생성이 완료되었습니다.", ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        return Response.json({ ok: false, message }, { status: 500 });
      }
    }

    // 티스토리 최신 결과를 별도로 확인할 수 있습니다.
    if (url.pathname === "/latest-tistory") {
      const latest = await env.CONTENT_STORE.get(TISTORY_LATEST_KEY, "json");
      return Response.json(latest ?? { ok: true, message: "아직 티스토리 콘텐츠가 없습니다." });
    }

    // 나머지 기존 API는 index.ts에 그대로 전달합니다.
    return app.fetch(request, env, ctx);
  },

  /** 매일 오전 9시(한국시간)에 네이버 → 티스토리 순서로 자동 생성합니다. */
  async scheduled(controller: ScheduledController, env: BootstrapEnv, ctx: ExecutionContext) {
    const runDate = getRunDate(controller);
    const lockKey = `${DAILY_LOCK_PREFIX}${runDate}`;

    // 같은 날짜의 중복 실행을 막습니다.
    if (await env.CONTENT_STORE.get(lockKey)) {
      console.log(`오늘(${runDate}) 자동 생성이 이미 실행 중이므로 중복 실행을 건너뜁니다.`);
      return;
    }

    // 비정상 종료 시에도 45분 후 자동으로 잠금이 풀립니다.
    await env.CONTENT_STORE.put(lockKey, JSON.stringify({ startedAt: new Date().toISOString(), cron: controller.cron }), { expirationTtl: DAILY_LOCK_TTL });

    try {
      // 1. 네이버용 콘텐츠를 먼저 생성합니다.
      await app.scheduled(controller, env, ctx);

      // 2. 방금 생성된 상품을 티스토리 생성에 재사용합니다.
      const latest = await env.CONTENT_STORE.get("latest", "json") as any;
      const product = getLatestProduct(latest);

      if (product) {
        try {
          const usedTitles = await env.CONTENT_STORE.get("history:titles", "json") as string[] | null;
          const tistoryContent = await generateTistoryContent(env, product, latest.keyword ?? product.keyword ?? "", usedTitles ?? []);
          const saved = await saveTistoryContent(env, tistoryContent, latest);
          await env.CONTENT_STORE.put("last-run:tistory", JSON.stringify({ status: "success", runDate, storageKey: saved.storageKey, finishedAt: new Date().toISOString() }));
          console.log(`티스토리 콘텐츠 생성 완료: ${saved.storageKey}`);
        } catch (error) {
          // 티스토리만 실패하고 네이버 결과는 그대로 유지합니다.
          const message = error instanceof Error ? error.message : "알 수 없는 오류";
          console.error(`티스토리 자동 생성 실패 (${runDate}):`, message);
          await env.CONTENT_STORE.put("last-run:tistory", JSON.stringify({ status: "error", runDate, message, finishedAt: new Date().toISOString() }));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      console.error(`일일 자동 생성 실패 (${runDate}):`, message);
      throw error;
    } finally {
      // 실행 완료 후 잠금을 제거합니다.
      await env.CONTENT_STORE.delete(lockKey);
    }
  },
};

export default handler;
