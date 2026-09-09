/**
 * 생성된 쿠팡파트너스 글을 실제 블로그에 올리기 전에 확인하는 미리보기 페이지입니다.
 * 제목, 고지문, 본문, 본문 이미지, 단축 파트너스 링크를 한 화면에 보여줍니다.
 */

export interface PreviewEnv { CONTENT_STORE: KVNamespace; }

/** HTML에 안전하게 표시할 문자열로 변환합니다. */
function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** 저장된 최신 글의 구조를 읽기 쉽게 통일합니다. */
function getBlog(record: any) {
  return record?.blog ?? record?.content ?? {};
}

/** 본문을 짧은 문단으로 나누고 확보된 이미지를 본문 사이에 넣습니다. */
function renderBody(body: string, images: string[]) {
  const paragraphs = body
    .split(/\n\s*\n|\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  const output: string[] = [];
  const imageCount = Math.min(images.length, 3);

  paragraphs.forEach((paragraph, index) => {
    // ### 형태의 소제목은 제목처럼 보여줍니다.
    if (/^#{1,3}\s+/.test(paragraph)) {
      output.push(`<h2>${escapeHtml(paragraph.replace(/^#{1,3}\s+/, ""))}</h2>`);
    } else {
      output.push(`<p>${escapeHtml(paragraph)}</p>`);
    }

    // 이미지가 1~3장일 때 본문 흐름을 깨지 않도록 앞쪽/중간/뒤쪽에 배치합니다.
    const target = imageCount === 1 ? 2 : imageCount === 2 ? (index === 2 ? 0 : index === 6 ? 1 : -1) : (index === 2 ? 0 : index === 5 ? 1 : index === 8 ? 2 : -1);
    if (target >= 0 && target < imageCount) {
      output.push(`<figure><img src="${escapeHtml(images[target])}" alt="상품 이미지 ${target + 1}" loading="lazy"><figcaption>상품 이미지 ${target + 1}</figcaption></figure>`);
    }
  });

  // 글이 짧아 정해진 위치가 나오지 않아도 이미지는 빠뜨리지 않습니다.
  for (let index = 0; index < imageCount; index++) {
    const marker = `상품 이미지 ${index + 1}`;
    if (!output.some((item) => item.includes(marker))) {
      output.push(`<figure><img src="${escapeHtml(images[index])}" alt="${marker}" loading="lazy"><figcaption>${marker}</figcaption></figure>`);
    }
  }

  return output.join("\n");
}

/** 최신 생성 글의 실제 게시 전 미리보기 화면을 렌더링합니다. */
export async function renderPreview(env: PreviewEnv): Promise<Response> {
  const record = await env.CONTENT_STORE.get("latest", "json") as any;
  if (!record) {
    return new Response("미리 볼 생성 글이 없습니다. 먼저 글을 생성해주세요.", { status: 404, headers: { "Content-Type": "text/plain;charset=UTF-8" } });
  }

  const blog = getBlog(record);
  const product = record?.recommendation?.product ?? {};
  const images = Array.isArray(blog?.imageUrls) ? blog.imageUrls.filter(Boolean).slice(0, 3) : product.productImage ? [product.productImage] : [];
  const title = blog.selectedTitle ?? blog.titles?.[0] ?? "자동 생성 콘텐츠";
  const partnerUrl = blog.partnerUrl ?? blog.productUrl ?? "";

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} - 미리보기</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f5f7;color:#222;font-family:Arial,"Noto Sans KR",sans-serif;line-height:1.8}.wrap{max-width:760px;margin:auto;padding:28px 16px 60px}.preview-bar{background:#111827;color:#fff;border-radius:12px;padding:12px 16px;margin-bottom:18px;font-size:13px}.post{background:#fff;border-radius:18px;padding:28px 24px;box-shadow:0 3px 18px rgba(0,0,0,.06)}h1{font-size:29px;line-height:1.4;margin:0 0 20px}h2{font-size:21px;margin:28px 0 10px;border-left:4px solid #111827;padding-left:10px}p{margin:0 0 17px}.greeting{font-size:16px}.disclosure{background:#f8fafc;border-radius:10px;padding:12px 14px;color:#5b6470;font-size:12px;margin-bottom:22px}figure{margin:24px 0;text-align:center}figure img{display:block;width:100%;max-height:460px;object-fit:contain;border-radius:12px;border:1px solid #e5e7eb;background:#fff}figcaption{font-size:11px;color:#8a919b;margin-top:5px}.product{padding:14px;background:#f8fafc;border-radius:12px;margin:20px 0;font-size:13px}.partner{display:inline-block;margin-top:22px;padding:12px 18px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700}.fact{margin-top:20px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;font-size:12px;color:#666}.back{display:inline-block;margin-bottom:12px;color:#374151;text-decoration:none;font-size:13px}@media(max-width:600px){.wrap{padding:16px 10px 40px}.post{padding:22px 17px}h1{font-size:24px}h2{font-size:19px}}
</style></head><body><main class="wrap"><div class="preview-bar">📱 게시 전 미리보기 · 실제 블로그에 올리기 전 최종 확인용</div><article class="post"><h1>${escapeHtml(title)}</h1><div class="disclosure">${escapeHtml(blog.disclosure ?? "")}</div><div class="product"><strong>선정 상품</strong><br>${escapeHtml(product.productName ?? "")}</div><div class="body">${renderBody(blog.body ?? "", images)}</div>${partnerUrl ? `<a class="partner" href="${escapeHtml(partnerUrl)}" target="_blank" rel="noopener noreferrer">상품 확인하기</a>` : ""}<div class="fact">상품 정보와 배송 조건은 생성 당시 쿠팡 API 검색 결과를 기준으로 작성되었습니다. 실제 판매 페이지의 최신 정보와 차이가 있을 수 있습니다.</div></article></main></body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store" } });
}
