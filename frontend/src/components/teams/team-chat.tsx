"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import {
  MESSAGE_MAX_LENGTH,
  mergeMessages,
  type ChatMessage,
  type MessagePage,
} from "@/lib/chat";
import { useRealtimeEvent, useRealtimeStatus } from "@/lib/realtime";

const buttonClass =
  "min-h-10 shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50";

/** 맨 아래에서 이 정도 안쪽이면 새 메시지가 올 때 따라 내려간다. */
const STICK_THRESHOLD_PX = 80;

const statusText = {
  connected: "실시간 연결됨",
  connecting: "연결 중...",
  offline: "연결 끊김 · 다시 연결하는 중",
} as const;

const statusDot = {
  connected: "bg-green-500",
  connecting: "bg-amber-400",
  offline: "bg-red-500",
} as const;

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  });

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** 한 메시지. 같은 사람이 이어서 보낸 메시지는 이름을 다시 보이지 않는다. */
function MessageItem({
  message,
  mine,
  showName,
}: {
  message: ChatMessage;
  mine: boolean;
  showName: boolean;
}) {
  return (
    <li className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {showName && !mine && (
        <span className="mb-1 px-1 text-xs font-semibold text-zinc-600">
          {message.nickname}
        </span>
      )}
      <div
        className={`flex max-w-[85%] items-end gap-1.5 sm:max-w-[70%] ${mine ? "flex-row-reverse" : ""}`}
      >
        <p
          className={`min-w-0 whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-900"}`}
        >
          {mine && <span className="sr-only">나: </span>}
          {message.content}
        </p>
        <time
          dateTime={message.createdAt}
          className="shrink-0 text-[11px] text-zinc-400"
        >
          {timeLabel(message.createdAt)}
        </time>
      </div>
    </li>
  );
}

/**
 * 팀룸 채팅. 처음에는 최신 메시지를 불러오고, 위쪽 버튼으로 이전 메시지를 더 불러온다.
 * 보내기는 REST로 하고 새 메시지는 소켓(message:new)으로 받는다. 끊겼다 다시 연결되면
 * 마지막 메시지 이후를 다시 불러와 빈틈을 채운다. 메시지는 ID로 중복 없이 합친다.
 */
