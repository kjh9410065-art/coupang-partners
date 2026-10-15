import { buildBlog } from "./blog.ts";
import { pickPromoTarget } from "./site-catalog.ts";
import { buildSitePromo } from "./site-promo.ts";
import { draftKey, saveBlogDraft, handleDraftSync, type StoredDraft } from "./draft-sync.ts";
import { getTodayRecommendation, koreaDate, type RecommendEnv } from "./recommend.ts";

/**
 * 쿠팡 상품 추천 전용 Worker입니다.
 *
 * /          오늘의 추천 상품 화면
 * /recommend 오늘의 추천 상품 JSON
 * /recommend?refresh=1 기존 상품과 다른 상품을 다시 선택
 */


type BlogEnv = RecommendEnv & { AI?: Ai; DRAFT_SYNC_TOKEN?: string };

/** 동일한 상품/가격의 원고는 일정 시간 저장해 AI 호출을 반복하지 않습니다. */
async function getPreparedBlog(recommendation: any, env: BlogEnv) {
  const p = recommendation.product;
  const identity = JSON.stringify([koreaDate(), p.productId, p.productPrice, recommendation.generatedAt, p.partnerUrl, p.isRocket]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const key = "naver-copy:ai:v2:" + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  const saved = await env.CONTENT_STORE?.get(key, "json");
  if (saved && typeof (saved as any).body === "string") return saved;
  const written = await buildBlog(recommendation, env.AI);
  await env.CONTENT_STORE?.put(key, JSON.stringify(written), { expirationTtl: 60 * 60 * 3 });
  return written;
}

function renderPage(): Response {
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>오늘의 쿠팡 추천</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#f4f5f7;color:#171717;font-family:Arial,"Noto Sans KR",sans-serif}
    .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{width:min(520px,100%);background:#fff;border-radius:22px;padding:26px 22px 30px;box-shadow:0 8px 30px rgba(0,0,0,.07)}
    .eyebrow{font-size:13px;font-weight:700;color:#777;margin-bottom:8px}
    h1{font-size:27px;margin:0 0 8px}
    .desc{font-size:14px;color:#777;margin:0 0 22px}
    #result{display:none}
    .keyword{display:inline-block;padding:7px 10px;border-radius:999px;background:#f1f3f5;font-size:12px;font-weight:700;margin-bottom:14px}
    .product{border:1px solid #e7e7e7;border-radius:17px;overflow:hidden;background:#fff}
    .image-wrap{background:#fafafa;display:flex;align-items:center;justify-content:center;min-height:280px;padding:18px}
    .image-wrap img{width:100%;height:280px;object-fit:contain}
    .info{padding:18px}
    .name{font-size:18px;font-weight:700;line-height:1.45;margin-bottom:12px}
    .price{font-size:22px;font-weight:800;margin-bottom:16px}
    .meta{font-size:12px;color:#888;margin-bottom:16px}
    .link{display:block;text-align:center;text-decoration:none;background:#111827;color:#fff;padding:14px;border-radius:12px;font-weight:700}
    .partner-url{margin-top:10px;padding:11px 12px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;font-size:11px;line-height:1.45;word-break:break-all;color:#666}
    .partner-label{font-size:11px;font-weight:700;color:#333;margin-bottom:5px}
    button{width:100%;border:0;border-radius:12px;padding:14px;background:#111827;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
    button:disabled{opacity:.55;cursor:wait}
    .disclosure{font-size:12px;color:#555;line-height:1.6;background:#f5f5f5;padding:12px;border-radius:10px;margin-bottom:18px}
    .editor{margin-top:22px} label{display:block;font-size:14px;font-weight:700;margin:14px 0 8px} input,textarea{width:100%;padding:12px;border:1px solid #ccc;border-radius:10px;font:inherit} textarea{min-height:260px;line-height:1.7;resize:vertical} .actions{display:flex;gap:8px;margin-top:12px}.actions button{font-size:14px} .hint{font-size:12px;color:#666;line-height:1.6}
    #status{margin-top:14px;text-align:center;color:#777;font-size:13px;min-height:20px}
    .error{color:#d33!important}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <div class="eyebrow">TODAY'S COUPANG PICK</div>
      <h1>쿠팡 파트너스 글 만들기</h1>
      <div class="disclosure">이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</div>
      <p class="desc">상품을 자동으로 고르고 블로그 글까지 작성합니다. 확인 후 복사해서 게시하세요.</p>

      <button id="button" onclick="loadRecommendation(false)">상품 자동 선정 + 글 작성</button>
      <div id="status"></div>

      <div id="result">
        <div id="keyword" class="keyword"></div>
        <article class="product">
          <div class="image-wrap"><img id="image" alt="추천 상품"></div>
          <div class="info">
            <div id="name" class="name"></div>
            <div id="price" class="price"></div>
            <div id="meta" class="meta"></div>
            <!-- 실제 클릭 URL은 쿠팡 파트너스 단축링크입니다. -->
            <a id="link" class="link" target="_blank" rel="noopener noreferrer">쿠팡에서 상품 보기</a>
            <!-- 파트너스 단축링크 자체도 화면에서 확인할 수 있도록 표시합니다. -->
            <div id="partner-url" class="partner-url" style="display:none">
              <div class="partner-label">쿠팡 파트너스 단축링크</div>
              <div id="partner-url-text"></div>
            </div>
          </div>
        </article>
        <div class="editor">
          <p class="hint">상품에 맞춰 글이 작성되었습니다. 제목과 본문을 자유롭게 수정하세요.</p>
          <div id="draft" hidden>
            <label for="draft-title">제목</label><input id="draft-title" maxlength="200">
            <label for="draft-body">본문</label><textarea id="draft-body"></textarea>
            <p class="hint">확인된 상품 정보만 사용한 초안입니다. 사진은 위 상품 이미지를 참고해 별도로 삽입하세요. 본문 복사 시 고지문과 파트너스 링크가 포함됩니다.</p>
            <div class="actions"><button onclick="copyDraft('title')">제목 복사</button><button onclick="copyDraft('body')">본문 복사</button><button onclick="copyDraft('link')">링크 복사</button></div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <script>
    let current=null;
    let originalTitle='', originalBody='';
    const disclosure='이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';
    // 사용자 입력은 HTML로 실행하지 않고 텍스트로만 취급합니다.
    function makeDraft(){
      if(!current) return;
      originalTitle=current.blog.title;
      originalBody=current.blog.body;
      document.getElementById('draft-title').value=originalTitle;
      document.getElementById('draft-body').value=originalBody;
      document.getElementById('draft').hidden=false;
    }
    async function copyDraft(kind){
      if(!current) return;
      let value=kind==='title'?document.getElementById('draft-title').value:kind==='link'?current.product.partnerUrl:document.getElementById('draft-body').value;
      if(kind==='body'){
        value=value.split(disclosure).join('').trim();
        if(!value.includes(current.product.partnerUrl)) value+='\\n\\n'+current.product.partnerUrl;
        value=disclosure+'\\n\\n'+value;
      }
      try{
        await navigator.clipboard.writeText(value);
        document.getElementById('status').textContent='복사했습니다.';
      }catch{
        const field=document.createElement('textarea');field.value=value;document.body.appendChild(field);field.select();
        const ok=document.execCommand('copy');field.remove();
        document.getElementById('status').textContent=ok?'복사했습니다.':'자동 복사를 사용할 수 없습니다. 입력란에서 직접 선택해 복사하세요.';
      }
    }
    async function loadRecommendation(refresh){
      if(refresh && (document.getElementById('draft-title').value!==originalTitle || document.getElementById('draft-body').value!==originalBody) && !confirm('상품을 바꾸면 작성 중인 초안이 초기화됩니다. 계속할까요?')) return;
      const button=document.getElementById('button');
      const status=document.getElementById('status');
      button.disabled=true;
      button.textContent=refresh ? '다른 상품 찾는 중...' : '오늘의 상품 찾는 중...';
      status.className='';
      status.textContent=refresh ? '현재 상품과 다른 쿠팡 상품을 찾고 있습니다.' : '오늘의 검색 관심 신호 → 쿠팡 상품을 확인하고 있습니다.';
      try{
        const endpoint=refresh && current ? '/recommend?refresh=1&keyword='+encodeURIComponent(current.keyword)+'&rank='+current.product.rank : '/recommend';
        const response=await fetch(endpoint,{cache:'no-store'});
        const result=await response.json();
        if(!response.ok || !result.ok) throw new Error(result.message || '추천 상품을 찾지 못했습니다.');

        if(!result.blog || !result.blog.body) throw new Error('글 작성 결과를 받지 못했습니다. 다시 시도해주세요.');
        current=result;
        document.getElementById('draft').hidden=true;
        const product=result.product;
        document.getElementById('keyword').textContent=(result.source==='fallback'?'기본 추천 주제 · ':'검색 관심 주제 · ')+result.keyword;
        document.getElementById('image').src=product.productImage;
        document.getElementById('name').textContent=product.productName;
        document.getElementById('price').textContent=product.productPrice ? product.productPrice.toLocaleString('ko-KR')+'원' : '가격 확인';
        document.getElementById('meta').textContent='쿠팡 검색 '+product.rank+'위 · '+(result.source==='fallback'?'기본 주제로 추천':'검색 관심 신호로 추천');

        // 파트너스 단축링크를 우선 사용합니다.
        const partnerUrl=product.partnerUrl || '';
        document.getElementById('link').href=partnerUrl || product.productUrl;

        // API에서 실제 파트너스 단축링크가 생성된 경우 화면에도 그대로 보여줍니다.
        const partnerBox=document.getElementById('partner-url');
        const partnerText=document.getElementById('partner-url-text');
        if(partnerUrl){
          partnerText.textContent=partnerUrl;
          partnerBox.style.display='block';
        }else{
          partnerText.textContent='파트너스 단축링크가 생성되지 않았습니다.';
          partnerBox.style.display='block';
        }

        document.getElementById('result').style.display='block';
        makeDraft();
        status.textContent=refresh ? '다른 상품과 새 글을 준비했습니다.' : '상품 자동 선정과 글 작성을 완료했습니다.';
        button.textContent='다른 상품으로 글 다시 만들기';
        button.onclick=()=>loadRecommendation(true);
        button.disabled=false;
      }catch(error){
        status.className='error';
        status.textContent='추천 실패: '+(error?.message || '알 수 없는 오류');
        button.disabled=false;
        button.textContent='다시 시도하기';
      }
    }
    // 페이지를 열면 상품 선정과 글 작성을 한 번에 시작합니다.
    loadRecommendation(false);
  </script>
</body>
</html>`;

  return new Response(html,{headers:{"Content-Type":"text/html;charset=UTF-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}

const handler = {
  /**
   * 하루 세 개: 오전 9시/오후 2시 쿠팡 상품, 오후 6시 사이트 소개.
   * 오전 10시/오후 3시/오후 7시는 각각 실패한 글만 재시도합니다.
   */
  async scheduled(controller: { cron?: string; scheduledTime?: number }, env: BlogEnv) {
    const slots: Record<string, "morning" | "afternoon" | "evening"> = {
      "0 0 * * *": "morning", "0 1 * * *": "morning",
      "0 5 * * *": "afternoon", "0 6 * * *": "afternoon",
      "0 9 * * *": "evening", "0 10 * * *": "evening",
    };
    const slot = slots[controller.cron ?? ""];
    if (!slot) throw new Error("등록되지 않은 생성 일정입니다.");
    const date = koreaDate(controller.scheduledTime);
    const isEvening = slot === "evening";
    const id = date + "-" + slot;
    try {
      if (!env.CONTENT_STORE) throw new Error("CONTENT_STORE KV 바인딩 없음");
      const already = await env.CONTENT_STORE.get(draftKey(id), "json") as StoredDraft | null;
      if (already) return;
      if (isEvening) {
        // 여섯 개의 확인된 서비스 중 하나를 날짜별로 순환 홍보합니다.
        const target = pickPromoTarget(date);
        const blog = await buildSitePromo(target, env.AI);
        const recommendation = {
          keyword: target.name,
          generatedAt: new Date().toISOString(),
          product: {
            productId: target.slug,
            rank: 0,
            productName: target.name,
            productPrice: 0,
            productImage: target.imageUrl,
            productUrl: target.url,
            partnerUrl: target.url,
          },
        };
        await saveBlogDraft(env, { date, slot, kind: "site", recommendation, blog });
      } else {
        const otherSlot = slot === "morning" ? "afternoon" : "morning";
        const other = await env.CONTENT_STORE.get(draftKey(date + "-" + otherSlot), "json") as StoredDraft | null;
        const recommendation = await getTodayRecommendation(env, false, undefined, other ? [other.productId] : []);
        const blog = await getPreparedBlog(recommendation, env);
        const saved = await saveBlogDraft(env, { date, slot, recommendation, blog });
        await env.CONTENT_STORE.put("latest:blog", JSON.stringify({
          ...blog, productId: recommendation.product.productId, generatedAt: saved.createdAt,
        }));
      }
      const report = JSON.stringify({
        status: "success", date, slot, kind: isEvening ? "site" : "affiliate", id,
        finishedAt: new Date().toISOString(),
      });
      await env.CONTENT_STORE.put("run:" + id, report, { expirationTtl: 120 * 86400 });
      await env.CONTENT_STORE.put("last-run", report);
    } catch (error) {
      const report = JSON.stringify({
        status: "failed", date, slot,
        reason: error instanceof Error ? error.message : "알 수 없는 오류",
        finishedAt: new Date().toISOString(),
      });
      await env.CONTENT_STORE?.put("run:" + id, report, { expirationTtl: 120 * 86400 });
      await env.CONTENT_STORE?.put("last-run", report);
      throw error;
    }
  },
  async fetch(request: Request, env: BlogEnv) {
    const url = new URL(request.url);

    // 파일 목록과 이미지 내려받기는 비밀 동기화 토큰이 있어야 가능합니다.
    if (url.pathname.startsWith("/sync/")) return handleDraftSync(request, env);

    if (url.pathname === "/") return renderPage();

    if (url.pathname === "/recommend") {
      try {
        // refresh=1이면 KV에 저장된 기존 상품과 다른 상품을 선택합니다.
        const refresh = url.searchParams.get("refresh") === "1";
        const keyword = url.searchParams.get("keyword") || "";
        const rank = Number(url.searchParams.get("rank"));
        const selection = keyword && keyword.length <= 100 && Number.isInteger(rank) && rank > 0 && rank <= 999 ? { keyword, rank } : undefined;
        const result = await getTodayRecommendation(env, refresh, selection);
        return Response.json({ ok: true, ...result, blog: await getPreparedBlog(result, env) }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        return Response.json({ ok: false, message }, { status: 500, headers: { "Cache-Control": "no-store" } });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

export default handler;
