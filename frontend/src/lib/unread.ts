"use client";

import { useSyncExternalStore } from "react";

/**
 * 팀별 안 읽은 채팅 메시지 수. 화면 전체가 함께 쓰는 작은 저장소다.
 * UnreadTracker(작업 공간에 항상 떠 있음)가 채우고, 배지와 채팅 화면이 읽고 고친다.
 */
let counts: ReadonlyMap<string, number> = new Map();
/** 지금 화면에 열려 있고 보이는 채팅의 팀. 이 팀의 새 메시지는 채팅이 바로 읽음 처리한다. */
let activeChatTeam: string | null = null;
const listeners = new Set<() => void>();

function update(next: Map<string, number>) {
  counts = next;
  for (const listener of listeners) listener();
}

/** 서버 목록(GET /teams)으로 통째로 바꾼다. 목록에 없는 팀(나간 팀)은 사라진다. */
export function replaceUnreadCounts(
  teams: readonly { id: string; unreadCount: number }[],
) {
  update(new Map(teams.map((team) => [team.id, team.unreadCount])));
}

export function setUnreadCount(teamId: string, count: number) {
  if (counts.get(teamId) === count) return;
  update(new Map(counts).set(teamId, count));
}

export function addUnread(teamId: string) {
  // 아직 목록을 받기 전이면 0으로 시작한다(곧 서버 값으로 바뀐다).
  setUnreadCount(teamId, (counts.get(teamId) ?? 0) + 1);
}

export function removeUnread(teamId: string) {
  if (!counts.has(teamId)) return;
  const next = new Map(counts);
  next.delete(teamId);
  update(next);
}

export function setActiveChatTeam(teamId: string | null) {
  activeChatTeam = teamId;
}

export function isActiveChatTeam(teamId: string) {
  return activeChatTeam === teamId;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** teamId를 주면 그 팀의 수, 생략하면 모든 팀의 합계. */
export function useUnreadCount(teamId?: string) {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (teamId !== undefined) return counts.get(teamId) ?? 0;
      let total = 0;
      for (const count of counts.values()) total += count;
      return total;
    },
    () => 0,
  );
}

/** 화면에 보일 개수 문자열. 100개부터는 99+로 줄인다. */
export function unreadLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}
