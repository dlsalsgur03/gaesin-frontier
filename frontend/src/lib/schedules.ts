import { dateKey } from "./calendar/dates";

/**
 * 팀 일정. 과제와 달리 시각까지 있으며 API는 UTC ISO 시각(…Z)을 주고받는다.
 * 화면은 브라우저 시간대로 바꿔 보여주고, 입력값은 브라우저 시간대 기준으로 해석해 ISO로 보낸다.
 * 종료 시각이 시작과 같으면 한 시점의 일정이다. 완료 표시는 없다(할 일에만 쓴다).
 */
export type Schedule = {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

/** ISO 시각 → datetime-local 입력값(YYYY-MM-DDTHH:mm, 브라우저 시간대) */
export function toLocalInput(iso: string) {
  const date = new Date(iso);
  return `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local 입력값(브라우저 시간대) → ISO 시각. 잘못된 값이면 null */
export function fromLocalInput(value: string) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

/** 새 일정의 기본 시작 시각: 지금을 10분 단위로 올린 값 */
export function defaultStartInput(now = new Date()) {
  const date = new Date(now);
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil(date.getMinutes() / 10) * 10);
  return toLocalInput(date.toISOString());
}

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
});

export const formatTime = (iso: string) => timeFormat.format(new Date(iso));

/** 목록용 시각 표시. 같은 날 끝나면 종료는 시각만 쓴다. */
export function formatScheduleRange(
  schedule: Pick<Schedule, "startAt" | "endAt">,
) {
  const start = new Date(schedule.startAt);
  const end = new Date(schedule.endAt);
  const startText = `${dateFormat.format(start)} ${timeFormat.format(start)}`;
  if (start.getTime() === end.getTime()) return startText;
  return dateKey(start) === dateKey(end)
    ? `${startText} ~ ${timeFormat.format(end)}`
    : `${startText} ~ ${dateFormat.format(end)} ${timeFormat.format(end)}`;
}

/** 일정이 걸치는 브라우저 기준 날짜(YYYY-MM-DD)인지 */
export function scheduleCoversDay(schedule: Schedule, key: string) {
  return (
    dateKey(new Date(schedule.startAt)) <= key &&
    dateKey(new Date(schedule.endAt)) >= key
  );
}
