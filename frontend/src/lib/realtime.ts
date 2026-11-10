"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL, ApiError, apiRequest } from "./api";
import type { ChatMessage } from "./chat";

/**
 * 백엔드와의 실시간 연결(Socket.IO). 화면 전체가 연결 하나를 함께 쓴다.
 * 인증은 브라우저가 붙여 보내는 access_token 쿠키로 하며, 서버가 소속 팀 룸에 자동으로 넣는다.
 * 클라이언트가 보내는 이벤트는 없고 서버 알림만 받는다.
 */
/** team:changed가 알리는 변경 범위 */
export type TeamChangeScope = "team" | "assignments" | "files";

export type RealtimeEvents = {
  /** 연결(재연결 포함)될 때마다. 끊긴 동안 놓친 내용을 다시 불러오는 데 쓴다. */
  connect: () => void;
  "message:new": (message: ChatMessage) => void;
  /** 팀원(나 포함)이 팀 정보·과제·파일을 바꿨다. 내용 없이 범위만 오며 화면이 다시 불러온다. */
  "team:changed": (payload: {
    teamId: string;
    scopes: TeamChangeScope[];
  }) => void;
  /** 내가 팀을 떠났거나 내보내졌거나 팀이 삭제됐다. */
  "team:removed": (payload: { teamId: string }) => void;
};

export type RealtimeStatus = "connecting" | "connected" | "offline";

/** 마지막 구독이 끝난 뒤 연결을 끊기까지 기다리는 시간. 탭을 오갈 때 다시 연결하지 않게 한다. */
const IDLE_DISCONNECT_MS = 10_000;

let socket: Socket | null = null;
let subscribers = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let recoverAttempt = 0;
let status: RealtimeStatus = "connecting";
const statusListeners = new Set<() => void>();

function setStatus(next: RealtimeStatus) {
  if (status === next) return;
  status = next;
  for (const listener of statusListeners) listener();
}

/**
 * 서버가 인증을 거부했거나(토큰 만료 등) 연결을 끊었을 때 Socket.IO는 스스로 다시 연결하지 않는다.
 * 로그인이 아직 유효하면 잠시 뒤 다시 연결하고, 아니면 로그인 화면으로 보낸다.
 */
function recover(current: Socket) {
  const delay = Math.min(30_000, 1000 * 2 ** recoverAttempt++);
  apiRequest("/auth/me")
    .then(() => {
      setTimeout(() => {
        if (subscribers > 0 && !current.connected) current.connect();
      }, delay);
    })
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        window.location.replace("/login");
        return;
      }
      setTimeout(() => {
        if (subscribers > 0 && !current.connected) recover(current);
      }, delay);
    });
}

function getSocket() {
  if (socket) return socket;
  const created = io(API_URL, { withCredentials: true, autoConnect: false });
  created.on("connect", () => {
    recoverAttempt = 0;
    setStatus("connected");
  });
  created.on("disconnect", (reason) => {
    setStatus(subscribers > 0 ? "offline" : "connecting");
    if (reason === "io server disconnect" && subscribers > 0) recover(created);
  });
  created.on("connect_error", () => {
    setStatus("offline");
    // 네트워크 오류는 Socket.IO가 알아서 다시 시도한다(active). 서버가 거부한 경우만 직접 처리한다.
    if (!created.active) recover(created);
  });
  created.io.on("reconnect_attempt", () => setStatus("connecting"));
  socket = created;
  return created;
}

function acquire() {
  subscribers++;
  clearTimeout(idleTimer);
  const current = getSocket();
  if (!current.connected && !current.active) {
    setStatus("connecting");
    current.connect();
  }
  return current;
}

function release() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers > 0) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => socket?.disconnect(), IDLE_DISCONNECT_MS);
}

/** 로그아웃할 때 연결을 바로 끊는다. 다시 로그인하면 구독하는 화면이 새로 연결한다. */
export function disconnectRealtime() {
  clearTimeout(idleTimer);
  socket?.disconnect();
}

/**
 * 컴포넌트가 화면에 있는 동안 실시간 이벤트를 받는다. handler는 항상 최신 것을 부른다.
 * enabled가 false면 구독하지 않는다(연결도 열지 않는다).
 */
export function useRealtimeEvent<E extends keyof RealtimeEvents>(
  event: E,
  handler: RealtimeEvents[E],
  enabled = true,
) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!enabled) return;
    const current = acquire();
    const listener = (...args: unknown[]) =>
      (handlerRef.current as (...args: unknown[]) => void)(...args);
    // 예약 이벤트(connect)와 서버 이벤트를 같은 방식으로 등록한다.
    current.on(event as string, listener);
    return () => {
      current.off(event as string, listener);
      release();
    };
  }, [event, enabled]);
}

/**
 * 팀의 해당 범위가 바뀌면 onChange를 부른다. teamId가 null이면 모든 팀의 변경을 받는다.
 * 다른 팀원의 변경이 새로고침 없이 반영되도록 각 화면이 조용히 다시 불러오는 데 쓴다.
 */
export function useTeamChanged(
  teamId: string | null,
  scope: TeamChangeScope | TeamChangeScope[],
  onChange: () => void,
  enabled = true,
) {
  const scopes = Array.isArray(scope) ? scope : [scope];
  useRealtimeEvent(
    "team:changed",
    (payload) => {
      if (teamId !== null && payload.teamId !== teamId) return;
      if (payload.scopes.some((changed) => scopes.includes(changed)))
        onChange();
    },
    enabled,
  );
}

function subscribeStatus(listener: () => void) {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

/** 실시간 연결 상태. 서버 렌더링 중에는 연결 중으로 본다. */
export function useRealtimeStatus() {
  return useSyncExternalStore(
    subscribeStatus,
    () => status,
    () => "connecting" as const,
  );
}
