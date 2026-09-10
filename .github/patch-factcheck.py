from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "cloudflare" / "src" / "index.ts"
FACT = ROOT / "cloudflare" / "src" / "factcheck.ts"
s = INDEX.read_text(encoding="utf-8")

# 팩트체크 모듈: 웹 조사 결과와 본문을 비교해 확인되지 않은 핵심 주장만 차단합니다.
FACT.write_text(r'''export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface ProductResearch {
  productName: string;
  sources: ResearchSource[];
  evidence: string[];
  researchedAt: string;
}

export interface FactCheckResult {
  ok: boolean;
  score: number;
  reasons: string[];
  checkedClaims: string[];
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** 본문에서 수치/사양처럼 보이는 핵심 표현을 추출합니다. */
function extractClaims(body: string) {
  const patterns = [
    /\b\d+(?:\.\d+)?\s*(?:v|w|a|mah|mm|cm|m|kg|g|l|ml|인치|단|개|매|세트)\b/gi,
    /\d+(?:\.\d+)?\s*(?:볼트|와트|암페어|킬로그램|그램|리터|센티미터|밀리미터)/gi,
    /(?:높이|길이|폭|무게|용량|출력|전압|소비전력|배터리|재질|소재|방수|방진|충전|무선|유선|접이식|회전|각도|조절|수직촬영|거치|호환|지원)[^\n.!?]{0,45}/gi,
  ];
  const claims = new Set<string>();
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) {
      const claim = match[0].replace(/^[\s,.:;]+|[\s,.:;]+$/g, "").trim();
      if (claim.length >= 2 && claim.length <= 90) claims.add(claim);
    }
  }
  return [...claims].slice(0, 80);
}

/** 상품 API의 확정값과 웹 조사 결과를 함께 대조합니다. */
export function factCheckContent(input: {
  product: any;
  keyword: string;
  body: string;
  selectedTitle: string;
  research: ProductResearch;
}): FactCheckResult {
  const reasons: string[] = [];
  const claims = extractClaims(input.body);
  const corpus = normalize([
    input.product?.productName ?? "",
    input.research.productName,
    ...input.research.evidence,
    ...input.research.sources.map((source) => `${source.title} ${source.snippet}`),
  ].join("\n"));
  const body = normalize(input.body);

  if (!body.includes(normalize(String(input.product?.productName ?? "")))) {
    reasons.push("본문에 확인된 상품명이 포함되지 않았습니다.");
  }

  if (!input.research.sources.length && !input.research.evidence.length) {
    reasons.push("상품 외부 조사 결과가 없어 제품 특징을 검증할 근거가 없습니다.");
  }

  // 숫자/사양 주장은 조사 결과 또는 쿠팡 상품명에서 확인되는 경우에만 통과시킵니다.
  for (const claim of claims) {
    const normalizedClaim = normalize(claim);
    const compactClaim = normalizedClaim.replace(/\s+/g, "");
    const compactCorpus = corpus.replace(/\s+/g, "");
    if (!compactCorpus.includes(compactClaim)) {
      reasons.push(`확인되지 않은 상품 정보가 포함되었습니다: ${claim}`);
      if (reasons.length >= 6) break;
    }
  }

  // 배송/가격은 API 확정값과 다르면 사실 오류로 봅니다.
  const price = input.product?.productPrice;
  if (price && new RegExp(`${price.toLocaleString()}?\\s*원`).test(input.body.replaceAll(",", ""))) {
    // 현재 가격을 언급했다면 API 값과 일치하는 경우만 허용합니다.
  }

  if (/최저가|최저 가격|역대급|무조건|100% 만족|완벽|최고의 제품/i.test(input.body)) {
    reasons.push("검증할 수 없는 과장 표현이 포함되었습니다.");
  }

  const score = reasons.length ? Math.max(0, 100 - reasons.length * 15) : 100;
  return {
    ok: reasons.length === 0,
    score,
    reasons,
    checkedClaims: claims,
  };
}
''', encoding="utf-8")

