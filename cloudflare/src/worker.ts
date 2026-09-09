import app from "./index";
import { runBootstrap, type BootstrapEnv } from "./bootstrap";
import { generateTistoryContent } from "./tistory";

/**
 * 기존 Worker 기능을 감싸는 진입점입니다.
 *
 * 자동 실행 순서:
 * 1. index.ts에서 네이버용 콘텐츠를 생성합니다.
 * 2. 생성된 latest 상품 정보를 이용해 티스토리용 콘텐츠를 생성합니다.
 * 3. 같은 상품에 대한 티스토리 결과를 KV에 별도로 저장합니다.
 *
 * 이렇게 하면 PC가 꺼져 있어도 Cloudflare Cron 하나로 두 플랫폼용 콘텐츠가 만들어집니다.
 */
const DAILY_LOCK_PREFIX = "lock:daily:";
const DAILY_LOCK_TTL = 45 * 60;
const TISTORY_LATEST_KEY = "latest:tistory";

/** 현재 Cron 실행의 날짜 키를 만듭니다. */
function getRunDate(controller: ScheduledController): string {
  return new Date(controller.scheduledTime).toISOString().slice(0, 10);
}

/**
 * 네이버용 최신 생성 결과에서 티스토리 생성에 필요한 상품 정보를 추출합니다.
 * 필수 값이 없으면 티스토리 생성만 건너뛰고 네이버 생성 결과는 유지합니다.
 */
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

/** 티스토리 결과를 KV에 저장하고 최신 결과 포인터도 갱신합니다. */
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

    // 초기 생성은 KV 잠금으로 단 한 번만 실행됩니다.
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

    // 티스토리 최신 결과를 별도로 확인할 수 있는 간단한 조회 경로입니다.
    if (url.pathname === "/latest-tistory") {
      const latest = await env.CONTENT_STORE.get(TISTORY_LATEST_KEY, "json");
      return Response.json(latest ?? { ok: true, message: "아직 티스토리 콘텐츠가 없습니다." });
    }

    // 기존 대시보드, /health, /latest, /status 등은 원래 Worker로 그대로 전달합니다.
    return app.fetch(request, env, ctx);
  },

  /**
   * 매일 오전 9시(한국시간)에 실행됩니다.
   *
   * 먼저 네이버용 콘텐츠를 만든 뒤 같은 상품으로 티스토리 콘텐츠를 추가 생성합니다.
   * 네이버 생성이 실패하면 티스토리도 실행하지 않아 상품 데이터가 어긋나는 것을 막습니다.
   */
  async scheduled(controller: ScheduledController, env: BootstrapEnv, ctx: ExecutionContext) {
    const runDate = getRunDate(controller);
    const lockKey = `${DAILY_LOCK_PREFIX}${runDate}`;

    // 이미 같은 날짜의 생성 작업이 진행 중이면 추가 API 호출 없이 종료합니다.
    const existingLock = await env.CONTENT_STORE.get(lockKey);
    if (existingLock) {
      console.log(`오늘(${runDate}) 자동 생성이 이미 실행 중이므로 중복 실행을 건너뜁니다.`);
      return;
    }

    // 잠금은 45분 뒤 자동 만료됩니다. 비정상 종료가 발생해도 영구 잠금이 되지 않습니다.
    await env.CONTENT_STORE.put(
      lockKey,
      JSON.stringify({ startedAt: new Date().toISOString(), cron: controller.cron }),
      { expirationTtl: DAILY_LOCK_TTL },
    );

    try {
      // 1단계: 기존 로직으로 네이버용 콘텐츠를 생성합니다.
      await app.scheduled(controller, env, ctx);

      // 2단계: 방금 생성된 네이버용 최신 상품을 읽습니다.
      const latest = await env.CONTENT_STORE.get("latest", "json") as any;
      const product = getLatestProduct(latest);

      if (!product) {
        console.warn("네이버 최신 생성 결과에서 티스토리용 상품 정보를 찾지 못했습니다.");
      } else {
        try {
          // 3단계: 같은 상품을 기반으로 티스토리 전용 문체/구조의 글을 생성합니다.
          const usedTitles = await env.CONTENT_STORE.get("history:titles", "json") as string[] | null;
          const tistoryContent = await generateTistoryContent(
            env,
            product,
            latest.keyword ?? product.keyword ?? "",
            usedTitles ?? [],
          );

          // 4단계: 네이버 결과와 분리된 KV 기록으로 저장합니다.
          const saved = await saveTistoryContent(env, tistoryContent, latest);
          console.log(`티스토리 콘텐츠 생성 완료: ${saved.storageKey}`);
        } catch (error) {
          // 티스토리 실패가 네이버 콘텐츠까지 실패 처리하지 않도록 분리합니다.
          const message = error instanceof Error ? error.message : "알 수 없는 오류";
          console.error(`티스토리 자동 생성 실패 (${runDate}):`, message);
          await env.CONTENT_STORE.put("last-run:tistory", JSON.stringify({
            status: "error",
            runDate,
            message,
            finishedAt: new Date().toISOString(),
          }));
        }
      }
    } catch (error) {
      // index.ts에서 상세 실패 상태를 기록하므로 여기서는 로그만 남기고 오류를 다시 전달합니다.
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      console.error(`일일 자동 생성 실패 (${runDate}):`, message);
      throw error;
    } finally {
      // 작업이 끝나면 잠금을 제거해 다음 날짜 실행을 정상적으로 허용합니다.
      await env.CONTENT_STORE.delete(lockKey);
    }
  },
};

export default handler;
