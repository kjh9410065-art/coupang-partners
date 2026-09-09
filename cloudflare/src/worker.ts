import app from "./index";
import { runBootstrap, type BootstrapEnv } from "./bootstrap";
import { generateTistoryContent } from "./tistory";
import { renderCombinedDashboard } from "./dashboard";
import { renderLandingDashboard } from "./landing";
import { runManualGenerate } from "./generate";
import { validateLatestContent } from "./quality-run";
import { createShortAffiliateLink } from "./affiliate";

/** Cloudflare Worker의 최종 진입점입니다. */
const DAILY_LOCK_PREFIX = "lock:daily:";
const DAILY_LOCK_TTL = 45 * 60;
const TISTORY_LATEST_KEY = "latest:tistory";
const USED_TITLES_KEY = "history:titles";
const MAX_TITLE_HISTORY = 120;

/** Cron 실행 날짜를 만듭니다. */
function getRunDate(controller: ScheduledController): string { return new Date(controller.scheduledTime).toISOString().slice(0, 10); }

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

/** 티스토리 결과를 KV에 저장합니다. */
async function saveTistoryContent(env: BootstrapEnv, content: any, sourceRecord: any) {
  const now = new Date();
  const record = { savedAt: now.toISOString(), keyword: sourceRecord.keyword ?? "", sourcePostKey: sourceRecord.savedAt ? `post:${sourceRecord.savedAt}` : null, content };
  const storageKey = `tistory:post:${now.toISOString()}`;
  await env.CONTENT_STORE.put(storageKey, JSON.stringify(record));
  await env.CONTENT_STORE.put(TISTORY_LATEST_KEY, JSON.stringify({ storageKey, ...record }));
  return { storageKey, record };
}

/** 티스토리 제목을 공용 중복 방지 이력에 추가합니다. */
async function saveTistoryTitleHistory(env: BootstrapEnv, titles: unknown) {
  if (!Array.isArray(titles)) return;
  const current = await env.CONTENT_STORE.get(USED_TITLES_KEY, "json") as string[] | null;
  const validTitles = titles.filter((title): title is string => typeof title === "string" && title.trim().length > 0).map((title) => title.trim());
  if (!validTitles.length) return;
  await env.CONTENT_STORE.put(USED_TITLES_KEY, JSON.stringify([...(current ?? []), ...validTitles].slice(-MAX_TITLE_HISTORY)));
}

/** 생성된 콘텐츠에 쿠팡 공식 Deeplink 단축 제휴 링크를 넣습니다. */
async function attachAffiliateLink(env: BootstrapEnv, record: any, platform: string) {
  const product = record?.recommendation?.product;
  if (!product?.productId) return { record, shortUrl: "" };

  const subId = `flick-${platform}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
  const shortUrl = await createShortAffiliateLink(env, product.productId, subId);

  // 원래 상품 정보는 유지하고, 실제 게시용 링크만 별도로 저장합니다.
  record.blog = {
    ...(record.blog ?? {}),
    partnerUrl: shortUrl,
    productUrl: shortUrl,
  };
  record.affiliate = {
    ...(record.affiliate ?? {}),
    originalProductId: product.productId,
    shortUrl,
    subId,
    platform,
    createdAt: new Date().toISOString(),
  };
  return { record, shortUrl };
}

/** 티스토리 콘텐츠에도 티스토리 전용 SubID의 단축 제휴 링크를 붙입니다. */
async function attachTistoryAffiliateLink(env: BootstrapEnv, content: any, product: any) {
  if (!product?.productId) return { content, shortUrl: "" };
  const subId = `flick-tistory-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
  const shortUrl = await createShortAffiliateLink(env, product.productId, subId);
  return {
    content: {
      ...content,
      partnerUrl: shortUrl,
      productUrl: shortUrl,
      affiliate: { originalProductId: product.productId, shortUrl, subId, platform: "tistory", createdAt: new Date().toISOString() },
    },
    shortUrl,
  };
}

