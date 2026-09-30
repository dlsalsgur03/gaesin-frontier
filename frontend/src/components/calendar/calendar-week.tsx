import { dateKey } from "@/lib/calendar/dates";
import { layoutWeekAssignments } from "@/lib/calendar/layout";
import type { CalendarAssignment } from "@/lib/calendar/types";

type CalendarWeekProps = {
  dates: Date[];
  month: Date;
  todayKey: string;
  assignments: readonly CalendarAssignment[];
  onSelectAssignment: (assignment: CalendarAssignment) => void;
};

export default function CalendarWeek({
  dates,
  month,
  todayKey,
  assignments,
  onSelectAssignment,
}: CalendarWeekProps) {
  const { segments } = layoutWeekAssignments(assignments, dates.map(dateKey));

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
              const isTeam = assignment.kind === "team";
              const isDone = assignment.status === "DONE";
              const label = isTeam ? `팀 · ${assignment.teamName}` : "개인";
              const description = `${assignment.title} / ${label} / ${assignment.startDate} ~ ${assignment.dueDate} / ${isDone ? "완료" : "미완료"}`;
              const color = isTeam
                ? isDone
                  ? "border-purple-100 bg-purple-50 text-purple-800"
                  : "border-purple-200 bg-purple-100 text-purple-950"
                : isDone
                  ? "border-blue-100 bg-blue-50 text-blue-800"
                  : "border-blue-200 bg-blue-100 text-blue-950";

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
                      <span className="min-w-0 flex-1 truncate">
                        {assignment.title}
                      </span>
                      {continuesAfter && <span>›</span>}
                    </div>
                    <p
                      aria-hidden="true"
                      className="mt-0.5 truncate text-[11px]"
                    >
                      {label}
                      {isDone && " · 완료"}
                    </p>
                  </button>
                </li>
              );
            },
          )}
        </ul>
      )}
    </section>
  );
}
