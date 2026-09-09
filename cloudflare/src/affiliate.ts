/**
 * 쿠팡 파트너스 Deeplink API를 이용해 상품 URL을 짧은 제휴 링크로 변환합니다.
 * API 키는 Cloudflare Workers Secrets에서만 읽으며 코드에 저장하지 않습니다.
 */

export interface AffiliateEnv {
  COUPANG_ACCESS_KEY: string;
  COUPANG_SECRET_KEY: string;
}

const COUPANG_HOST = "https://api-gateway.coupang.com";
const DEEPLINK_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";

/** 쿠팡 API HMAC-SHA256 인증 헤더를 생성합니다. */
async function createAuthorization(env: AffiliateEnv, method: string, path: string) {
  const signedDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
  const message = signedDate + method.toUpperCase() + path;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.COUPANG_SECRET_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const signature = Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `CEA algorithm=HmacSHA256, access-key=${env.COUPANG_ACCESS_KEY}, signed-date=${signedDate}, signature=${signature}`;
}

/**
 * 상품 ID를 기준으로 일반 쿠팡 상품 URL을 만들고 단축 제휴 링크를 발급합니다.
 * SubID는 어느 자동 콘텐츠에서 생성된 링크인지 추적할 수 있도록 사용합니다.
 */
export async function createShortAffiliateLink(
  env: AffiliateEnv,
  productId: string | number,
  subId?: string,
): Promise<string> {
  const id = String(productId).trim();
  if (!/^\d+$/.test(id)) throw new Error("유효하지 않은 쿠팡 상품 ID입니다.");

  const coupangUrl = `https://www.coupang.com/vp/products/${id}`;
  const body: Record<string, unknown> = { coupangUrls: [coupangUrl] };
  if (subId?.trim()) body.subId = subId.trim().slice(0, 50);

  const response = await fetch(`${COUPANG_HOST}${DEEPLINK_PATH}`, {
    method: "POST",
    headers: {
      Authorization: await createAuthorization(env, "POST", DEEPLINK_PATH),
      "Content-Type": "application/json;charset=UTF-8",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`쿠팡 Deeplink API 오류 (${response.status}): ${text.slice(0, 300)}`);

  const data = JSON.parse(text);
  const item = Array.isArray(data?.data) ? data.data[0] : null;
  const shortenUrl = typeof item?.shortenUrl === "string" ? item.shortenUrl.trim() : "";
  if (data?.rCode !== "0" || !shortenUrl) {
    throw new Error(`쿠팡 Deeplink 변환 실패: ${data?.rMessage || "단축 링크가 반환되지 않았습니다."}`);
  }

  return shortenUrl;
}
