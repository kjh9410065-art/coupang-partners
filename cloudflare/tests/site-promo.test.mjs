import test from "node:test";
import assert from "node:assert/strict";
import { SITE_PROMO_TARGETS, pickPromoTarget } from "../src/site-catalog.ts";
import { buildSitePromo } from "../src/site-promo.ts";
import { saveBlogDraft, handleDraftSync } from "../src/draft-sync.ts";

const body = [
  "생활 속에서 필요한 디지털 도구를 찾다 보면 각 분야에 맞는 사이트를 하나씩 검색해야 하는 경우가 있습니다. 여러 서비스를 한 번에 둘러볼 수 있는 곳을 알아두면 필요한 서비스를 찾는 과정이 조금 더 간단해질 수 있습니다.",
  "TCFLiCK은 일상과 비즈니스에 필요한 디지털 서비스를 직접 만들고 제공합니다. 계산 도구, 공연 정보, 문서 작성 등 목적에 따라 서로 다른 서비스로 이동할 수 있으며, 홈페이지에서 관련 서비스의 이용 가이드도 살펴볼 수 있습니다.",
  "현재 제공하는 기능을 확인하고 필요에 맞는 서비스를 선택하는 데 활용할 수 있습니다.",
].join("\n\n");

function store() {
  const data = new Map();
  return {
    async get(key, type) { const v=data.get(key); return v===undefined ? null : type==="json" ? JSON.parse(v) : v; },
    async put(key, value) {data.set(key,value);},
    async list({prefix}){return {keys:[...data.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true};}
  };
}
test("only maintained TCFLiCK public services are scheduled",()=>{
  assert.equal(SITE_PROMO_TARGETS.length, 6);
  assert.ok(SITE_PROMO_TARGETS.some(s=>s.slug==="tcflick"));
  assert.ok(SITE_PROMO_TARGETS.every(s=>s.url.startsWith("https://") && s.imageUrl.startsWith("https://") && s.facts.length>=2));
  assert.ok(SITE_PROMO_TARGETS.every(s=>!/(bogopang|보고팡)/i.test(s.slug+" "+s.name)));
  const week=Array.from({length:6},(_,i)=>pickPromoTarget("2026-10-"+String(i+15).padStart(2,"0")).slug);
  assert.equal(new Set(week).size,6);
});

test("website promotion is not labeled as Coupang affiliate",async()=>{
  const t=SITE_PROMO_TARGETS[0];
  const ai={async run(){return {response:body};}};
  const draft=await buildSitePromo(t,ai);
  assert.ok(draft.body.endsWith(t.url));
  assert.ok(!draft.body.includes("쿠팡 파트너스"));
  assert.equal(draft.titles.length,3);
});
test("promotion AI fabricating a personal testimonial is rejected",async()=>{
  const t=SITE_PROMO_TARGETS[0];
  let calls=0;
  const ai={async run(){calls++;return {response:body+"\n\n직접 사용해보니 무조건 좋았습니다."};}};
  await assert.rejects(()=>buildSitePromo(t,ai),/품질 검사를 통과하지/);
  assert.equal(calls,2);
});
test("authenticated synchronization stores site branding as safe svg with no disclosure",async()=>{
  const token="123456789012345678901234567890123456";
  const site=SITE_PROMO_TARGETS.find(s=>s.slug==="mingka");
  const ai={async run(){return {response:body};}};
  const promo=await buildSitePromo(site,ai);
  const env={CONTENT_STORE:store(),DRAFT_SYNC_TOKEN:token};
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="a"></linearGradient></defs><rect width="10" height="10" fill="url(#a)"/></svg>';
  const draft=await saveBlogDraft(env,{
    date:"2026-10-15",slot:"evening",kind:"site",
    recommendation:{
      keyword:site.name,generatedAt:"2026-10-15T09:00:00Z",
      product:{productId:site.slug,productName:site.name,productPrice:0,productImage:site.imageUrl,partnerUrl:site.url},
    },
    blog:promo,
  },async()=>new Response(svg,{headers:{"content-type":"image/svg+xml"}}));
  assert.equal(draft.kind,"site");
  assert.equal(draft.disclosure,"");
  assert.equal(draft.imageFilename,"product.svg");
  const req=(path)=>new Request("https://worker.example"+path,{headers:{"Authorization":"Bearer "+token}});
  const image=await handleDraftSync(req("/sync/drafts/2026-10-15-evening/image"),env);
  assert.equal(image.headers.get("content-type"),"image/svg+xml");
  assert.equal(await image.text(),svg);
});
test("unsafe SVG is not saved as a promotional image",async()=>{
  const env={CONTENT_STORE:store()};
  const svg='<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  const promo={title:"example",body:body+" https://tcflick.com/"};
  await assert.rejects(()=>saveBlogDraft(env,{
    date:"2026-10-15",slot:"evening",kind:"site",
    recommendation:{product:{productId:"tcflick",productImage:"https://tcflick.com/logo.svg",partnerUrl:"https://tcflick.com/"}},
    blog:promo
  },async()=>new Response(svg)),/지원하지 않는/);
});
