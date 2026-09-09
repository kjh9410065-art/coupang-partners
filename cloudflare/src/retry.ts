/**
 * 자동 생성 재시도 정책을 한곳에서 관리합니다.
 * 일시적인 API 오류가 발생해도 전체 자동화가 바로 실패하지 않도록 합니다.
 */

/** 지수 백오프를 적용해 짧은 시간 동안 재시도합니다. */
export async function retry<T>(task: () => Promise<T>, attempts = 3, baseDelayMs = 800): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;

      // 첫 재시도는 짧게, 이후 재시도는 조금 더 기다립니다.
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("재시도 후에도 작업이 실패했습니다.");
}