const handler = {
  async fetch(request: Request, env: BootstrapEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // 기본 접속 화면은 항상 비워 둡니다.
    // 저장된 이전 콘텐츠는 ?view=latest를 명시했을 때만 보여줍니다.
    if (url.pathname === "/") {
      if (url.searchParams.get("view") !== "latest") return renderLandingDashboard();
      return renderCombinedDashboard(env);
    }

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

    if (url.pathname === "/generate") return runManualGenerate(request, env, ctx);

    if (url.pathname === "/latest-tistory") {
      const latest = await env.CONTENT_STORE.get(TISTORY_LATEST_KEY, "json");
      return Response.json(latest ?? { ok: true, message: "아직 티스토리 콘텐츠가 없습니다." });
    }

    return app.fetch(request, env, ctx);
  },

  /** 매일 오전 9시(한국시간)에 네이버 → 품질검사 → 단축 링크 → 티스토리 순서로 자동 생성합니다. */
  async scheduled(controller: ScheduledController, env: BootstrapEnv, ctx: ExecutionContext) {
    const runDate = getRunDate(controller);
    const lockKey = `${DAILY_LOCK_PREFIX}${runDate}`;
    if (await env.CONTENT_STORE.get(lockKey)) {
      console.log(`오늘(${runDate}) 자동 생성이 이미 실행 중이므로 중복 실행을 건너뜁니다.`);
      return;
    }

    await env.CONTENT_STORE.put(lockKey, JSON.stringify({ startedAt: new Date().toISOString(), cron: controller.cron }), { expirationTtl: DAILY_LOCK_TTL });

    try {
      // 1. 네이버 콘텐츠를 생성합니다.
      await app.scheduled(controller, env, ctx);

      // 2. 생성 직후 품질을 검사합니다.
      const quality = await validateLatestContent(env);
      if (quality && !quality.ok) {
        await env.CONTENT_STORE.put("last-run:quality", JSON.stringify({ status: "rejected", runDate, quality, finishedAt: new Date().toISOString() }));
        console.warn(`네이버 콘텐츠 품질 미통과 (${runDate}):`, quality.reasons.join(" / "));
        return;
      }

      // 3. 네이버 전용 SubID로 짧은 제휴 링크를 생성합니다.
      const latest = await env.CONTENT_STORE.get("latest", "json") as any;
      if (latest?.recommendation?.product?.productId) {
        try {
          const linked = await attachAffiliateLink(env, latest, "naver");
          await env.CONTENT_STORE.put("latest", JSON.stringify(linked.record));
          await env.CONTENT_STORE.put("last-run:affiliate", JSON.stringify({ status: "success", runDate, platform: "naver", shortUrl: linked.shortUrl, finishedAt: new Date().toISOString() }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "알 수 없는 오류";
          await env.CONTENT_STORE.put("last-run:affiliate", JSON.stringify({ status: "error", runDate, platform: "naver", message, finishedAt: new Date().toISOString() }));
          console.error(`쿠팡 네이버 단축 링크 생성 실패 (${runDate}):`, message);
        }
      }

      await env.CONTENT_STORE.put("last-run:quality", JSON.stringify({ status: "passed", runDate, quality, finishedAt: new Date().toISOString() }));

      // 4. 품질 검사를 통과한 경우에만 티스토리 생성으로 진행합니다.
      const latestWithLink = await env.CONTENT_STORE.get("latest", "json") as any;
      const product = getLatestProduct(latestWithLink);
      if (product && quality?.ok) {
        try {
          const usedTitles = await env.CONTENT_STORE.get(USED_TITLES_KEY, "json") as string[] | null;
          // 티스토리는 별도 SubID를 사용해 네이버와 성과를 구분합니다.
          const tistoryContent = await generateTistoryContent(env, product, latestWithLink.keyword ?? product.keyword ?? "", usedTitles ?? []);
          const linkedTistory = await attachTistoryAffiliateLink(env, tistoryContent, product);
          const saved = await saveTistoryContent(env, linkedTistory.content, latestWithLink);
          await saveTistoryTitleHistory(env, linkedTistory.content.titles);
          await env.CONTENT_STORE.put("last-run:tistory", JSON.stringify({ status: "success", runDate, storageKey: saved.storageKey, shortUrl: linkedTistory.shortUrl, finishedAt: new Date().toISOString() }));
        } catch (error) {
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
      await env.CONTENT_STORE.delete(lockKey);
    }
  },
};

export default handler;
