/** 오늘의 쿠팡 추천 상품 화면입니다. */

export function renderLandingDashboard(): Response {
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>오늘의 쿠팡 추천 상품</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#f4f5f7;color:#202124;font-family:Arial,"Noto Sans KR",sans-serif}
    .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .box{width:min(560px,100%);background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:30px 24px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.05)}
    h1{margin:0 0 8px;font-size:27px}
    .sub{margin:0 0 22px;color:#6b7280;font-size:14px}
    button{border:0;border-radius:11px;padding:14px 22px;background:#111827;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
    button:disabled{opacity:.55;cursor:wait}
    #status{margin-top:14px;color:#6b7280;font-size:13px;min-height:21px}
    #result{display:none;margin-top:24px;text-align:left;border-top:1px solid #eee;padding-top:24px}
    .trend{font-size:13px;color:#6b7280;margin-bottom:10px}
    .trend b{color:#111827}
    .product{border:1px solid #e5e7eb;border-radius:16px;padding:16px;background:#fff}
    .product img{display:block;width:100%;max-height:280px;object-fit:contain;border-radius:12px;background:#f8f8f8;margin-bottom:16px}
    .name{font-size:18px;font-weight:700;line-height:1.5;margin-bottom:10px}
    .price{font-size:20px;font-weight:800;margin-bottom:16px}
    .meta{font-size:12px;color:#6b7280;margin-bottom:16px}
    .link{display:block;text-align:center;text-decoration:none;border-radius:10px;padding:13px;background:#111827;color:#fff;font-weight:700}
    .again{margin-top:12px;width:100%;background:#fff;color:#111827;border:1px solid #d1d5db}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="box">
      <h1>오늘의 쿠팡 추천 상품</h1>
      <p class="sub">오늘 많이 검색되는 관심사를 기준으로 상품을 하나 골라 보여드립니다.</p>
      <button id="recommendButton" type="button" onclick="loadRecommendation()">오늘의 추천 상품 보기</button>
      <div id="status"></div>
      <div id="result">
        <div class="trend">오늘의 검색어 · <b id="keyword"></b></div>
        <article class="product">
          <img id="productImage" alt="추천 상품 이미지">
          <div class="name" id="productName"></div>
          <div class="price" id="productPrice"></div>
          <div class="meta" id="productMeta"></div>
          <a id="productLink" class="link" target="_blank" rel="noopener noreferrer">제품 정보 보기 ↗</a>
          <button class="again" type="button" onclick="loadRecommendation()">추천 상품 다시 확인</button>
        </article>
      </div>
    </section>
  </main>
  <script>
    async function loadRecommendation(){
      const button=document.getElementById('recommendButton');
      const status=document.getElementById('status');
      const resultBox=document.getElementById('result');
      button.disabled=true;
      button.textContent='검색 중...';
      status.textContent='오늘의 검색어와 쿠팡 상품을 확인하고 있습니다.';
      try{
        const response=await fetch('/recommend',{cache:'no-store'});
        const result=await response.json();
        if(!response.ok || !result.ok) throw new Error(result.message || '추천 상품을 찾지 못했습니다.');
        const p=result.product || {};
        document.getElementById('keyword').textContent=result.keyword || '';
        document.getElementById('productName').textContent=p.productName || '상품명 없음';
        document.getElementById('productPrice').textContent=p.productPrice ? Number(p.productPrice).toLocaleString('ko-KR')+'원' : '가격 정보 없음';
        document.getElementById('productMeta').textContent=(p.isRocket?'로켓배송 · ':'')+'쿠팡 검색 순위 '+(p.rank || '-')+'위';
        const image=document.getElementById('productImage');
        if(p.productImage){image.src=p.productImage;image.style.display='block';}else{image.style.display='none';}
        const link=document.getElementById('productLink');
        link.href=p.productUrl || '#';
        resultBox.style.display='block';
        status.textContent='추천 상품을 확인했습니다.';
      }catch(error){
        status.textContent='추천 실패: '+(error?.message || '알 수 없는 오류');
      }finally{
        button.disabled=false;
        button.textContent='오늘의 추천 상품 보기';
      }
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers:{
      "Content-Type":"text/html;charset=UTF-8",
      "Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff",
    },
  });
}
