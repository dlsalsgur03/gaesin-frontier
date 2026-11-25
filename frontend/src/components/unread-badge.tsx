"use client";

import { unreadLabel, useUnreadCount } from "@/lib/unread";

/** 안 읽은 메시지 배지. teamId를 생략하면 모든 팀의 합계다. 0이면 아무것도 그리지 않는다. */
export default function UnreadBadge({ teamId }: { teamId?: string }) {
  const count = useUnreadCount(teamId);
  if (count === 0) return null;
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] leading-5 font-bold text-white tabular-nums">
      <span aria-hidden="true">{unreadLabel(count)}</span>
      <span className="sr-only">, 안 읽은 메시지 {count}개</span>
    </span>
  );
}
