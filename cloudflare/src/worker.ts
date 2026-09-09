import app from "./index";
import { runBootstrap, type BootstrapEnv } from "./bootstrap";
import { generateTistoryContent } from "./tistory";
import { renderCombinedDashboard } from "./dashboard";
import { renderLandingDashboard } from "./landing";
import { renderPreview } from "./preview";
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
  return { productId: product.productId, productName: product.productName, productPrice: product.productPrice ?? null, productImage: product.productImage ?? "", productUrl: product.productUrl ?? "", keyword: record.keyword ?? product.keyword ?? "", rank: product.rank ?? null, isRocket: Boolean(product.isRocket), isFreeShipping: Boolean(product.isFreeShipping) };
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
  record.blog = { ...(record.blog ?? {}), partnerUrl: shortUrl, productUrl: shortUrl };
  record.affiliate = { ...(record.affiliate ?? {}), originalProductId: product.productId, shortUrl, subId, platform, createdAt: new Date().toISOString() };
  return { record, shortUrl };
}

/** 티스토리 콘텐츠에도 티스토리 전용 SubID의 단축 제휴 링크를 붙입니다. */
async function attachTistoryAffiliateLink(env: BootstrapEnv, content: any, product: any) {
  if (!product?.productId) return { content, shortUrl: "" };
  const subId = `flick-tistory-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
  const shortUrl = await createShortAffiliateLink(env, product.productId, subId);
  return { content: { ...content, partnerUrl: shortUrl, productUrl: shortUrl, affiliate: { originalProductId: product.productId, shortUrl, subId, platform: "tistory", createdAt: new Date().toISOString() } }, shortUrl };
}

const handler = {
  async fetch(request: Request, env: BootstrapEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      const showLatest = url.searchParams.get("view") === "latest" || request.headers.get("Cookie")?.includes("show_latest=1");
      if (!showLatest) return renderLandingDashboard();
      const response = await renderCombinedDashboard(env);
      if (!url.searchParams.get("view")) {
        const headers = new Headers(response.headers);
        headers.append("Set-Cookie", "show_latest=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      }
      return response;
    }

    // 최신 생성 글을 실제 게시 형태로 확인하는 전용 미리보기 페이지입니다.
    if (url.pathname === "/preview") return renderPreview(env);

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

    if (url.pathname === "/generate") {
      const response = await runManualGenerate(request, env, ctx);
      if (response.ok) {
        const headers = new Headers(response.headers);
        headers.append("Set-Cookie", "show_latest=1; Max-Age=120; Path=/; HttpOnly; SameSite=Lax");
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      }
      return response;
    }

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
    if (await env.CONTENT_STORE.get(lockKey)) return;
    await env.CONTENT_STORE.put(lockKey, JSON.stringify({ startedAt: new Date().toISOString(), cron: controller.cron }), { expirationTtl: DAILY_LOCK_TTL });
    try {
      await app.scheduled(controller, env, ctx);
      const quality = await validateLatestContent(env);
      if (quality && !quality.ok) {
        await env.CONTENT_STORE.put("last-run:quality", JSON.stringify({ status: "rejected", runDate, quality, finishedAt: new Date().toISOString() }));
        return;
      }
      const latest = await env.CONTENT_STORE.get("latest", "json") as any;
      if (latest?.recommendation?.product?.productId) {
        try {
          const linked = await attachAffiliateLink(env, latest, "naver");
          await env.CONTENT_STORE.put("latest", JSON.stringify(linked.record));
          await env.CONTENT_STORE.put("last-run:affiliate", JSON.stringify({ status: "success", runDate, platform: "naver", shortUrl: linked.shortUrl, finishedAt: new Date().toISOString() }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "알 수 없는 오류";
          await env.CONTENT_STORE.put("last-run:affiliate", JSON.stringify({ status: "error", runDate, platform: "naver", message, finishedAt: new Date().toISOString() }));
        }
      }
      await env.CONTENT_STORE.put("last-run:quality", JSON.stringify({ status: "passed", runDate, quality, finishedAt: new Date().toISOString() }));
      const latestWithLink = await env.CONTENT_STORE.get("latest", "json") as any;
      const product = getLatestProduct(latestWithLink);
      if (product && quality?.ok) {
        try {
          const usedTitles = await env.CONTENT_STORE.get(USED_TITLES_KEY, "json") as string[] | null;
          const tistoryContent = await generateTistoryContent(env, product, latestWithLink.keyword ?? product.keyword ?? "", usedTitles ?? []);
          const linkedTistory = await attachTistoryAffiliateLink(env, tistoryContent, product);
          const saved = await saveTistoryContent(env, linkedTistory.content, latestWithLink);
          await saveTistoryTitleHistory(env, linkedTistory.content.titles);
          await env.CONTENT_STORE.put("last-run:tistory", JSON.stringify({ status: "success", runDate, storageKey: saved.storageKey, shortUrl: linkedTistory.shortUrl, finishedAt: new Date().toISOString() }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "알 수 없는 오류";
          await env.CONTENT_STORE.put("last-run:tistory", JSON.stringify({ status: "error", runDate, message, finishedAt: new Date().toISOString() }));
        }
      }
    } finally {
      await env.CONTENT_STORE.delete(lockKey);
    }
  },
};

export default handler;
