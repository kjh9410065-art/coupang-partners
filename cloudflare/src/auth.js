// 모든 업무 API는 서버 간 Bearer 인증이 필요합니다.
// API 토큰은 Cloudflare Secret에만 보관하고, 응답이나 로그에 남기지 않습니다.
export function tokenConfigured(env) {
  return typeof env?.BLOG_API_TOKEN === "string" && env.BLOG_API_TOKEN.length >= 24;
}

export function authorized(request, env) {
  if (!tokenConfigured(env)) return false;
  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || provided.length > 512) return false;
  const encoder = new TextEncoder();
  const actual = encoder.encode(provided);
  const expected = encoder.encode(env.BLOG_API_TOKEN);
  let difference = actual.length ^ expected.length;
  const count = Math.max(actual.length, expected.length);
  for (let i = 0; i < count; i++) difference |= (actual[i] || 0) ^ (expected[i] || 0);
  return difference === 0;
}
