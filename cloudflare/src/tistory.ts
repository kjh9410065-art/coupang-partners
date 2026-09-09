/**
 * 티스토리용 콘텐츠 생성 모듈입니다.
 *
 * 네이버용 글과 같은 상품 정보를 사용하지만 문체와 구성은 별도로 만듭니다.
 * 현재 단계에서는 티스토리 API에 자동 발행하지 않고 KV에 저장할 수 있는
 * 콘텐츠 객체만 생성합니다. 실제 발행 API 연결은 자격 증명 설정 후 별도 단계에서 붙입니다.
 */

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
const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
];

const TISTORY_DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.";

/** Gemini 응답의 JSON 코드블록을 제거합니다. */
function cleanJson(value: string) {
  return value.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
}

/** 티스토리용 Gemini 콘텐츠를 생성합니다. */
async function generateGemini(env: TistoryEnv, prompt: string, maxOutputTokens = 7000): Promise<string> {
  let lastError = "Gemini 호출 실패";

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(`${GEMINI_HOST}/${model}:generateContent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens,
              thinkingConfig: { thinkingLevel: "low" },
              responseMimeType: "application/json",
            },
          }),
        });

        const text = await response.text();
        if (response.status === 503) {
          lastError = `Gemini ${model} 503`;
          continue;
        }
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

/**
 * 네이버 글과 겹치지 않도록 티스토리 특유의 정보형 구조로 생성합니다.
 * 상품명과 API에서 확인된 정보만 사실로 취급합니다.
 */
export async function generateTistoryContent(
  env: TistoryEnv,
  product: TistoryProduct,
  keyword: string,
  usedTitles: string[] = [],
) {
  const prompt = `너는 한국 티스토리 블로그의 정보형 콘텐츠 전문 편집자다.

[검색 주제]
${keyword}

[확인된 상품 정보]
상품명: ${product.productName}
현재 검색 결과 가격: ${product.productPrice ?? "확인 불가"}원
검색 결과 순위: ${product.rank ?? "확인 불가"}
로켓배송: ${product.isRocket ? "예" : "아니오"}
무료배송: ${product.isFreeShipping ? "예" : "아니오"}

[작성 방향]
- 네이버용 광고형 글과 다른 느낌의 차분한 정보형 글로 작성한다.
- 검색한 사람이 상품을 이해하고 비교할 수 있도록 구성한다.
- 상품명으로 확인할 수 없는 기능, 소재, 크기, 성능, 구성품, 배터리, 판매량, 평점, 리뷰를 절대 만들어내지 않는다.
- 직접 사용한 것처럼 쓰지 않는다.
- 가격은 검색 시점의 참고 정보일 뿐이므로 고정 가격이나 최저가로 단정하지 않는다.
- 할인, 최저가, 과장된 가성비 표현을 만들지 않는다.
- 구매 전에 확인하면 좋은 사항을 상품명에서 합리적으로 확인 가능한 범위 안에서 안내한다.
- 특정 구매를 강요하지 않는다.
- 문장과 소제목을 네이버용 글과 다르게 구성한다.
- 과거 제목과 표현이 겹치지 않게 한다.
- 약 1,600~2,200자 정도의 충분한 정보량을 유지한다.

[과거 제목]
${JSON.stringify(usedTitles.slice(-60))}

JSON만 반환:
{
  "titles":["제목1","제목2","제목3","제목4","제목5"],
  "selectedTitle":"대표 제목",
  "body":"티스토리 본문 전체"
}`;

  const parsed = JSON.parse(cleanJson(await generateGemini(env, prompt)));
  if (!Array.isArray(parsed.titles) || parsed.titles.length !== 5 || !parsed.selectedTitle || !parsed.body) {
    throw new Error("티스토리 콘텐츠 결과 형식이 올바르지 않습니다.");
  }

  return {
    platform: "tistory",
    disclosure: TISTORY_DISCLOSURE,
    titles: parsed.titles,
    selectedTitle: parsed.selectedTitle,
    body: parsed.body,
    productUrl: product.productUrl ?? "",
    productImage: product.productImage ?? "",
  };
}
