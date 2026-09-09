/**
 * 대시보드의 기본 화면입니다.
 * 기존에 저장된 콘텐츠는 보여주지 않고, 사용자가 직접 생성할 때만 결과 화면으로 이동합니다.
 */

export function renderLandingDashboard(): Response {
  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>쿠팡파트너스 자동 콘텐츠</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#f4f5f7;color:#202124;font-family:Arial,"Noto Sans KR",sans-serif}
    .wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .box{width:min(560px,100%);background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:36px 24px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.05)}
    h1{margin:0 0 8px;font-size:27px}
    p{margin:0 0 24px;color:#6b7280;font-size:14px}
    button{border:0;border-radius:11px;padding:14px 22px;background:#111827;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
    button:disabled{opacity:.55;cursor:wait}
    #status{margin-top:14px;color:#6b7280;font-size:13px;min-height:21px}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="box">
      <h1>쿠팡파트너스 자동 콘텐츠</h1>
      <p>아직 표시할 생성 결과가 없습니다.</p>
      <button id="generateButton" type="button" onclick="generateContent()">지금 글 1개 생성하기</button>
      <div id="status"></div>
    </section>
  </main>
  <script>
    // 기본 화면에서는 아무 콘텐츠도 불러오지 않습니다.
    // 버튼을 눌렀을 때만 실제 생성 API를 호출합니다.
    async function generateContent(){
      const button=document.getElementById('generateButton');
      const status=document.getElementById('status');
      button.disabled=true;
      button.textContent='생성 중...';
      status.textContent='상품 선정 → 이미지 → 제목 → 본문을 생성하고 있습니다.';
      try{
        const response=await fetch('/generate',{method:'GET',cache:'no-store'});
        const result=await response.json();
        if(!response.ok || !result.ok) throw new Error(result.message || '생성에 실패했습니다.');
        // 생성이 끝난 뒤 전용 미리보기 화면을 바로 엽니다.
        window.location.href='/preview';
      }catch(error){
        status.textContent='생성 실패: '+(error?.message || '알 수 없는 오류');
        button.disabled=false;
        button.textContent='지금 글 1개 생성하기';
      }
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
