import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.ts';
import { koreaDate } from '../src/recommend.ts';

function kvStore() {
  const data = new Map();
  return {data, async get(k,t) {const v=data.get(k);return v===undefined?null:t==='json'?JSON.parse(v):v;},
    async put(k,v){data.set(k,v);},async list({prefix}) {return {keys:[...data.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true};}};
}
const body = '수납함을 고를 때는 제품명에 표시된 용량과 구성부터 살펴볼 수 있습니다. 이번에 확인한 상품은 수납함으로, 제품명을 기준으로 어떤 물건을 담을지 생각해 볼 수 있습니다.\n\n사용할 공간의 크기를 먼저 확인하고 상품 상세 페이지에 안내된 치수와 비교해 보세요. 선택 옵션에 따라 실제 구성은 달라질 수 있으므로 주문 화면에 표시된 제품 정보를 확인하는 것이 좋습니다.';
test('six cron events produce exactly two different products and one promotion; retries do not call AI again', async()=>{
  const original=globalThis.fetch;let aiCalls=0;let failImage=true;
  const kv=kvStore();
  const token='test-only-token-12345678901234567890123456';
  const env={CONTENT_STORE:kv,COUPANG_ACCESS_KEY:'test',COUPANG_SECRET_KEY:'test',DRAFT_SYNC_TOKEN:token,AI:{async run(){aiCalls++;return {response:body};}}};
  globalThis.fetch=async(url)=>{
    const u=String(url);
    if(u.includes('trends.google.com')) return new Response('<rss/>');
    if(u.includes('/products/search'))return Response.json({rCode:'0',data:{productData:[1,2].map(id=>({productId:id,productName:'수납함 상품 '+id,productPrice:10000,productImage:'https://thumbnail.coupangcdn.com/test.jpg',productUrl:'https://www.coupang.com/vp/products/'+id,rank:id}))}});
    if(u.includes('/v1/deeplink'))return Response.json({rCode:'0',data:[{shortenUrl:'https://link.coupang.com/a/test'}]});
    if(failImage){failImage=false;return new Response('unavailable',{status:503});}
    return new Response(new Uint8Array([255,216,255,217]));
  };
  try{
    await assert.rejects(()=>worker.scheduled({cron:'0 0 * * *'},env),/503/);
    assert.equal([...kv.data.keys()].filter(k=>k.startsWith('blogdraft:')).length,0);
    for(const cron of ['0 1 * * *','0 5 * * *','0 6 * * *','0 9 * * *','0 10 * * *']) await worker.scheduled({cron},env);
    const req=path=>new Request('https://example.test'+path,{headers:{Authorization:'Bearer '+token}});
    const {drafts}=await (await worker.fetch(req('/sync/drafts'),env)).json();
    assert.equal(drafts.length,3);
    const products=drafts.filter(d=>d.kind==='affiliate');
    assert.equal(products.length,2);assert.equal(new Set(products.map(d=>d.productId)).size,2);
    assert.equal(drafts.find(d=>d.kind==='site').disclosure,'');
    assert.equal(aiCalls,3);
    const afternoon=drafts.find(d=>d.slot==='afternoon');
    assert.equal((await worker.fetch(req('/sync/drafts/'+afternoon.id+'/image'),env)).status,200);
    assert.equal((await worker.fetch(new Request('https://example.test/sync/status'),env)).status,401);
    const status=await (await worker.fetch(req('/sync/status'),env)).json();
    assert.ok(status.runs.every(r=>r.ready&&r.run.status==='success'));
    await assert.rejects(()=>worker.scheduled({cron:'bad'},env),/등록되지/);
  }finally{globalThis.fetch=original;}
});
test('Korean date uses scheduled timestamp across UTC midnight',()=>{
  assert.equal(koreaDate(Date.parse('2026-10-15T15:00:00Z')),'2026-10-16');
});

// 설정 파일의 실제 통합 표현식과 예약 시각으로 6회 모두 올바른 슬롯을 찾는지 확인합니다.
test('single cron routes all six scheduled times and skips completed slots', async()=>{
  const cron='0 0,1,5,6,9,10 * * *';
  const pairs=[[0,'morning'],[1,'morning'],[5,'afternoon'],[6,'afternoon'],[9,'evening'],[10,'evening']];
  for (const [hour,slot] of pairs) {
    const seen=[];
    const env={CONTENT_STORE:{async get(key){seen.push(key);return {id:'existing'};}}};
    await worker.scheduled({cron,scheduledTime:Date.UTC(2026,9,15,hour)},env);
    assert.deepEqual(seen,['blogdraft:2026-10-15-'+slot]);
  }
  await assert.rejects(()=>worker.scheduled({cron},{}),/예약 실행 시각/);
  await assert.rejects(()=>worker.scheduled({cron,scheduledTime:Date.UTC(2026,9,15,4)},{}),/등록되지/);
});