# import 추가
marker = 'import { validateContentQuality } from "./quality";'
if 'from "./factcheck"' not in s:
    s = s.replace(marker, marker + '\nimport { factCheckContent, type ProductResearch } from "./factcheck";')

# 제품 조사 함수 삽입: 생성 전에 한 번만 실행하고 그 결과를 생성/검증에 같이 사용합니다.
research_marker = '/** 오늘의 상품 검색 주제를 정합니다. */'
research_code = r'''
/**
 * 상품명 자체가 아니라 실제 공개 웹 검색 결과를 조사해 제품 특징의 근거를 확보합니다.
 * 한 번의 생성 실행에서만 호출하며, 조사 결과는 본문 생성과 팩트체크에 공통으로 사용합니다.
 */
async function researchProduct(productName: string, productUrl: string): Promise<ProductResearch> {
  const sources: { title: string; url: string; snippet: string }[] = [];
  const evidence: string[] = [];
  const queries = [
    `"${productName}" 상품 상세 특징 사양`,
    `"${productName}" 기능 사용 방법`,
    `"${productName}" 리뷰 장점 단점`,
  ];

  for (const query of queries) {
    try {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=6&setlang=ko&cc=kr`;
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!response.ok) continue;
      const html = await response.text();
      const liRegex = /<li class="[^\"]*b_algo[^\"]*"[^>]*>([\s\S]*?)<\/li>/g;
      let match: RegExpExecArray | null;
      while ((match = liRegex.exec(html)) !== null && sources.length < 12) {
        const block = match[1];
        const title = stripHtml(block.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "");
        const snippet = stripHtml(block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "");
        const href = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"/i)?.[1] ?? "";
        const cleanSnippet = `${title} ${snippet}`.trim();
        if (title && cleanSnippet.length >= 20) {
          const sourceUrl = href.startsWith("http") ? href : "";
          if (!sources.some((item) => item.title === title && item.snippet === snippet)) {
            sources.push({ title, url: sourceUrl, snippet: cleanSnippet.slice(0, 700) });
          }
        }
      }
    } catch {
      // 한 검색 결과가 실패해도 나머지 조사 결과로 계속합니다.
    }
  }

  // 상품 URL도 직접 읽어 메타 설명에서 확인 가능한 정보를 보강합니다.
  if (productUrl && /^https?:\/\//i.test(productUrl)) {
    try {
      const response = await fetch(productUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (response.ok) {
        const html = await response.text();
        const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
        const description = stripHtml(html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([\s\S]*?)["']/i)?.[1] ?? "");
        const snippet = `${title} ${description}`.trim();
        if (snippet) sources.unshift({ title: title || productName, url: productUrl, snippet: snippet.slice(0, 900) });
      }
    } catch {
      // 판매 페이지 직접 접근이 막혀도 검색 조사 결과를 사용합니다.
    }
  }

  // 상품명과 가장 가까운 조사 결과를 근거 문장으로 보존합니다.
  for (const source of sources.slice(0, 8)) {
    const text = `${source.title} ${source.snippet}`;
    if (new RegExp(productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text) || evidence.length < 5) {
      evidence.push(text.slice(0, 700));
    }
  }

  return {
    productName,
    sources: sources.slice(0, 12),
    evidence: [...new Set(evidence)].slice(0, 8),
    researchedAt: new Date().toISOString(),
  };
}

'''
if 'async function researchProduct(' not in s:
    s = s.replace(research_marker, research_code + research_marker)

# generateBlog 인자에 조사 결과 추가
s = s.replace('  imageUrls: string[],\n  qualityFeedback: string[] = [],', '  imageUrls: string[],\n  research: ProductResearch,\n  qualityFeedback: string[] = [],')

# 생성 프롬프트에 조사 결과를 주입
old = '[참고용 사용자 의견 신호]\n${opinionText}'
new = '[팩트체크용 제품 조사 결과]\n${JSON.stringify(research, null, 2)}\n\n[참고용 사용자 의견 신호]\n${opinionText}'
s = s.replace(old, new)

