"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { dateKey, getMonthWeeks, startOfMonth } from "@/lib/calendar/dates";
import type { CalendarAssignment } from "@/lib/calendar/types";
import { useRealtimeEvent, useTeamChanged } from "@/lib/realtime";
import MonthCalendar from "./month-calendar";

export default function Calendar() {
  const router = useRouter();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [revision, setRevision] = useState(0);
  /** 다른 팀원의 변경을 반영하는 조용한 재조회. 지금 캘린더를 보인 채로 다시 불러온다. */
  const [quiet, setQuiet] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    assignments: CalendarAssignment[];
    error: string;
  } | null>(null);
  const weeks = getMonthWeeks(month);
  const from = dateKey(weeks[0][0]);
  const to = dateKey(weeks[5][6]);
  const requestKey = `${from}:${to}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadAssignments() {
      try {
        const query = new URLSearchParams({ from, to });
        const data = await apiRequest<{ assignments: CalendarAssignment[] }>(
          `/calendar/assignments?${query}`,
          { signal: controller.signal },
        );
        if (active)
          setResult({
            key: requestKey,
            assignments: data.assignments,
            error: "",
          });
      } catch (error: unknown) {
        if (!active || controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401)
          router.replace("/login");
        // 조용한 재조회가 실패하면 지금 캘린더를 그대로 둔다.
        setResult((previous) =>
          previous?.key === requestKey && !previous.error
            ? previous
            : {
                key: requestKey,
                assignments: [],
                error:
                  error instanceof Error
                    ? error.message
                    : "과제 일정을 불러오지 못했습니다.",
              },
        );
      }
    }

    void loadAssignments();
    return () => {
      active = false;
      controller.abort();
    };
  }, [from, to, requestKey, quiet, router]);

  // 팀 과제 등록·수정·삭제, 팀 이름 변경, 참여·탈퇴·삭제를 새로고침 없이 반영한다.
  useTeamChanged(null, ["assignments", "team"], () =>
    setQuiet((value) => value + 1),
  );
  useRealtimeEvent("team:removed", () => setQuiet((value) => value + 1));

  // 다른 달의 응답이나 재시도 전 데이터가 현재 달에 잠시 표시되지 않도록 한다.
  const current = result?.key === requestKey ? result : null;

  return (
    <MonthCalendar
      month={month}
      onMonthChange={setMonth}
      assignments={current?.assignments ?? []}
      isLoading={!current}
      error={current?.error ?? ""}
      onReload={() => setRevision((value) => value + 1)}
    />
  );
}
