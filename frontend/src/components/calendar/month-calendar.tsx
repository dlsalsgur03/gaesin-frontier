"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import {
  dateKey,
  getMonthWeeks,
  moveMonth,
  startOfMonth,
} from "@/lib/calendar/dates";
import type { CalendarAssignment, CalendarTask } from "@/lib/calendar/types";
import type { Schedule } from "@/lib/schedules";
import type { TeamDetail, TeamMember, TeamTask } from "@/lib/teams";
import CalendarWeek from "./calendar-week";
import AssignmentEditorDialog from "./assignment-editor-dialog";
import ScheduleEditorDialog from "../schedules/schedule-editor-dialog";
import TaskDialog from "../teams/task-dialog";

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
  schedules,
  tasks,
  month,
  onMonthChange,
  isLoading,
  error,
  onReload,
}: {
  assignments: readonly CalendarAssignment[];
  schedules: readonly Schedule[];
  tasks: readonly CalendarTask[];
  month: Date;
  onMonthChange: (month: Date) => void;
  isLoading: boolean;
  error: string;
  onReload: () => void;
}) {
  const [today, setToday] = useState(() => new Date());
  const [filter, setFilter] =
    useState<(typeof filters)[number]["value"]>("all");
  const [editor, setEditor] = useState<{
    id?: string;
    team?: { id: string; name: string };
  } | null>(null);
  const [scheduleEditor, setScheduleEditor] = useState<Schedule | null>(null);
  const [taskEditor, setTaskEditor] = useState<{
    task: TeamTask;
    members: TeamMember[];
  } | null>(null);
  /** 완료 체크를 저장하는 중인 할 일. 같은 할 일을 연달아 눌러 요청이 겹치지 않게 한다. */
  const [savingTasks, setSavingTasks] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const savingRef = useRef(new Set<string>());
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [taskError, setTaskError] = useState("");
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
  // 일정과 할 일은 팀 활동이므로 전체·팀 필터에서 보인다.
  const visibleSchedules = filter === "personal" ? [] : schedules;
  const visibleTasks =
    filter === "personal"
      ? []
      : tasks.filter(
          (task) => task.dueDate >= firstDate && task.dueDate <= lastDate,
        );

  /** 완료 체크. 해제하면 진행 중으로 돌린다(사용자 결정). PUT은 전체 수정이라 다른 값도 그대로 보낸다. */
  async function toggleTask(task: CalendarTask, done: boolean) {
    if (savingRef.current.has(task.id)) return;
    savingRef.current.add(task.id);
    setSavingTasks(new Set(savingRef.current));
    setNotice("");
    setTaskError("");
    try {
      await apiRequest(`/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate,
          status: done ? "DONE" : "IN_PROGRESS",
        }),
      });
      setNotice(
        done
          ? `할 일을 완료했습니다: ${task.title}`
          : `할 일을 진행 중으로 돌렸습니다: ${task.title}`,
      );
      onReload();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401)
        router.replace("/login");
      setTaskError(
        error instanceof ApiError && error.status === 404
          ? "할 일을 찾을 수 없습니다. 다른 팀원이 지웠거나 팀을 나갔을 수 있습니다."
          : error instanceof Error
            ? error.message
            : "할 일을 저장하지 못했습니다. 다시 시도해주세요.",
      );
      if (error instanceof ApiError && error.status === 404) onReload();
    } finally {
      savingRef.current.delete(task.id);
      setSavingTasks(new Set(savingRef.current));
    }
  }

  /** 할 일 수정 창은 담당자 목록이 필요하므로 팀 멤버를 먼저 불러온다. */
  async function openTask(task: CalendarTask) {
    setNotice("");
    setTaskError("");
    try {
      const { team } = await apiRequest<{ team: TeamDetail }>(
        `/teams/${task.teamId}`,
      );
      setTaskEditor({
        task: {
          id: task.id,
          teamAssignmentId: task.teamAssignmentId,
          title: task.title,
          description: task.description,
          assigneeId: task.assigneeId,
          assigneeNickname: null,
          dueDate: task.dueDate,
          status: task.status,
        },
        members: team.members,
      });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401)
        router.replace("/login");
      setTaskError(
        error instanceof ApiError && error.status === 404
          ? "팀을 더 이상 볼 수 없습니다."
          : error instanceof Error
            ? error.message
            : "할 일을 열지 못했습니다.",
      );
      if (error instanceof ApiError && error.status === 404) onReload();
    }
  }
  // 팀 과제도 모든 팀원이 수정할 수 있으므로 같은 편집 창을 연다.
  function handleSelectAssignment(assignment: CalendarAssignment) {
    setEditor(
      assignment.kind === "personal"
        ? { id: assignment.id }
        : {
            id: assignment.id,
            team: { id: assignment.teamId, name: assignment.teamName },
          },
    );
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
          <button
            type="button"
            className={buttonClass}
            onClick={() => setEditor({})}
          >
            개인 과제 등록
          </button>
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
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-orange-500"
            />
            팀 일정
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-sm border-2 border-emerald-600"
            />
            내 할 일
          </span>
        </div>
      </div>
      {notice && (
        <p role="status" className="px-5 pb-3 text-sm text-blue-700 sm:px-7">
          {notice}
        </p>
      )}
      {taskError && (
        <p role="alert" className="px-5 pb-3 text-sm text-red-700 sm:px-7">
          {taskError}
        </p>
      )}
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
            ? "과제와 일정을 불러오고 있습니다."
            : visibleAssignments.length +
                  visibleSchedules.length +
                  visibleTasks.length >
                0
              ? `표시된 과제 ${visibleAssignments.length}개 · 일정 ${visibleSchedules.length}개 · 할 일 ${visibleTasks.length}개 · 선택하면 자세한 정보를 볼 수 있습니다.`
              : "표시할 과제나 일정이 없습니다."}
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
              schedules={visibleSchedules}
              onSelectSchedule={(schedule) => {
                setNotice("");
                setScheduleEditor(schedule);
              }}
              tasks={visibleTasks}
              savingTasks={savingTasks}
              onToggleTask={toggleTask}
              onSelectTask={openTask}
            />
          ))}
        </div>
      </div>
      <p className="border-t border-zinc-200 px-5 py-4 text-sm text-zinc-500 sm:px-7">
        시작일과 마감일이 모두 있는 과제만 표시됩니다. 막대는 양 끝 날짜를 모두
        포함하며, 양 끝의 화살표는 이전·다음 주로 이어지는 과제를 뜻합니다. 진행
        중인 과제는 진한 막대로, 완료한 과제는 옅은 막대에 취소선으로
        표시됩니다. 팀 일정은 날짜 칸 아래에 주황 점으로 시각·제목·팀 이름과
        함께 표시되며, 일정 등록은 팀룸의 일정 탭에서 합니다. 나에게 배정되고
        마감일이 있는 할 일은 마감일 칸에 체크박스와 함께 표시되며, 체크하면
        완료, 해제하면 진행 중이 됩니다.
      </p>
      {taskEditor && (
        <TaskDialog
          assignmentId={taskEditor.task.teamAssignmentId}
          task={taskEditor.task}
          members={taskEditor.members}
          onClose={() => setTaskEditor(null)}
          onSaved={(message) => {
            setTaskEditor(null);
            setNotice(message);
            onReload();
          }}
        />
      )}
      {scheduleEditor && (
        <ScheduleEditorDialog
          team={{ id: scheduleEditor.teamId, name: scheduleEditor.teamName }}
          schedule={scheduleEditor}
          onClose={() => setScheduleEditor(null)}
          onSaved={(saved) => {
            setScheduleEditor(null);
            setNotice(saved ? "일정을 저장했습니다." : "일정을 삭제했습니다.");
            // 시작 시각을 다른 달로 옮겼다면 그 달을 보여준다.
            if (saved) onMonthChange(startOfMonth(new Date(saved.startAt)));
            onReload();
          }}
        />
      )}
      {editor && (
        <AssignmentEditorDialog
          id={editor.id}
          team={editor.team}
          initialDate={dateKey(new Date())}
          onClose={() => setEditor(null)}
          onSaved={(date) => {
            setEditor(null);
            setNotice(date ? "과제를 저장했습니다." : "과제를 삭제했습니다.");
            if (date) {
              const [year, monthIndex] = date.split("-").map(Number);
              onMonthChange(new Date(year, monthIndex - 1, 1));
              // 저장한 과제가 현재 필터에 가려지지 않게 한다.
              const kind = editor.team ? "team" : "personal";
              if (filter !== "all" && filter !== kind) setFilter(kind);
            }
            onReload();
          }}
        />
      )}
    </section>
  );
}