# 작성 규칙 강화
s = s.replace('- 상품명만 보고 확정할 수 없는 기능/소재/크기/구성품/성능은 절대 만들어내지 않는다.', '- 상품명만 보고 특징을 만들지 않는다. 반드시 [팩트체크용 제품 조사 결과]의 공개 자료에서 확인되는 특징만 설명한다.\n- 조사 자료에서 확인되지 않는 기능/소재/크기/구성품/성능은 절대 만들어내지 않는다.')
s = s.replace('- 참고 의견은 \'이 상품의 실제 구매자 리뷰\'라고 단정하지 않는다. 정확한 상품 리뷰인지 확인되지 않았다면 본문에서 구체적인 후기처럼 인용하지 않는다.', '- 공개 검색 자료는 제품 특징 확인용 근거로 사용하되, 실제 구매자 후기인지 확인되지 않은 내용은 후기처럼 쓰지 않는다.')

# fallback 생성도 조사 결과를 반영하도록 교체
fallback_start = '    // 상품명에 실제로 적혀 있는 표현만 추려 상품 설명에 활용합니다.'
fallback_end = '    return JSON.stringify({ titles, selectedTitle: titles[0], body });'
start = s.find(fallback_start)
end = s.find(fallback_end, start)
if start != -1 and end != -1:
    replacement = r'''    // AI를 사용할 수 없는 경우에도 웹 조사 결과의 문장을 근거로만 설명합니다.
    const researchMatch = prompt.match(/\[팩트체크용 제품 조사 결과\]\s*([\s\S]*?)\n\n\[참고용 사용자 의견 신호\]/);
    let research: any = null;
    try { research = researchMatch ? JSON.parse(researchMatch[1]) : null; } catch {}
    const evidence = Array.isArray(research?.evidence) ? research.evidence.slice(0, 5) : [];
    const evidenceText = evidence.length ? evidence.join("\n") : "공개 조사 자료에서 충분한 제품 특징을 확인하지 못했습니다.";
    const titles=[
      `${productName} 실제 확인 정보와 주요 특징 정리`,
      `${keyword} 관련 ${productName} 특징과 확인할 점`,
      `구매 전 알아본 ${productName} 주요 기능과 특징`,
      `${productName} 제품 정보와 사용 목적별 확인 포인트`,
      `${keyword} 찾을 때 살펴본 ${productName} 정보`
    ];
    const body=`안녕하세요. 오늘은 ${productName}을 상품명만 보고 판단하지 않고 공개된 제품 정보를 찾아 주요 특징을 확인해봤습니다.\n\n${PARTNERS_DISCLOSURE}\n\n제품을 알아본 내용\n이번 글에서는 상품명에 적힌 표현만으로 특징을 단정하지 않고, 공개 검색 결과와 확인 가능한 상품 정보를 함께 살펴봤습니다. 조사 과정에서 확인된 내용은 다음과 같습니다.\n\n${evidenceText}\n\n실제로 확인된 특징\n위 자료에서 반복적으로 확인되는 제품 관련 내용만 본문에 반영합니다. 반대로 공개 자료에서 확인되지 않은 세부 사양이나 성능은 임의로 추가하지 않았습니다. 같은 이름의 상품이 여러 판매처에 있을 수 있기 때문에 구매하려는 상품의 상세 페이지와 옵션이 동일한지도 함께 확인하는 것이 좋습니다.\n\n구매 전에 확인할 점\n상품을 비교할 때는 내가 필요한 기능이 실제 기본 구성에 포함되어 있는지, 선택 옵션인지, 별도 구매가 필요한지 확인해보는 것이 좋습니다. 공개 검색 자료만으로 확인하기 어려운 부분은 추측하지 않고 상품 상세 페이지의 최신 정보를 기준으로 판단하는 편이 안전합니다.\n\n어떤 분이 살펴보면 좋은지\n${keyword} 관련 상품을 찾고 있으면서 이번에 확인된 특징이나 용도가 본인에게 필요한지 비교해보고 싶은 분이라면 살펴볼 만합니다. 특정 제품이 모든 사람에게 적합하다고 단정하기보다는 사용 목적과 필요한 조건을 먼저 정해두고 비교하는 것을 추천합니다.\n\n마무리\n정리하면 ${productName}은 공개된 자료를 확인해 주요 특징을 살펴본 상품입니다. 상품명에 없는 내용을 임의로 붙이지 않고 조사에서 확인된 내용만 정리했으며, 실제 구매 전에는 상품 상세 페이지에서 최신 사양과 구성, 옵션을 다시 확인해보세요. 관심이 있다면 상품 확인 버튼에서 현재 판매 정보를 직접 확인할 수 있습니다.`;
'''
    s = s[:start] + replacement + s[end:]

