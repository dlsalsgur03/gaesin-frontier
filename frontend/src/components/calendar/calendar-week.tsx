import { statusLabel, type AssignmentStatus } from "@/lib/assignment-status";
import { dateKey } from "@/lib/calendar/dates";
import { layoutWeekAssignments } from "@/lib/calendar/layout";
import type { CalendarAssignment, CalendarTask } from "@/lib/calendar/types";
import {
  formatScheduleRange,
  formatTime,
  scheduleCoversDay,
  type Schedule,
} from "@/lib/schedules";

/** 종류는 색상(개인 파랑·팀 보라)으로, 상태는 진하기로 구분한다. 진행 중은 채운 막대로 가장 눈에 띄게 한다. */
const barColor: Record<
  CalendarAssignment["kind"],
  Record<AssignmentStatus, string>
> = {
  personal: {
    TODO: "border-blue-200 bg-blue-100 text-blue-950",
    IN_PROGRESS: "border-blue-700 bg-blue-600 text-white",
    DONE: "border-blue-100 bg-blue-50 text-blue-800",
  },
  team: {
    TODO: "border-purple-200 bg-purple-100 text-purple-950",
    IN_PROGRESS: "border-purple-700 bg-purple-600 text-white",
    DONE: "border-purple-100 bg-purple-50 text-purple-800",
  },
};

type CalendarWeekProps = {
  dates: Date[];
  month: Date;
  todayKey: string;
  assignments: readonly CalendarAssignment[];
  onSelectAssignment: (assignment: CalendarAssignment) => void;
  schedules: readonly Schedule[];
  onSelectSchedule: (schedule: Schedule) => void;
  tasks: readonly CalendarTask[];
  savingTasks: ReadonlySet<string>;
  onToggleTask: (task: CalendarTask, done: boolean) => void;
  onSelectTask: (task: CalendarTask) => void;
};

/** 날짜 칸에 보일 시각. 여러 날에 걸치면 시작일은 시작 시각, 마지막 날은 종료 시각, 사이는 종일이다. */
function dayTimeLabel(schedule: Schedule, key: string) {
  if (dateKey(new Date(schedule.startAt)) === key)
    return formatTime(schedule.startAt);
  if (dateKey(new Date(schedule.endAt)) === key)
    return `~${formatTime(schedule.endAt)}`;
  return "종일";
}

