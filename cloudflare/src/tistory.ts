/**
 * 티스토리용 콘텐츠 생성 모듈입니다.
 * 네이버와 같은 상품을 사용하지만 문체와 구성은 별도로 생성합니다.
 */

import { validateContentQuality } from "./quality";

export interface TistoryProduct {
  productId: string | number;
  productName: string;
  productPrice?: number | null;
  productImage?: string;
  productUrl?: string;
  rank?: number | null;
  isRocket?: boolean;
  isFreeShipping?: boolean;
}

export interface TistoryEnv {
  GEMINI_API_KEY: string;
}

const GEMINI_HOST = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash"];
const TISTORY_DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

/** Gemini JSON 응답의 코드블록을 제거합니다. */
function cleanJson(value: string) {
  return value.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
}

/** Gemini를 여러 모델/시도로 호출합니다. */
async function generateGemini(env: TistoryEnv, prompt: string, maxOutputTokens = 7000): Promise<string> {
  let lastError = "Gemini 호출 실패";
  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`${GEMINI_HOST}/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens, thinkingConfig: { thinkingLevel: "low" }, responseMimeType: "application/json" },
          }),
        });
        const text = await response.text();
        if (response.status === 503) { lastError = `Gemini ${model} 503`; continue; }
        if (!response.ok) throw new Error(`Gemini API 오류 (${response.status}): ${text.slice(0, 500)}`);
        const data = JSON.parse(text);
        const output = data?.candidates?.[0]?.content?.parts?.map((part: any) => part?.text ?? "").join("").trim();
        if (!output) throw new Error(`Gemini ${model} 응답에 텍스트가 없습니다.`);
        return output;
      } catch (error) {
        if (error instanceof Error) lastError = error.message;
        if (attempt >= 3) break;
      }
    }
  }
  throw new Error(lastError);
}

/** 티스토리용 콘텐츠를 생성하고 최소 품질 검사를 통과한 결과만 반환합니다. */
export async function generateTistoryContent(env: TistoryEnv, product: TistoryProduct, keyword: string, usedTitles: string[] = []) {
  for (let generationAttempt = 1; generationAttempt <= 2; generationAttempt++) {
    const prompt = `너는 한국 티스토리 블로그의 정보형 콘텐츠 전문 편집자다.

검색 주제: ${keyword}
상품명: ${product.productName}
현재 검색 결과 가격: ${product.productPrice ?? "확인 불가"}원
검색 결과 순위: ${product.rank ?? "확인 불가"}
로켓배송: ${product.isRocket ? "예" : "아니오"}
무료배송: ${product.isFreeShipping ? "예" : "아니오"}

작성 규칙:
- 네이버용 글과 다른 차분한 정보형 구성으로 작성한다.
- 상품명과 위 API 확인 정보만 사실로 사용한다.
- 확인되지 않은 기능, 소재, 크기, 성능, 구성품, 배터리, 판매량, 평점, 리뷰를 만들지 않는다.
- 직접 사용한 것처럼 쓰지 않는다.
- 가격/할인/최저가를 과장하지 않는다.
- 제목 5개는 서로 다른 방향으로 작성한다.
- 약 1,600~2,200자의 정보량을 유지한다.
- 과거 제목과 문장 구조가 겹치지 않게 한다.
${generationAttempt > 1 ? "이전 결과가 품질 기준을 통과하지 못했다. 표현과 제목 구조를 크게 바꿔 다시 작성한다." : ""}

과거 제목:
${JSON.stringify(usedTitles.slice(-60))}

JSON만 반환:
{"titles":["제목1","제목2","제목3","제목4","제목5"],"selectedTitle":"대표 제목","body":"티스토리 본문 전체"}`;

    const parsed = JSON.parse(cleanJson(await generateGemini(env, prompt)));
    if (!Array.isArray(parsed.titles) || parsed.titles.length !== 5 || !parsed.selectedTitle || !parsed.body) {
      throw new Error("티스토리 콘텐츠 결과 형식이 올바르지 않습니다.");
    }

    const quality = validateContentQuality({ keyword, productName: product.productName, titles: parsed.titles, selectedTitle: parsed.selectedTitle, body: parsed.body });
    if (quality.ok) {
      return {
        platform: "tistory",
        disclosure: TISTORY_DISCLOSURE,
        titles: parsed.titles,
        selectedTitle: parsed.selectedTitle,
        body: parsed.body,
        productUrl: product.productUrl ?? "",
        productImage: product.productImage ?? "",
        quality,
      };
    }

    if (generationAttempt === 2) {
      throw new Error(`티스토리 콘텐츠 품질 검사 실패: ${quality.reasons.join(" / ")}`);
    }
  }

  throw new Error("티스토리 콘텐츠 생성에 실패했습니다.");
}
