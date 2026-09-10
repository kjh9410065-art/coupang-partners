export interface QualityInput { keyword: string; productName: string; titles: unknown; selectedTitle: unknown; body: unknown; }
export interface QualityResult { ok: boolean; score: number; reasons: string[]; metrics: { bodyLength: number; titleCount: number; uniqueTitleCount: number; repeatedPhraseCount: number; forbiddenPhraseCount: number; }; }

// 후기처럼 보이거나 과장 광고로 오해될 수 있는 표현은 차단합니다.
const FORBIDDEN_PATTERNS = [/내돈내산/i,/직접\s*(써|사용)해보/i,/써보니/i,/사용해보니/i,/무조건/i,/100%\s*만족/i,/최저가/i,/역대급/i,/대박/i];
function normalize(value: string) { return value.toLowerCase().replace(/[^0-9a-z가-힣]+/gi, "").trim(); }
function titleSimilarity(a: string,b: string) { const l=new Set(normalize(a).match(/[가-힣]{2,}|[a-z0-9]{2,}/gi)??[]),r=new Set(normalize(b).match(/[가-힣]{2,}|[a-z0-9]{2,}/gi)??[]); if(!l.size||!r.size)return 0; let n=0; for(const x of l)if(r.has(x))n++; return n/Math.max(l.size,r.size); }
function countRepeatedPhrases(body: string) { const s=body.split(/[.!?。！？\n]+/).map(normalize).filter(x=>x.length>=18); let n=0; for(let i=0;i<s.length;i++)for(let j=i+1;j<s.length;j++)if(s[i]===s[j])n++; return n; }

/** 짧은 상품 소개도 통과시키되, 내용이 빈약한 글은 막습니다. */
export function validateContentQuality(input: QualityInput): QualityResult {
  const titles=Array.isArray(input.titles)?input.titles.filter((x):x is string=>typeof x==="string"&&x.trim().length>0):[];
  const selectedTitle=typeof input.selectedTitle==="string"?input.selectedTitle.trim():"";
  const body=typeof input.body==="string"?input.body.trim():"";
  const productName=input.productName.trim();
  const reasons:string[]=[];
  const uniqueTitleCount=new Set(titles.map(normalize)).size;
  const repeatedPhraseCount=countRepeatedPhrases(body);
  const forbiddenPhraseCount=FORBIDDEN_PATTERNS.reduce((n,p)=>n+(p.test(body)?1:0),0);
  const normalizedBody=normalize(body), normalizedProduct=normalize(productName), normalizedKeyword=normalize(input.keyword);
  if(titles.length!==5)reasons.push("제목이 정확히 5개가 아닙니다.");
  if(uniqueTitleCount<4)reasons.push("제목 후보가 서로 지나치게 비슷합니다.");
  if(!selectedTitle||!titles.some(t=>normalize(t)===normalize(selectedTitle)))reasons.push("선정 제목이 제목 후보에 없습니다.");
  // 900자 미만만 차단합니다. 분량을 채우기 위한 반복 문장은 허용하지 않습니다.
  if(body.length<900)reasons.push("본문이 너무 짧습니다.");
  if(body.length>3000)reasons.push("본문이 지나치게 깁니다.");
  if(productName&&!normalizedBody.includes(normalizedProduct))reasons.push("본문에 상품명이 없습니다.");
  if(normalizedKeyword&&!normalizedBody.includes(normalizedKeyword)&&!normalizedProduct.includes(normalizedKeyword))reasons.push("검색 주제와 본문의 연결이 약합니다.");
  if(repeatedPhraseCount>0)reasons.push("동일한 문장이 반복됩니다.");
  if(forbiddenPhraseCount>0)reasons.push("금지 또는 과장 표현이 포함되어 있습니다.");
  let similarPairs=0; for(let i=0;i<titles.length;i++)for(let j=i+1;j<titles.length;j++)if(titleSimilarity(titles[i],titles[j])>=0.9)similarPairs++;
  if(similarPairs>0)reasons.push("제목 구조가 반복됩니다.");
  let score=100-scorePenalty(uniqueTitleCount,body.length,similarPairs,repeatedPhraseCount,forbiddenPhraseCount);
  if(reasons.length)score=Math.min(89,score);
  score=Math.max(0,Math.round(score));
  return {ok:reasons.length===0&&score>=90,score,reasons,metrics:{bodyLength:body.length,titleCount:titles.length,uniqueTitleCount,repeatedPhraseCount,forbiddenPhraseCount}};
}
function scorePenalty(unique:number,length:number,similar:number,repeated:number,forbidden:number){return Math.max(0,5-unique)*8+Math.min(20,Math.max(0,900-length)/18)+Math.min(20,similar*7)+Math.min(20,repeated*10)+Math.min(30,forbidden*10);}