export default function CalendarWeek({
  dates,
  month,
  todayKey,
  assignments,
  onSelectAssignment,
  schedules,
  onSelectSchedule,
  tasks,
  savingTasks,
  onToggleTask,
  onSelectTask,
}: CalendarWeekProps) {
  const { segments } = layoutWeekAssignments(assignments, dates.map(dateKey));
  const keys = dates.map(dateKey);
  const hasDayItems = keys.some(
    (key) =>
      tasks.some((task) => task.dueDate === key) ||
      schedules.some((item) => scheduleCoversDay(item, key)),
  );

  return (
    <section
      aria-label={`${dateKey(dates[0])}부터 ${dateKey(dates[6])}까지`}
      className="relative min-h-32 border-b border-zinc-200 last:border-b-0"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 grid grid-cols-7"
      >
        {dates.map((date) => (
          <div
            key={dateKey(date)}
            className={`border-r border-zinc-200 last:border-r-0 ${dateKey(date) === todayKey ? "bg-blue-50/60" : date.getMonth() === month.getMonth() ? "bg-white" : "bg-zinc-50/70"}`}
          />
        ))}
      </div>
      <div className="relative grid grid-cols-7">
        {dates.map((date, index) => {
          const key = dateKey(date);
          const isToday = key === todayKey;
          const isCurrentMonth = date.getMonth() === month.getMonth();
          const dateColor = !isCurrentMonth
            ? "text-zinc-400"
            : index === 0
              ? "text-red-500"
              : index === 6
                ? "text-blue-600"
                : "text-zinc-700";

          return (
            <div key={key} className="px-2 py-2 sm:px-3">
              <time
                dateTime={key}
                aria-current={isToday ? "date" : undefined}
                aria-label={`${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${["일", "월", "화", "수", "목", "금", "토"][index]}요일${isToday ? ", 오늘" : ""}`}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums ${isToday ? "bg-blue-600 font-bold text-white" : `font-medium ${dateColor}`}`}
              >
                {date.getDate()}
              </time>
            </div>
          );
        })}
      </div>
      {segments.length > 0 && (
        <ul
          aria-label="과제 일정"
          className="relative grid grid-cols-7 gap-y-1 pb-3"
        >
          {segments.map(
            ({
              key,
              assignment,
              column,
              span,
              lane,
              continuesBefore,
              continuesAfter,
            }) => {
              const label =
                assignment.kind === "team"
                  ? `팀 · ${assignment.teamName}`
                  : "개인";
              const description = `${assignment.title} / ${label} / ${assignment.startDate} ~ ${assignment.dueDate} / ${statusLabel[assignment.status]}`;
              const color = barColor[assignment.kind][assignment.status];

              return (
                <li
                  key={key}
                  style={{
                    gridColumn: `${column} / span ${span}`,
                    gridRow: lane,
                  }}
                  className="mx-1 min-w-0"
                >
                  <button
                    type="button"
                    title={description}
                    aria-label={description}
                    aria-haspopup="dialog"
                    onClick={() => onSelectAssignment(assignment)}
                    className={`block h-full min-h-11 w-full min-w-0 cursor-pointer border px-2 py-1.5 text-left transition hover:brightness-95 focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 ${color} ${continuesBefore ? "rounded-l-none border-l-2 border-l-current" : "rounded-l-md"} ${continuesAfter ? "rounded-r-none border-r-2 border-r-current" : "rounded-r-md"}`}
                  >
                    <div
                      aria-hidden="true"
                      className="flex items-center gap-1 text-xs font-semibold"
                    >
                      {continuesBefore && <span>‹</span>}
                      <span
                        className={`min-w-0 flex-1 truncate ${assignment.status === "DONE" ? "line-through" : ""}`}
                      >
                        {assignment.title}
                      </span>
                      {continuesAfter && <span>›</span>}
                    </div>
                    <p
                      aria-hidden="true"
                      className="mt-0.5 truncate text-[11px]"
                    >
                      {label}
                      {` · ${statusLabel[assignment.status]}`}
                    </p>
                  </button>
                </li>
              );
            },
          )}
        </ul>
      )}
      {hasDayItems && (
        <div className="relative grid grid-cols-7 pb-3">
          {keys.map((key) => {
            const daySchedules = schedules.filter((item) =>
              scheduleCoversDay(item, key),
            );
            const dayTasks = tasks.filter((task) => task.dueDate === key);
            // 빈 날짜에는 목록을 두지 않아 화면 낭독기가 빈 목록을 읽지 않게 한다.
            if (daySchedules.length + dayTasks.length === 0)
              return <div key={key} />;
            return (
              <div key={key} className="min-w-0 space-y-0.5 px-1">
                {daySchedules.length > 0 && (
                  <ul
                    aria-label={`${key} 팀 일정`}
                    className="min-w-0 space-y-0.5"
                  >
                    {daySchedules.map((schedule) => (
                      <li key={schedule.id} className="min-w-0">
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          title={`${schedule.title} / ${schedule.teamName} / ${formatScheduleRange(schedule)}`}
                          aria-label={`${schedule.teamName} 팀 일정 ${schedule.title}, ${formatScheduleRange(schedule)}`}
                          onClick={() => onSelectSchedule(schedule)}
                          className="block min-h-9 w-full min-w-0 rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-blue-600"
                        >
                          <span
                            aria-hidden="true"
                            className="flex min-w-0 items-center gap-1"
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                            <span className="shrink-0 tabular-nums text-zinc-500">
                              {dayTimeLabel(schedule, key)}
                            </span>
                            <span className="min-w-0 truncate font-medium text-zinc-900">
                              {schedule.title}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className="block truncate pl-2.5 text-zinc-500"
                          >
                            {schedule.teamName}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {dayTasks.length > 0 && (
                  <ul
                    aria-label={`${key} 내 할 일`}
                    className="min-w-0 space-y-0.5"
                  >
                    {dayTasks.map((task) => (
                      <CalendarTaskItem
                        key={task.id}
                        task={task}
                        saving={savingTasks.has(task.id)}
                        onToggle={onToggleTask}
                        onSelect={onSelectTask}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** 마감일 칸의 내 할 일. 체크박스로 완료·진행 중을 바꾸고, 제목을 누르면 수정 창을 연다. */
function CalendarTaskItem({
  task,
  saving,
  onToggle,
  onSelect,
}: {
  task: CalendarTask;
  saving: boolean;
  onToggle: (task: CalendarTask, done: boolean) => void;
  onSelect: (task: CalendarTask) => void;
}) {
  const done = task.status === "DONE";
  const description = `${task.teamName} · ${task.teamAssignmentTitle} 할 일 ${task.title}, ${statusLabel[task.status]}`;

  return (
    <li className="flex min-w-0 items-start gap-0.5">
      <label className="flex min-h-9 shrink-0 cursor-pointer items-start px-0.5 pt-1">
        <input
          type="checkbox"
          checked={done}
          disabled={saving}
          aria-label={`${task.title} 완료`}
          onChange={(event) => onToggle(task, event.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer accent-emerald-600 disabled:cursor-wait"
        />
      </label>
      <button
        type="button"
        aria-haspopup="dialog"
        title={`${task.title} / ${task.teamName} · ${task.teamAssignmentTitle} / ${statusLabel[task.status]}`}
        aria-label={description}
        onClick={() => onSelect(task)}
        className="block min-h-9 min-w-0 flex-1 rounded px-0.5 py-0.5 text-left text-[11px] leading-tight hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        <span
          aria-hidden="true"
          className={`block truncate font-medium ${done ? "text-zinc-400 line-through" : "text-zinc-900"}`}
        >
          {task.title}
        </span>
        <span aria-hidden="true" className="block truncate text-zinc-500">
          {task.teamName}
          {task.status === "IN_PROGRESS" ? " · 진행 중" : ""}
        </span>
      </button>
    </li>
  );
}
