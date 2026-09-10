from pathlib import Path

root = Path('cloudflare/src')
index = root / 'index.ts'
s = index.read_text(encoding='utf-8')

# 검색 결과가 상품과 무관하면 조사 근거로 채택하지 않도록 상품명 핵심 토큰으로 필터링합니다.
old = '''      while ((match = liRegex.exec(html)) !== null && sources.length < 12) {\n        const block = match[1];'''
new = '''      while ((match = liRegex.exec(html)) !== null && sources.length < 12) {\n        const block = match[1];'''
# Keep loop itself unchanged; filtering is inserted at the source acceptance point.
needle = '''        if (title && cleanSnippet.length >= 20) {\n          const sourceUrl = href.startsWith("http") ? href : "";\n          if (!sources.some((item) => item.title === title && item.snippet === snippet)) {\n            sources.push({ title, url: sourceUrl, snippet: cleanSnippet.slice(0, 700) });\n          }\n        }'''
replacement = '''        if (title && cleanSnippet.length >= 20) {\n          const sourceUrl = href.startsWith("http") ? href : "";\n          // 상품명과 무관한 검색 결과(예: Microsoft 도움말)는 근거에서 완전히 제외합니다.\n          const productTokens = productName.toLowerCase().split(/\\s+/).filter((token) => token.length >= 2);\n          const searchable = cleanSnippet.toLowerCase();\n          const relevant = productTokens.length === 0 || productTokens.some((token) => searchable.includes(token));\n          if (relevant && !sources.some((item) => item.title === title && item.snippet === snippet)) {\n            sources.push({ title, url: sourceUrl, snippet: cleanSnippet.slice(0, 700) });\n          }\n        }'''
if needle not in s:
    raise SystemExit('Bing source acceptance block not found')
s = s.replace(needle, replacement, 1)

needle = '''              if (title && snippet.length >= 20) {\n                sources.push({ title, url: href.startsWith("http") ? href : "", snippet: snippet.slice(0, 700) });\n              }'''
replacement = '''              if (title && snippet.length >= 20) {\n                const productTokens = productName.toLowerCase().split(/\\s+/).filter((token) => token.length >= 2);\n                const searchable = snippet.toLowerCase();\n                const relevant = productTokens.length === 0 || productTokens.some((token) => searchable.includes(token));\n                if (relevant) {\n                  sources.push({ title, url: href.startsWith("http") ? href : "", snippet: snippet.slice(0, 700) });\n                }\n              }'''
if needle not in s:
    raise SystemExit('RSS source acceptance block not found')
s = s.replace(needle, replacement, 1)

# evidence도 상품명과 무관한 자료를 절대 넣지 않습니다.
old = '''  // 상품명과 가장 가까운 조사 결과를 근거 문장으로 보존합니다.\n  for (const source of sources.slice(0, 8)) {\n    const text = `${source.title} ${source.snippet}`;\n    if (new RegExp(productName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"), "i").test(text) || evidence.length < 5) {\n      evidence.push(text.slice(0, 700));\n    }\n  }'''
new = '''  // 상품명 핵심 토큰이 실제로 포함된 자료만 본문 생성용 근거로 보존합니다.\n  const productTokens = productName.toLowerCase().split(/\\s+/).filter((token) => token.length >= 2);\n  for (const source of sources.slice(0, 8)) {\n    const text = `${source.title} ${source.snippet}`;\n    const searchable = text.toLowerCase();\n    const relevant = productTokens.length === 0 || productTokens.some((token) => searchable.includes(token));\n    if (relevant) evidence.push(text.slice(0, 700));\n  }'''
if old not in s:
    raise SystemExit('evidence block not found')
s = s.replace(old, new, 1)

# 이미지 검색도 상품명과 무관한 이미지(예: Microsoft)를 절대 삽입하지 않습니다.
needle = '''      const matches = [...html.matchAll(/"murl":"(.*?)"/g)];\n      for (const match of matches) {'''
replacement = '''      const matches = [...html.matchAll(/"murl":"(.*?)"/g)];\n      for (const match of matches) {'''
if needle not in s:
    raise SystemExit('image match block not found')

needle = '''        const candidate = decodeBingUrl(match[1]);\n        if (!candidate || !/^https?:\\/\\//i.test(candidate)) continue;\n        if (images.some((item) => item === candidate)) continue;\n        if (/logo|icon|sprite|avatar|favicon/i.test(candidate)) continue;\n\n        // 실제 이미지 응답인지 간단히 확인합니다. 실패하면 후보에서 제외합니다.\n        if (await isImageUrl(candidate)) images.push(candidate);'''
replacement = '''        const candidate = decodeBingUrl(match[1]);\n        if (!candidate || !/^https?:\\/\\//i.test(candidate)) continue;\n        if (images.some((item) => item === candidate)) continue;\n        if (/logo|icon|sprite|avatar|favicon|microsoft|windows/i.test(candidate)) continue;\n\n        // 이미지 URL만으로 관련성을 판단할 수 없는 경우가 많으므로,\n        // 해당 이미지가 포함된 Bing 결과 주변 텍스트에서 상품명 토큰을 확인합니다.\n        const matchIndex = html.indexOf(match[0]);\n        const context = html.slice(Math.max(0, matchIndex - 1200), Math.min(html.length, matchIndex + 1200)).toLowerCase();\n        const productTokens = productName.toLowerCase().split(/\\s+/).filter((token) => token.length >= 2);\n        const relevant = productTokens.length === 0 || productTokens.some((token) => context.includes(token));\n        if (!relevant) continue;\n\n        // 실제 이미지 응답인지 간단히 확인합니다. 실패하면 후보에서 제외합니다.\n        if (await isImageUrl(candidate)) images.push(candidate);'''
if needle not in s:
    raise SystemExit('image candidate block not found')
s = s.replace(needle, replacement, 1)

# fallback 본문에서 검색결과 원문을 그대로 노출하지 않습니다.
old = '''    const evidence = Array.isArray(research?.evidence) ? research.evidence.slice(0, 5) : [];\n    const evidenceText = evidence.length ? evidence.join("\\n") : "공개 조사 자료에서 충분한 제품 특징을 확인하지 못했습니다.";'''
new = '''    const evidence = Array.isArray(research?.evidence) ? research.evidence.slice(0, 5) : [];\n    // 검색엔진의 제목/스니펫 원문은 본문에 그대로 넣지 않고,\n    // 확인 자료가 있다는 사실만 자연스럽게 반영합니다.\n    const evidenceText = evidence.length\n      ? `공개 자료 ${evidence.length}건을 대조해 상품명과 일치하는 정보를 우선 확인했습니다. 검색 결과의 제목이나 스니펫을 그대로 옮기지 않고, 서로 맞지 않는 자료는 제외했습니다.`\n      : "공개 조사 자료에서 상품과 직접 일치하는 제품 특징을 충분히 확인하지 못했습니다.";'''
if old not in s:
    raise SystemExit('fallback evidence block not found')
s = s.replace(old, new, 1)

index.write_text(s, encoding='utf-8')
print('content pollution fix complete')
