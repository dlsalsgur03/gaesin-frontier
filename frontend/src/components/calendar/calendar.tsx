"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { dateKey, getMonthWeeks, startOfMonth } from "@/lib/calendar/dates";
import type { CalendarAssignment } from "@/lib/calendar/types";
import { useRealtimeEvent, useTeamChanged } from "@/lib/realtime";
import type { Schedule } from "@/lib/schedules";
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
    schedules: Schedule[];
    error: string;
  } | null>(null);
  const weeks = getMonthWeeks(month);
  const from = dateKey(weeks[0][0]);
  const to = dateKey(weeks[5][6]);
  const requestKey = `${from}:${to}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadCalendar() {
      try {
        // 일정은 시각이 있으므로 화면에 보이는 첫날 0시부터 마지막 날 다음 날 0시(브라우저 시간대)까지 조회한다.
        // 시간대 없는 날짜·시각 문자열은 브라우저 시간대로 해석된다.
        const firstDay = new Date(`${from}T00:00`);
        const lastDay = new Date(`${to}T00:00`);
        const scheduleQuery = new URLSearchParams({
          from: firstDay.toISOString(),
          to: new Date(
            lastDay.getFullYear(),
            lastDay.getMonth(),
            lastDay.getDate() + 1,
          ).toISOString(),
        });
        const [assignmentData, scheduleData] = await Promise.all([
          apiRequest<{ assignments: CalendarAssignment[] }>(
            `/calendar/assignments?${new URLSearchParams({ from, to })}`,
            { signal: controller.signal },
          ),
          apiRequest<{ schedules: Schedule[] }>(
            `/calendar/schedules?${scheduleQuery}`,
            { signal: controller.signal },
          ),
        ]);
        if (active)
          setResult({
            key: requestKey,
            assignments: assignmentData.assignments,
            schedules: scheduleData.schedules,
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
                schedules: [],
                error:
                  error instanceof Error
                    ? error.message
                    : "캘린더를 불러오지 못했습니다.",
              },
        );
      }
    }

    void loadCalendar();
    return () => {
      active = false;
      controller.abort();
    };
  }, [from, to, requestKey, quiet, router]);

  // 팀 과제·일정 변경, 팀 이름 변경, 참여·탈퇴·삭제를 새로고침 없이 반영한다.
  useTeamChanged(null, ["assignments", "schedules", "team"], () =>
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
      schedules={current?.schedules ?? []}
      isLoading={!current}
      error={current?.error ?? ""}
      onReload={() => setRevision((value) => value + 1)}
    />
  );
}
