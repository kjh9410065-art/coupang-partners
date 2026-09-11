import { getTodayRecommendation, type RecommendEnv } from "./recommend";

/**
 * 쿠팡 상품 추천 전용 Worker입니다.
 *
 * /          오늘의 추천 상품 화면
 * /recommend 오늘의 추천 상품 JSON
 * /recommend?refresh=1 기존 상품과 다른 상품을 다시 선택
 */

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
    button{width:100%;border:0;border-radius:12px;padding:14px;background:#111827;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
    button:disabled{opacity:.55;cursor:wait}
    #status{margin-top:14px;text-align:center;color:#777;font-size:13px;min-height:20px}
    .error{color:#d33!important}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <div class="eyebrow">TODAY'S COUPANG PICK</div>
      <h1>오늘 사람들이 많이 찾은 상품</h1>
      <p class="desc">오늘의 검색 관심 신호를 확인해 쿠팡 상품 하나를 추천합니다.</p>

      <button id="button" onclick="loadRecommendation(false)">오늘의 추천 상품 보기</button>
      <div id="status"></div>

      <div id="result">
        <div id="keyword" class="keyword"></div>
        <article class="product">
          <div class="image-wrap"><img id="image" alt="추천 상품"></div>
          <div class="info">
            <div id="name" class="name"></div>
            <div id="price" class="price"></div>
            <div id="meta" class="meta"></div>
            <a id="link" class="link" target="_blank" rel="noopener noreferrer">쿠팡에서 상품 보기</a>
          </div>
        </article>
      </div>
    </section>
  </main>

  <script>
    async function loadRecommendation(refresh){
      const button=document.getElementById('button');
      const status=document.getElementById('status');
      button.disabled=true;
      button.textContent=refresh ? '다른 상품 찾는 중...' : '오늘의 상품 찾는 중...';
      status.className='';
      status.textContent=refresh ? '현재 상품과 다른 쿠팡 상품을 찾고 있습니다.' : '오늘의 검색 관심 신호 → 쿠팡 상품을 확인하고 있습니다.';
      try{
        const endpoint=refresh ? '/recommend?refresh=1' : '/recommend';
        const response=await fetch(endpoint,{cache:'no-store'});
        const result=await response.json();
        if(!response.ok || !result.ok) throw new Error(result.message || '추천 상품을 찾지 못했습니다.');

        const product=result.product;
        document.getElementById('keyword').textContent='오늘의 검색어 · '+result.keyword;
        document.getElementById('image').src=product.productImage;
        document.getElementById('name').textContent=product.productName;
        document.getElementById('price').textContent=product.productPrice ? product.productPrice.toLocaleString('ko-KR')+'원' : '가격 확인';
        document.getElementById('meta').textContent='오늘의 검색 관심 신호를 기준으로 선정 · 쿠팡 검색 결과 상품';
        document.getElementById('link').href=product.productUrl;
        document.getElementById('result').style.display='block';
        status.textContent=refresh ? '다른 상품으로 변경했습니다.' : '오늘의 추천 상품입니다.';
        button.textContent='다른 상품 보기';
        button.onclick=()=>loadRecommendation(true);
        button.disabled=false;
      }catch(error){
        status.className='error';
        status.textContent='추천 실패: '+(error?.message || '알 수 없는 오류');
        button.disabled=false;
        button.textContent='다시 시도하기';
      }
    }
  </script>
</body>
</html>`;

  return new Response(html,{headers:{"Content-Type":"text/html;charset=UTF-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}

const handler = {
  async fetch(request: Request, env: RecommendEnv) {
    const url = new URL(request.url);

    if (url.pathname === "/") return renderPage();

    if (url.pathname === "/recommend") {
      try {
        // refresh=1이면 KV에 저장된 기존 상품과 다른 상품을 선택합니다.
        const refresh = url.searchParams.get("refresh") === "1";
        const result = await getTodayRecommendation(env, refresh);
        return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        const message = error instanceof Error ? error.message : "알 수 없는 오류";
        return Response.json({ ok: false, message }, { status: 500, headers: { "Cache-Control": "no-store" } });
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

export default handler;