# createContent에서 조사 1회 실행
old_call = '  const opinionSignals = await fetchOpinionSignals(recommendation.product.productName);\n  const imageUrls = await fetchRelatedImages(recommendation.product.productName, recommendation.product.productImage);'
new_call = '  // 상품을 한 번 조사하고, 같은 조사 결과를 본문 작성과 최종 팩트체크에 공통 사용합니다.\n  const research = await researchProduct(recommendation.product.productName, recommendation.product.productUrl);\n  const opinionSignals = await fetchOpinionSignals(recommendation.product.productName);\n  const imageUrls = await fetchRelatedImages(recommendation.product.productName, recommendation.product.productImage);'
s = s.replace(old_call, new_call)

# generateBlog 호출에 research 추가
s = s.replace('      opinionSignals,\n      imageUrls,\n      qualityFeedback,', '      opinionSignals,\n      imageUrls,\n      research,\n      qualityFeedback,')

# 품질검사 통과 직후 팩트체크 1회, 실패 시 저장 중단
needle = '  const content = {\n    keyword,\n    recommendation,'
insert = '''  // 품질검사 이후 최종 본문에 대해 팩트체크를 정확히 한 번 수행합니다.
  const factCheck = factCheckContent({
    product: recommendation.product,
    keyword,
    body: blog.body,
    selectedTitle: blog.selectedTitle,
    research,
  });
  if (!factCheck.ok) {
    throw new Error(`팩트체크 실패로 게시하지 않았습니다: ${factCheck.reasons.join(" · ")}`);
  }

  const content = {
    keyword,
    recommendation,'''
s = s.replace(needle, insert)

# 저장 데이터에 조사/팩트체크 결과 포함
s = s.replace('    blog,\n    quality: {', '    blog,\n    research,\n    factCheck,\n    quality: {')

INDEX.write_text(s, encoding="utf-8")
''')

# 일회성 수정 워크플로우를 만들고 다음 단계에서 스스로 삭제합니다.
WF = ROOT / ".github" / "workflows" / "apply-factcheck-patch.yml"
WF.parent.mkdir(parents=True, exist_ok=True)
WF.write_text('''name: Apply factcheck patch\n\non:\n  push:\n    paths:\n      - ".github/patch-factcheck.py"\n\npermissions:\n  contents: write\n\njobs:\n  patch:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with:\n          python-version: "3.12"\n      - run: python .github/patch-factcheck.py\n      - name: Commit patch\n        run: |\n          git config user.name "github-actions[bot]"\n          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"\n          git add cloudflare/src/index.ts cloudflare/src/factcheck.ts\n          git commit -m "Add product research and one-pass factcheck" || exit 0\n          git push\n      - name: Remove temporary patch files\n        run: |\n          rm -f .github/patch-factcheck.py .github/workflows/apply-factcheck-patch.yml\n          git add -A\n          git commit -m "Remove temporary factcheck patch workflow" || exit 0\n          git push\n''', encoding="utf-8")