export default function TeamChat({
  teamId,
  myUserId,
}: {
  teamId: string;
  myUserId: string | undefined;
}) {
  const router = useRouter();
  const inputId = useId();
  const status = useRealtimeStatus();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** 다음 렌더에서 맨 아래로 따라 내려갈지 */
  const stickRef = useRef(true);
  /** 이전 메시지를 앞에 붙이기 전의 scrollHeight. 보던 위치를 유지하는 데 쓴다. */
  const restoreRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  const olderRef = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  const [hasOlder, setHasOlder] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const phaseRef = useRef(phase);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    messagesRef.current = messages;
    phaseRef.current = phase;
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    apiRequest<MessagePage>(`/teams/${teamId}/messages`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!active) return;
        stickRef.current = true;
        // 불러오는 동안 소켓으로 먼저 받은 메시지와 합친다.
        setMessages((current) => mergeMessages(current, data.messages));
        setHasOlder(data.hasMore);
        setPhase("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401)
          router.replace("/login");
        setLoadError(errorMessage(error, "메시지를 불러오지 못했습니다."));
        setPhase("error");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [teamId, revision, router]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (restoreRef.current !== null) {
      list.scrollTop += list.scrollHeight - restoreRef.current;
      restoreRef.current = null;
    } else if (stickRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, phase]);

  useRealtimeEvent("message:new", (message) => {
    if (message.teamId !== teamId) return;
    if (!stickRef.current && message.userId !== myUserId) setUnseen(true);
    if (message.userId === myUserId) stickRef.current = true;
    setMessages((current) => mergeMessages(current, [message]));
  });

  // 다시 연결되면 끊긴 동안 놓친 메시지를 마지막 메시지 이후부터 불러온다.
  useRealtimeEvent("connect", () => {
    if (phaseRef.current === "loading") return;
    if (phaseRef.current === "error") {
      setPhase("loading");
      setRevision((value) => value + 1);
      return;
    }
    void (async () => {
      try {
        let last = messagesRef.current.at(-1)?.id;
        if (!last) {
          const data: MessagePage = await apiRequest<MessagePage>(
            `/teams/${teamId}/messages`,
          );
          setMessages((current) => mergeMessages(current, data.messages));
          setHasOlder(data.hasMore);
          return;
        }
        for (;;) {
          const data: MessagePage = await apiRequest<MessagePage>(
            `/teams/${teamId}/messages?after=${last}&limit=100`,
          );
          setMessages((current) => mergeMessages(current, data.messages));
          const newest: string | undefined = data.messages.at(-1)?.id;
          if (!data.hasMore || !newest) break;
          last = newest;
        }
      } catch {
        // 다음 재연결이나 새 메시지에서 다시 맞춘다. 화면은 지금 내역을 유지한다.
      }
    })();
  });

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    const atBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight <
      STICK_THRESHOLD_PX;
    stickRef.current = atBottom;
    if (atBottom) setUnseen(false);
  }

  function scrollToBottom() {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
    stickRef.current = true;
    setUnseen(false);
  }

  async function loadOlder() {
    const first = messages[0]?.id;
    if (!first || olderRef.current) return;
    olderRef.current = true;
    setLoadingOlder(true);
    setSendError("");
    try {
      const data: MessagePage = await apiRequest<MessagePage>(
        `/teams/${teamId}/messages?before=${first}`,
      );
      restoreRef.current = listRef.current?.scrollHeight ?? null;
      setMessages((current) => mergeMessages(current, data.messages));
      setHasOlder(data.hasMore);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401)
        router.replace("/login");
      setSendError(errorMessage(error, "이전 메시지를 불러오지 못했습니다."));
    } finally {
      olderRef.current = false;
      setLoadingOlder(false);
    }
  }

  async function send() {
    const content = draft.trim();
    if (!content || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError("");
    try {
      const data = await apiRequest<{ message: ChatMessage }>(
        `/teams/${teamId}/messages`,
        { method: "POST", body: JSON.stringify({ content }) },
      );
      stickRef.current = true;
      setMessages((current) => mergeMessages(current, [data.message]));
      setDraft("");
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401)
        router.replace("/login");
      // 저장 여부가 불분명할 수 있으므로 자동으로 다시 보내지 않는다. 입력한 내용은 남겨 둔다.
      setSendError(errorMessage(error, "메시지를 보내지 못했습니다."));
    } finally {
      sendingRef.current = false;
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const trimmedLength = draft.trim().length;

  return (
    <section aria-labelledby={`${inputId}-heading`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${inputId}-heading`} className="font-semibold">
          팀 채팅
        </h3>
        <p
          role="status"
          className="flex items-center gap-1.5 text-xs text-zinc-500"
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${statusDot[status]}`}
          />
          {statusText[status]}
        </p>
      </div>

      <div className="relative">
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="h-[min(60vh,560px)] min-h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3 sm:p-4"
        >
          {phase === "loading" ? (
            <p
              role="status"
              className="py-10 text-center text-sm text-zinc-500"
            >
              메시지를 불러오고 있습니다.
            </p>
          ) : phase === "error" ? (
            <div role="alert" className="space-y-3 py-10 text-center">
              <p className="text-sm text-red-700">{loadError}</p>
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  setPhase("loading");
                  setRevision((value) => value + 1);
                }}
              >
                다시 시도
              </button>
            </div>
          ) : (
            <>
              {hasOlder && (
                <div className="mb-3 text-center">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={loadingOlder}
                    onClick={() => void loadOlder()}
                  >
                    {loadingOlder ? "불러오는 중..." : "이전 메시지 더 보기"}
                  </button>
                </div>
              )}
              {messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-zinc-500">
                  아직 메시지가 없습니다. 첫 메시지를 보내보세요.
                </p>
              ) : (
                <ol role="log" aria-label="채팅 메시지" className="space-y-2">
                  {messages.map((message, index) => {
                    const previous = messages[index - 1];
                    const newDay =
                      !previous ||
                      dayLabel(previous.createdAt) !==
                        dayLabel(message.createdAt);
                    return (
                      <MessageGroup
                        key={message.id}
                        message={message}
                        mine={message.userId === myUserId}
                        newDay={newDay}
                        showName={newDay || previous?.userId !== message.userId}
                      />
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </div>
        {unseen && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            새 메시지 보기 ↓
          </button>
        )}
      </div>

      {sendError && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {sendError}
        </p>
      )}

      <form
        className="space-y-1"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          메시지
        </label>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            id={inputId}
            rows={2}
            value={draft}
            maxLength={MESSAGE_MAX_LENGTH}
            readOnly={sending}
            disabled={phase !== "ready"}
            placeholder="메시지를 입력하세요"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // 한글 조합 중의 Enter는 글자 확정이므로 보내지 않는다.
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                void send();
              }
            }}
            className="min-h-12 w-full min-w-0 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:bg-zinc-50"
          />
          <button
            type="submit"
            disabled={sending || trimmedLength === 0 || phase !== "ready"}
            className="min-h-12 shrink-0 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
          >
            {sending ? "보내는 중" : "보내기"}
          </button>
        </div>
        <p className="flex justify-between gap-2 text-xs text-zinc-500">
          <span>Enter로 보내기 · Shift+Enter로 줄바꿈</span>
          <span>
            {draft.length.toLocaleString()}/
            {MESSAGE_MAX_LENGTH.toLocaleString()}
          </span>
        </p>
      </form>
    </section>
  );
}

/** 날짜가 바뀌는 메시지 앞에는 날짜 구분선을 넣는다. */
function MessageGroup({
  message,
  mine,
  newDay,
  showName,
}: {
  message: ChatMessage;
  mine: boolean;
  newDay: boolean;
  showName: boolean;
}) {
  return (
    <>
      {newDay && (
        <li className="flex items-center gap-3 py-2 text-xs text-zinc-400">
          <span aria-hidden="true" className="h-px flex-1 bg-zinc-200" />
          {dayLabel(message.createdAt)}
          <span aria-hidden="true" className="h-px flex-1 bg-zinc-200" />
        </li>
      )}
      <MessageItem message={message} mine={mine} showName={showName} />
    </>
  );
}
