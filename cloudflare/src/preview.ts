/**
 * 생성된 쿠팡파트너스 글을 실제 블로그에 올리기 전에 확인하는 미리보기 페이지입니다.
 * 제목과 본문을 명확하게 분리하고, 본문 안에 상품 이미지를 자연스럽게 배치합니다.
 */

export interface PreviewEnv { CONTENT_STORE: KVNamespace; }

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getBlog(record: any) {
  return record?.blog ?? record?.content ?? {};
}

/** 본문을 문단으로 나누고 확보된 이미지를 본문 사이에 넣습니다. */
function renderBody(body: string, images: string[]) {
  const paragraphs = body
    .split(/\n\s*\n|\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  const output: string[] = [];
  const imageCount = Math.min(images.length, 3);

  paragraphs.forEach((paragraph, index) => {
    if (/^#{1,3}\s+/.test(paragraph)) {
      output.push(`<h2>${escapeHtml(paragraph.replace(/^#{1,3}\s+/, ""))}</h2>`);
    } else {
      output.push(`<p>${escapeHtml(paragraph)}</p>`);
    }

    const target = imageCount === 1
      ? (index === 2 ? 0 : -1)
      : imageCount === 2
        ? (index === 2 ? 0 : index === 6 ? 1 : -1)
        : (index === 2 ? 0 : index === 5 ? 1 : index === 8 ? 2 : -1);

    if (target >= 0 && target < imageCount) {
      output.push(`<figure><img src="${escapeHtml(images[target])}" alt="상품 이미지 ${target + 1}" loading="lazy"><figcaption>상품 이미지 ${target + 1}</figcaption></figure>`);
    }
  });

  for (let index = 0; index < imageCount; index++) {
    const marker = `상품 이미지 ${index + 1}`;
    if (!output.some((item) => item.includes(marker))) {
      output.push(`<figure><img src="${escapeHtml(images[index])}" alt="${marker}" loading="lazy"><figcaption>${marker}</figcaption></figure>`);
    }
  }

  return output.join("\n");
}

export async function renderPreview(env: PreviewEnv): Promise<Response> {
  const record = await env.CONTENT_STORE.get("latest", "json") as any;
  if (!record) {
    return new Response("미리 볼 생성 글이 없습니다. 먼저 글을 생성해주세요.", {
      status: 404,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    });
  }

  const blog = getBlog(record);
  const product = record?.recommendation?.product ?? {};
  const images = Array.isArray(blog?.imageUrls)
    ? blog.imageUrls.filter(Boolean).slice(0, 3)
    : product.productImage ? [product.productImage] : [];
  const title = blog.selectedTitle ?? blog.titles?.[0] ?? "자동 생성 콘텐츠";
  const partnerUrl = blog.partnerUrl ?? blog.productUrl ?? "";

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} - 미리보기</title><style>
*{box-sizing:border-box}
body{margin:0;background:#f4f5f7;color:#222;font-family:Arial,"Noto Sans KR",sans-serif;line-height:1.8}
.wrap{max-width:760px;margin:auto;padding:24px 14px 60px}
.preview-bar{background:#111827;color:#fff;border-radius:12px;padding:12px 16px;margin-bottom:16px;font-size:13px}
.post{background:#fff;border-radius:18px;padding:28px 24px;box-shadow:0 3px 18px rgba(0,0,0,.06)}
.section-label{font-size:12px;font-weight:800;letter-spacing:.04em;color:#6b7280;margin:0 0 8px}
.title-box{background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:22px}
.title-box h1{font-size:26px;line-height:1.45;margin:0;font-weight:800;color:#111827}
.title-copy{margin-top:10px;border:1px solid #d1d5db;background:#fff;border-radius:8px;padding:7px 11px;font-size:12px;font-weight:700;cursor:pointer}
.disclosure{background:#f8fafc;border-radius:10px;padding:12px 14px;color:#5b6470;font-size:12px;margin-bottom:22px}
.product{padding:14px;background:#f8fafc;border-radius:12px;margin:0 0 24px;font-size:13px}
.body-label{padding-top:4px;border-top:1px solid #eee;margin-bottom:14px}
.body{font-size:16px}
.body p{margin:0 0 18px}
h2{font-size:20px;line-height:1.5;margin:28px 0 12px;border-left:4px solid #111827;padding-left:10px}
figure{margin:26px 0 28px;text-align:center}
figure img{display:block;width:100%;max-height:460px;object-fit:contain;border-radius:12px;border:1px solid #e5e7eb;background:#fff}
figcaption{font-size:11px;color:#8a919b;margin-top:5px}
.partner{display:inline-block;margin-top:10px;padding:12px 18px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700}
.fact{margin-top:20px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;font-size:12px;color:#666}
@media(max-width:600px){.wrap{padding:16px 10px 40px}.post{padding:22px 17px}.title-box h1{font-size:23px}.body{font-size:15px}figure{margin:22px 0 26px}figure img{max-height:430px}}
</style></head><body><main class="wrap">
<div class="preview-bar">📱 게시 전 미리보기 · 실제 블로그에 올리기 전 최종 확인용</div>
<article class="post">
  <section class="title-box">
    <div class="section-label">게시 제목</div>
    <h1>${escapeHtml(title)}</h1>
    <button class="title-copy" type="button" onclick="navigator.clipboard.writeText(${JSON.stringify(title).replace(/</g,"\\u003c")});this.textContent='복사 완료'">제목 복사</button>
  </section>
  <div class="disclosure">${escapeHtml(blog.disclosure ?? "")}</div>
  <div class="product"><strong>선정 상품</strong><br>${escapeHtml(product.productName ?? "")}</div>
  <section class="body-section">
    <div class="section-label body-label">본문</div>
    <div class="body">${renderBody(blog.body ?? "", images)}</div>
  </section>
  ${partnerUrl ? `<a class="partner" href="${escapeHtml(partnerUrl)}" target="_blank" rel="noopener noreferrer">상품 확인하기</a>` : ""}
  <div class="fact">상품 설명은 확인 가능한 상품 정보와 조사 자료를 기준으로 작성했습니다. 상세 기능과 구성은 상품 페이지에서 최종 확인해주세요.</div>
</article></main></body></html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}
