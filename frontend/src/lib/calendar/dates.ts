export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function moveMonth(month: Date, offset: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1);
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** 일요일부터 시작하는 6주. 시간을 더하지 않고 날짜를 계산해 DST에도 대응한다. */
export function getMonthWeeks(month: Date): Date[][] {
  const firstDay = startOfMonth(month);
  const startDay = 1 - firstDay.getDay();

  return Array.from({ length: 6 }, (_, week) =>
    Array.from(
      { length: 7 },
      (_, day) =>
        new Date(
          month.getFullYear(),
          month.getMonth(),
          startDay + week * 7 + day,
        ),
    ),
  );
}
