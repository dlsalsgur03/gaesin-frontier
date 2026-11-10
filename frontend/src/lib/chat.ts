/** 팀 채팅 메시지. ID는 BigInt 문자열이며 작성 순서와 같다. 시각은 ISO(UTC)다. */
export type ChatMessage = {
  id: string;
  teamId: string;
  userId: string;
  nickname: string;
  content: string;
  createdAt: string;
};

export type MessagePage = { messages: ChatMessage[]; hasMore: boolean };

export const MESSAGE_MAX_LENGTH = 2000;

/** 십진수 ID 문자열을 숫자 크기로 비교한다. */
export function compareId(a: string, b: string) {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

/** REST 응답과 소켓으로 받은 메시지를 ID로 중복 없이 합치고 오래된 순으로 정렬한다. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => compareId(a.id, b.id));
}
