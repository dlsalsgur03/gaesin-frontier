"use client";

import { useEffect, useState } from "react";
import {
  dateKey,
  getMonthWeeks,
  moveMonth,
  startOfMonth,
} from "@/lib/calendar/dates";
import type { CalendarAssignment } from "@/lib/calendar/types";
import CalendarWeek from "./calendar-week";
import AssignmentDialog from "./assignment-dialog";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const filters = [
  { value: "all", label: "전체" },
  { value: "personal", label: "개인" },
  { value: "team", label: "팀" },
] as const;
const buttonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export default function MonthCalendar({
  assignments,
  month,
  onMonthChange,
  isLoading,
  error,
  onReload,
}: {
  assignments: readonly CalendarAssignment[];
  month: Date;
  onMonthChange: (month: Date) => void;
  isLoading: boolean;
  error: string;
  onReload: () => void;
}) {
  const [today, setToday] = useState(() => new Date());
  const [filter, setFilter] =
    useState<(typeof filters)[number]["value"]>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const monthLabel = `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
  const todayKey = dateKey(today);
  const weeks = getMonthWeeks(month);
  const firstDate = dateKey(weeks[0][0]);
  const lastDate = dateKey(weeks[5][6]);
  const visibleAssignments = assignments.filter(
    (assignment) =>
      (filter === "all" || assignment.kind === filter) &&
      assignment.startDate <= assignment.dueDate &&
      assignment.startDate <= lastDate &&
      assignment.dueDate >= firstDate,
  );
  // 선택된 과제도 최신 props에서 찾으므로 API 갱신 시 팝업에 변경 사항이 반영된다.
  const selectedAssignment = assignments.find(
    (assignment) => `${assignment.kind}:${assignment.id}` === selectedKey,
  );

  function handleSelectAssignment(assignment: CalendarAssignment) {
    // 상세 화면 구현 후 종류·id·teamId에 따른 라우팅을 연결할 위치.
    setSelectedKey(`${assignment.kind}:${assignment.id}`);
  }

  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const timer = window.setTimeout(
      () => setToday(new Date()),
      tomorrow.getTime() - now.getTime(),
    );
    return () => window.clearTimeout(timer);
  }, [today]);

  function goToToday() {
    const now = new Date();
    setToday(now);
    onMonthChange(startOfMonth(now));
  }

  return (
    <section
      aria-labelledby="calendar-title"
      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 p-5 sm:px-7 sm:py-6">
        <div>
          <h2 id="calendar-title" className="text-xl font-bold">
            캘린더
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            개인 과제와 팀 과제의 일정을 한눈에 확인하세요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-blue-600"
          />
          <span className="text-sm text-zinc-600">오늘</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-7">
        <h3
          id="calendar-month"
          aria-live="polite"
          aria-atomic="true"
          className="text-xl font-semibold tabular-nums sm:text-2xl"
        >
          {monthLabel}
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="이전 달"
            className={`${buttonClass} w-10 px-0`}
            onClick={() => onMonthChange(moveMonth(month, -1))}
          >
            <span aria-hidden="true" className="text-xl">
              ‹
            </span>
          </button>
          <button
            type="button"
            onClick={goToToday}
            className={buttonClass}
            aria-label="오늘이 있는 달로 이동"
          >
            오늘
          </button>
          <button
            type="button"
            aria-label="다음 달"
            className={`${buttonClass} w-10 px-0`}
            onClick={() => onMonthChange(moveMonth(month, 1))}
          >
            <span aria-hidden="true" className="text-xl">
              ›
            </span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 sm:px-7">
        <div
          role="group"
          aria-label="과제 종류 필터"
          className="inline-flex gap-1 rounded-xl bg-zinc-100 p-1"
        >
          {filters.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${filter === value ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-600">
          <button
            type="button"
            onClick={onReload}
            disabled={isLoading}
            className={`${buttonClass} disabled:cursor-wait disabled:opacity-50`}
          >
            새로고침
          </button>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-sm bg-blue-400"
            />
            개인 과제
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-sm bg-purple-400"
            />
            팀 과제
          </span>
        </div>
      </div>
      {error ? (
        <div
          role="alert"
          className="mx-5 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 sm:mx-7"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={onReload}
            className="min-h-10 rounded-lg px-3 font-semibold underline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            다시 시도
          </button>
        </div>
      ) : (
        <p
          role="status"
          aria-atomic="true"
          className="px-5 pb-4 text-sm text-zinc-500 sm:px-7"
        >
          {isLoading
            ? "과제 일정을 불러오고 있습니다."
            : visibleAssignments.length > 0
              ? `표시된 과제 ${visibleAssignments.length}개 · 과제를 선택하면 자세한 정보를 볼 수 있습니다.`
              : "표시할 과제가 없습니다."}
        </p>
      )}

      <div
        role="region"
        aria-busy={isLoading}
        aria-label="월별 캘린더, 좁은 화면에서는 좌우로 스크롤하세요"
        tabIndex={0}
        className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
      >
        <div aria-labelledby="calendar-month" className="min-w-[560px]">
          <div
            aria-hidden="true"
            className="grid grid-cols-7 border-y border-zinc-200 bg-zinc-50"
          >
            {weekdays.map((day, index) => (
              <div
                key={day}
                className={`px-3 py-3 text-center text-xs font-semibold sm:text-sm ${index === 0 ? "text-red-500" : index === 6 ? "text-blue-600" : "text-zinc-500"}`}
              >
                {day}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <CalendarWeek
              key={dateKey(week[0])}
              dates={week}
              month={month}
              todayKey={todayKey}
              assignments={visibleAssignments}
              onSelectAssignment={handleSelectAssignment}
            />
          ))}
        </div>
      </div>
      <p className="border-t border-zinc-200 px-5 py-4 text-sm text-zinc-500 sm:px-7">
        시작일과 마감일이 모두 있는 과제만 표시됩니다. 막대는 양 끝 날짜를 모두
        포함하며, 양 끝의 화살표는 이전·다음 주로 이어지는 과제를 뜻합니다.
      </p>
      {selectedAssignment && (
        <AssignmentDialog
          assignment={selectedAssignment}
          onClose={() => setSelectedKey(null)}
        />
      )}
    </section>
  );
}
