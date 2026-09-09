/**
 * 네이버 + 티스토리 최신 콘텐츠를 한 화면에서 확인하는 모바일 대시보드입니다.
 * 이미지와 콘텐츠 품질 상태까지 확인할 수 있도록 구성합니다.
 */

import { validateImageUrl } from "./image";

export interface DashboardEnv { CONTENT_STORE: KVNamespace; }

/** HTML에 표시할 문자열을 안전하게 변환합니다. */
function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

/** 저장된 글의 이미지 중 실제 사용 가능한 이미지만 남깁니다. */
async function getValidImages(post: any): Promise<string[]> {
  const blog = post?.blog ?? post;
  const candidates = Array.isArray(blog?.imageUrls) ? blog.imageUrls : (blog?.productImage ? [blog.productImage] : []);
  const uniqueCandidates = [...new Set(candidates)].slice(0, 3) as string[];
  const checked = await Promise.all(uniqueCandidates.map(async (url) => ({ url, valid: await validateImageUrl(url) })));
  return checked.filter((item) => item.valid).map((item) => item.url);
}

/** 품질 점수와 실패 사유를 표시할 상태 영역을 만듭니다. */
function renderQuality(post: any) {
  const quality = post?.quality;
  if (!quality) return `<div class="quality unknown">품질 검사 기록 없음</div>`;
  if (quality.passed) return `<div class="quality pass">품질 검사 통과 · ${escapeHtml(quality.score)}점</div>`;
  const reasons = Array.isArray(quality.reasons) ? quality.reasons : [];
  return `<div class="quality fail">품질 검사 미통과 · ${escapeHtml(quality.score)}점${reasons.length ? `<br><small>${escapeHtml(reasons.join(" · "))}</small>` : ""}</div>`;
}

/** 저장된 글을 카드 형태로 만듭니다. */
async function renderPost(title: string, post: any, platform: string) {
  if (!post) return `<section class="card empty"><h2>${escapeHtml(title)}</h2><p>아직 생성된 콘텐츠가 없습니다.</p></section>`;
  const blog = post.blog ?? post;
  const product = post.recommendation?.product;
  const titles = Array.isArray(blog.titles) ? blog.titles : [];
  const images = await getValidImages(post);

  return `<section class="card">
    <div class="platform">${escapeHtml(platform)}</div>
    ${renderQuality(post)}
    <h2>${escapeHtml(blog.selectedTitle ?? titles[0] ?? post.keyword ?? "자동 생성 콘텐츠")}</h2>
    <p class="meta">검색 주제: ${escapeHtml(post.keyword ?? "-")} · 생성: ${escapeHtml(post.savedAt ?? "-")}</p>
    ${product?.productName ? `<div class="product-name">선정 상품 · ${escapeHtml(product.productName)}</div>` : ""}
    ${images.length ? `<div class="gallery">${images.map((url: string, i: number) => `<img src="${escapeHtml(url)}" alt="상품 이미지 ${i + 1}" loading="lazy">`).join("")}</div>` : ""}
    <div class="disclosure">${escapeHtml(blog.disclosure ?? "")}</div>
    <div class="body">${escapeHtml(blog.body ?? "")}</div>
    ${blog.partnerUrl ? `<a class="link" href="${escapeHtml(blog.partnerUrl)}" target="_blank" rel="noopener noreferrer">상품 링크 열기</a>` : ""}
    ${titles.length ? `<details><summary>제목 후보 ${titles.length}개</summary><ol>${titles.map((item: string) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></details>` : ""}
  </section>`;
}

/** 최신 네이버/티스토리 콘텐츠를 함께 표시합니다. */
export async function renderCombinedDashboard(env: DashboardEnv): Promise<Response> {
  const [naver, tistory, status, quality] = await Promise.all([
    env.CONTENT_STORE.get("latest", "json") as Promise<any>,
    env.CONTENT_STORE.get("latest:tistory", "json") as Promise<any>,
    env.CONTENT_STORE.get("last-run", "json") as Promise<any>,
    env.CONTENT_STORE.get("latest:quality", "json") as Promise<any>,
  ]);
  const [naverHtml, tistoryHtml] = await Promise.all([
    renderPost("네이버 블로그", naver, "NAVER BLOG"),
    renderPost("티스토리", tistory, "TISTORY"),
  ]);

  const qualitySummary = quality
    ? `<div class="status"><strong>최근 품질 검사</strong> · ${quality.passed ? "통과" : "미통과"} · ${escapeHtml(quality.score)}점 · ${escapeHtml(quality.checkedAt ?? "-")}</div>`
    : "";

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>쿠팡파트너스 자동 콘텐츠</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#202124;font-family:Arial,"Noto Sans KR",sans-serif;line-height:1.65}.wrap{max-width:960px;margin:auto;padding:22px 14px 60px}header{margin-bottom:18px}header h1{margin:0;font-size:27px}header p{margin:5px 0;color:#6b7280;font-size:14px}.status{padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;font-size:13px;margin-bottom:14px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:20px;margin:14px 0;box-shadow:0 2px 10px rgba(0,0,0,.04)}.platform{font-size:12px;font-weight:700;color:#6b7280;letter-spacing:.05em;margin-bottom:4px}.quality{display:inline-block;padding:5px 9px;border-radius:7px;font-size:12px;font-weight:700;margin-bottom:9px}.quality.pass{background:#ecfdf5;color:#047857}.quality.fail{background:#fff1f2;color:#be123c}.quality.unknown{background:#f3f4f6;color:#6b7280}.card h2{margin:0 0 7px;font-size:21px}.meta{margin:0 0 10px;color:#6b7280;font-size:12px}.product-name{font-size:14px;font-weight:600;margin:10px 0}.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.gallery img{width:100%;height:190px;object-fit:contain;border:1px solid #e5e7eb;border-radius:10px;background:#fff}.disclosure{padding:10px;background:#f8fafc;border-radius:9px;color:#4b5563;font-size:12px;margin:12px 0}.body{white-space:pre-wrap;font-size:15px}.link{display:inline-block;margin-top:16px;font-weight:700;text-decoration:none}.empty{text-align:center;color:#6b7280;padding:35px}.empty h2{color:#202124}details{margin-top:18px;border-top:1px solid #eee;padding-top:12px}summary{cursor:pointer;font-weight:600}ol{padding-left:22px}@media(max-width:600px){.wrap{padding:18px 10px 40px}.card{padding:16px}.gallery{grid-template-columns:1fr}.gallery img{height:250px}.body{font-size:15px}}
</style></head><body><main class="wrap"><header><h1>쿠팡파트너스 자동 콘텐츠</h1><p>자동 생성·품질 검사·중복 방지를 한 번에 관리합니다.</p></header>
<div class="status"><strong>최근 자동 실행</strong> · ${escapeHtml(status?.status ?? "기록 없음")} · ${escapeHtml(status?.finishedAt ?? "-")}</div>
${qualitySummary}${naverHtml}${tistoryHtml}
</main></body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
