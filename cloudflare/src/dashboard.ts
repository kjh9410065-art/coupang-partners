/**
 * 네이버 + 티스토리 최신 콘텐츠를 한 화면에서 확인하는 모바일 대시보드입니다.
 * 자동 생성 결과를 별도 편집 없이 복사할 수 있도록 게시용 카드와 복사 버튼을 제공합니다.
 */

import { validateImageUrl } from "./image";
import { getReadyPublishQueue } from "./publish-queue";

export interface DashboardEnv { CONTENT_STORE: KVNamespace; }

/** HTML에 표시할 문자열을 안전하게 변환합니다. */
function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

/** 자바스크립트 문자열로 안전하게 넣기 위한 변환입니다. */
function escapeJs(value: unknown) {
  return JSON.stringify(String(value ?? "")).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
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
  if (quality.passed || quality.ok) return `<div class="quality pass">품질 검사 통과 · ${escapeHtml(quality.score)}점</div>`;
  const reasons = Array.isArray(quality.reasons) ? quality.reasons : [];
  return `<div class="quality fail">품질 검사 미통과 · ${escapeHtml(quality.score)}점${reasons.length ? `<br><small>${escapeHtml(reasons.join(" · "))}</small>` : ""}</div>`;
}

/** 실제 네이버/티스토리에 붙여 넣기 좋은 텍스트를 만듭니다. */
function buildCopyText(post: any): string {
  const blog = post?.blog ?? post ?? {};
  const title = blog.selectedTitle ?? blog.titles?.[0] ?? "";
  const disclosure = blog.disclosure ?? "";
  const body = blog.body ?? "";
  const partnerUrl = blog.partnerUrl ?? "";
  return [title, "", disclosure, "", body, "", "상품 링크", partnerUrl].filter((v) => v !== undefined).join("\n").trim();
}

/** 복사 버튼과 게시용 텍스트 영역을 렌더링합니다. */
function renderCopyArea(post: any, platform: string) {
  if (!post) return "";
  const blog = post.blog ?? post;
  const copyText = buildCopyText(post);
  const quality = post.quality;
  const ready = quality?.passed === true || quality?.ok === true;
  const id = `${platform.toLowerCase()}-copy`;
  return `<div class="copy-area">
    <div class="copy-head"><strong>${escapeHtml(platform)} 게시용</strong><button type="button" onclick="copyContent(${escapeJs(id)},${escapeJs(copyText)})">전체 복사</button></div>
    <p class="copy-help">검토가 끝난 게시용 원문입니다. 제목부터 상품 링크까지 한 번에 복사할 수 있습니다.</p>
    <textarea id="${escapeHtml(id)}" readonly>${escapeHtml(copyText)}</textarea>
    ${ready ? `<div class="ready">게시 준비 완료</div>` : `<div class="not-ready">품질검사 통과 전에는 게시하지 않는 것을 권장합니다.</div>`}
  </div>`;
}

