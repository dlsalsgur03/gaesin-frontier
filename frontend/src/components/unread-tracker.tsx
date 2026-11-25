"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useRealtimeEvent, useTeamChanged } from "@/lib/realtime";
import {
  addUnread,
  isActiveChatTeam,
  removeUnread,
  replaceUnreadCounts,
  setUnreadCount,
} from "@/lib/unread";

/**
 * 안 읽은 메시지 수를 최신으로 유지한다. 작업 공간에 항상 떠 있으며 화면에는 아무것도 그리지 않는다.
 * - 처음, 팀 참여·탈퇴, 다시 연결될 때: GET /teams의 unreadCount로 맞춘다.
 * - 다른 사람의 새 메시지: 그 팀 채팅을 보고 있지 않으면 1 올린다.
 * - 내 다른 탭·기기에서 읽음: messages:read로 받은 수로 맞춘다.
 */
export default function UnreadTracker({ myUserId }: { myUserId: string }) {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<{ teams: { id: string; unreadCount: number }[] }>("/teams", {
      signal: controller.signal,
    })
      .then((data) => replaceUnreadCounts(data.teams))
      .catch(() => {
        // 배지는 보조 정보다. 실패하면 다음 변경이나 재연결 때 다시 맞춘다.
      });
    return () => controller.abort();
  }, [revision]);

  // 참여·탈퇴(멤버 변경)와 재연결(놓친 메시지)을 반영한다.
  useTeamChanged(null, "team", () => setRevision((value) => value + 1));

  useRealtimeEvent("team:removed", ({ teamId }) => removeUnread(teamId));

  useRealtimeEvent("message:new", (message) => {
    if (message.userId === myUserId) return;
    // 보고 있는 채팅은 그 화면이 바로 읽음 처리한다.
    if (isActiveChatTeam(message.teamId)) return;
    addUnread(message.teamId);
  });

  useRealtimeEvent("messages:read", ({ teamId, unreadCount }) =>
    setUnreadCount(teamId, unreadCount),
  );

  return null;
}
