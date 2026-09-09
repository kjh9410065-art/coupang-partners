/**
 * 품질검사를 통과한 콘텐츠를 실제 게시 전용 대기열에 넣습니다.
 *
 * 아직 네이버/티스토리 외부 게시 API를 호출하지 않습니다.
 * 나중에 공식 게시 수단이 연결되면 이 대기열의 ready 항목만 사용합니다.
 */

export interface PublishQueueEnv {
  CONTENT_STORE: KVNamespace;
}

export interface PublishQueueItem {
  queueId: string;
  platform: "naver" | "tistory";
  status: "ready" | "published" | "failed";
  storageKey: string;
  title: string;
  keyword: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

const QUEUE_INDEX_KEY = "publish:queue";
const MAX_QUEUE_ITEMS = 100;

/** 게시 대기열 목록을 안전하게 읽습니다. */
async function getQueue(env: PublishQueueEnv): Promise<PublishQueueItem[]> {
  const value = await env.CONTENT_STORE.get(QUEUE_INDEX_KEY, "json") as PublishQueueItem[] | null;
  return Array.isArray(value) ? value : [];
}

/** 품질검사를 통과한 콘텐츠를 게시 대기열에 등록합니다. */
export async function enqueuePublishReady(
  env: PublishQueueEnv,
  item: Omit<PublishQueueItem, "queueId" | "createdAt" | "updatedAt" | "status">,
): Promise<PublishQueueItem> {
  const now = new Date().toISOString();
  const queueItem: PublishQueueItem = {
    ...item,
    queueId: `${item.platform}:${Date.now()}`,
    status: "ready",
    createdAt: now,
    updatedAt: now,
  };

  const queue = await getQueue(env);
  // 같은 storageKey가 이미 대기열에 있으면 중복 등록하지 않습니다.
  const filtered = queue.filter((entry) => entry.storageKey !== item.storageKey || entry.platform !== item.platform);
  filtered.push(queueItem);

  await env.CONTENT_STORE.put(QUEUE_INDEX_KEY, JSON.stringify(filtered.slice(-MAX_QUEUE_ITEMS)));
  await env.CONTENT_STORE.put(`publish:queue:${queueItem.queueId}`, JSON.stringify(queueItem));

  return queueItem;
}

/** 현재 게시 준비된 항목만 가져옵니다. */
export async function getReadyPublishQueue(env: PublishQueueEnv): Promise<PublishQueueItem[]> {
  const queue = await getQueue(env);
  return queue.filter((item) => item.status === "ready");
}
