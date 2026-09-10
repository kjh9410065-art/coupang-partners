from pathlib import Path

root = Path('cloudflare/src')

# 1) factcheck.ts: 문장 전체를 '상품 사양'으로 잡는 오탐을 제거합니다.
fact = root / 'factcheck.ts'
s = fact.read_text(encoding='utf-8')
old = '''    /(?:높이|길이|폭|무게|용량|출력|전압|소비전력|배터리|재질|소재|방수|방진|충전|무선|유선|접이식|회전|각도|조절|수직촬영|거치|호환|지원)[^\\n.!?]{0,45}/gi,\n'''
new = '''    // 기능 키워드 자체만 검사합니다. 뒤의 일반 문장까지 붙잡으면\n    // "무선청소기 관련 상품을 찾고 있다" 같은 정상 문장을 오탐할 수 있습니다.\n    /(?:높이|길이|폭|무게|용량|출력|전압|소비전력|배터리|재질|소재|방수|방진|충전|무선|유선|접이식|회전|각도|조절|수직촬영|거치|호환|지원)/gi,\n'''
if old not in s:
    raise SystemExit('factcheck extract pattern not found')
s = s.replace(old, new, 1)
# 2) 가격 정규식: 20790원처럼 쉼표 없는 4자리 이상 가격도 인식합니다.
old = '''  const priceMentions = input.body.match(/\\d{1,3}(?:,\\d{3})*\\s*원/g) ?? [];\n'''
new = '''  const priceMentions = input.body.match(/\\d+(?:,\\d{3})*\\s*원/g) ?? [];\n'''
if old not in s:
    raise SystemExit('factcheck price regex not found')
s = s.replace(old, new, 1)
fact.write_text(s, encoding='utf-8')

# 3) index.ts: Bing 일반 HTML이 막혀도 RSS 결과를 이용해 조사 근거를 확보합니다.
index = root / 'index.ts'
s = index.read_text(encoding='utf-8')
old = '''      if (!response.ok) continue;\n      const html = await response.text();\n      const liRegex = /<li class="[^\\"]*b_algo[^\\"]*"[^>]*>([\\s\\S]*?)<\\/li>/g;\n'''
new = '''      if (!response.ok) continue;\n      const html = await response.text();\n      const liRegex = /<li class="[^\\"]*b_algo[^\\"]*"[^>]*>([\\s\\S]*?)<\\/li>/g;\n'''
if old not in s:
    raise SystemExit('index Bing block not found')
# 아래 fallback은 기존 while 직후에 삽입합니다.
needle = '''      while ((match = liRegex.exec(html)) !== null && sources.length < 12) {\n        const block = match[1];\n        const title = stripHtml(block.match(/<h2[^>]*>\\s*<a[^>]*>([\\s\\S]*?)<\\/a>/i)?.[1] ?? "");\n        const snippet = stripHtml(block.match(/<p[^>]*>([\\s\\S]*?)<\\/p>/i)?.[1] ?? "");\n        const href = block.match(/<h2[^>]*>\\s*<a[^>]*href="([^"]+)"/i)?.[1] ?? "";\n        const cleanSnippet = `${title} ${snippet}`.trim();\n        if (title && cleanSnippet.length >= 20) {\n          const sourceUrl = href.startsWith("http") ? href : "";\n          if (!sources.some((item) => item.title === title && item.snippet === snippet)) {\n            sources.push({ title, url: sourceUrl, snippet: cleanSnippet.slice(0, 700) });\n          }\n        }\n      }\n'''
insert = needle + '''\n      // 일반 검색 HTML이 비어 있거나 구조가 바뀐 경우 Bing RSS로 한 번 더 확보합니다.\n      if (!sources.length) {\n        try {\n          const rssUrl = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;\n          const rssResponse = await fetch(rssUrl, { headers: { "User-Agent": "Mozilla/5.0" } });\n          if (rssResponse.ok) {\n            const rss = await rssResponse.text();\n            for (const item of rss.matchAll(/<item>([\\s\\S]*?)<\\/item>/gi)) {\n              if (sources.length >= 12) break;\n              const block = item[1];\n              const title = stripHtml(block.match(/<title>([\\s\\S]*?)<\\/title>/i)?.[1] ?? "");\n              const href = stripHtml(block.match(/<link>([\\s\\S]*?)<\\/link>/i)?.[1] ?? "");\n              const description = stripHtml(block.match(/<description>([\\s\\S]*?)<\\/description>/i)?.[1] ?? "");\n              const snippet = `${title} ${description}`.trim();\n              if (title && snippet.length >= 20) {\n                sources.push({ title, url: href.startsWith("http") ? href : "", snippet: snippet.slice(0, 700) });\n              }\n            }\n          }\n        } catch {\n          // RSS도 실패하면 상품 API 확정값을 이용한 최소 팩트체크로 넘어갑니다.\n        }\n      }\n'''
if needle not in s:
    raise SystemExit('index research insertion point not found')
s = s.replace(needle, insert, 1)
index.write_text(s, encoding='utf-8')

print('false-positive factcheck patch complete')