/** 저장된 글의 이미지/본문/복사 영역을 카드 형태로 만듭니다. */
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
    ${renderCopyArea(post, platform)}
    ${titles.length ? `<details><summary>제목 후보 ${titles.length}개</summary><ol>${titles.map((item: string) => `<li>${escapeHtml(item)}</li>`).join("")}</ol></details>` : ""}
  </section>`;
}

/** 최신 네이버/티스토리 콘텐츠와 게시 대기열을 함께 표시합니다. */
export async function renderCombinedDashboard(env: DashboardEnv): Promise<Response> {
  const [naver, tistory, status, quality, queue] = await Promise.all([
    env.CONTENT_STORE.get("latest", "json") as Promise<any>,
    env.CONTENT_STORE.get("latest:tistory", "json") as Promise<any>,
    env.CONTENT_STORE.get("last-run", "json") as Promise<any>,
    env.CONTENT_STORE.get("latest:quality", "json") as Promise<any>,
    getReadyPublishQueue(env),
  ]);
  const [naverHtml, tistoryHtml] = await Promise.all([
    renderPost("네이버 블로그", naver, "NAVER BLOG"),
    renderPost("티스토리", tistory, "TISTORY"),
  ]);

  const qualitySummary = quality
    ? `<div class="status"><strong>최근 품질 검사</strong> · ${quality.passed || quality.ok ? "통과" : "미통과"} · ${escapeHtml(quality.score)}점 · ${escapeHtml(quality.checkedAt ?? "-")}</div>`
    : "";
  const queueSummary = `<div class="status"><strong>게시 대기</strong> · ${queue.length}건 · 품질검사 통과 콘텐츠만 대기열에 등록됩니다.</div>`;

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>쿠팡파트너스 자동 콘텐츠</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#202124;font-family:Arial,"Noto Sans KR",sans-serif;line-height:1.65}.wrap{max-width:960px;margin:auto;padding:22px 14px 60px}header{margin-bottom:18px}header h1{margin:0;font-size:27px}header p{margin:5px 0;color:#6b7280;font-size:14px}.status{padding:10px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;font-size:13px;margin-bottom:14px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:20px;margin:14px 0;box-shadow:0 2px 10px rgba(0,0,0,.04)}.platform{font-size:12px;font-weight:700;color:#6b7280;letter-spacing:.05em;margin-bottom:4px}.quality{display:inline-block;padding:5px 9px;border-radius:7px;font-size:12px;font-weight:700;margin-bottom:9px}.quality.pass{background:#ecfdf5;color:#047857}.quality.fail{background:#fff1f2;color:#be123c}.quality.unknown{background:#f3f4f6;color:#6b7280}.card h2{margin:0 0 7px;font-size:21px}.meta{margin:0 0 10px;color:#6b7280;font-size:12px}.product-name{font-size:14px;font-weight:600;margin:10px 0}.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.gallery img{width:100%;height:190px;object-fit:contain;border:1px solid #e5e7eb;border-radius:10px;background:#fff}.disclosure{padding:10px;background:#f8fafc;border-radius:9px;color:#4b5563;font-size:12px;margin:12px 0}.body{white-space:pre-wrap;font-size:15px}.link{display:inline-block;margin-top:16px;font-weight:700;text-decoration:none}.copy-area{margin-top:20px;padding-top:16px;border-top:1px solid #eee}.copy-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.copy-head button{border:0;border-radius:9px;padding:9px 14px;font-weight:700;cursor:pointer;background:#111827;color:#fff}.copy-help{margin:7px 0;color:#6b7280;font-size:12px}.copy-area textarea{width:100%;min-height:300px;resize:vertical;border:1px solid #d1d5db;border-radius:10px;padding:12px;font:14px/1.7 Arial,"Noto Sans KR",sans-serif;background:#fafafa}.ready,.not-ready{margin-top:8px;font-size:12px;font-weight:700}.ready{color:#047857}.not-ready{color:#b45309}.empty{text-align:center;color:#6b7280;padding:35px}.empty h2{color:#202124}details{margin-top:18px;border-top:1px solid #eee;padding-top:12px}summary{cursor:pointer;font-weight:600}ol{padding-left:22px}@media(max-width:600px){.wrap{padding:18px 10px 40px}.card{padding:16px}.gallery{grid-template-columns:1fr}.gallery img{height:250px}.body{font-size:15px}.copy-area textarea{min-height:360px}}
</style></head><body><main class="wrap"><header><h1>쿠팡파트너스 자동 콘텐츠</h1><p>자동 생성 → 품질 검사 → 게시 준비 → 복사까지 한 화면에서 처리합니다.</p></header>
<div class="status"><strong>최근 자동 실행</strong> · ${escapeHtml(status?.status ?? "기록 없음")} · ${escapeHtml(status?.finishedAt ?? "-")}</div>
${qualitySummary}${queueSummary}${naverHtml}${tistoryHtml}
</main><script>
function copyContent(id,text){
  navigator.clipboard?.writeText(text).then(()=>showCopied(id)).catch(()=>{const el=document.getElementById(id);el.focus();el.select();document.execCommand('copy');showCopied(id);});
}
function showCopied(id){const el=document.getElementById(id);const button=el?.parentElement?.querySelector('button');if(button){const old=button.textContent;button.textContent='복사 완료';setTimeout(()=>button.textContent=old,1500);}}
</script></body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
