import type { AssignmentSegment, CalendarAssignment } from "./types";

/**
 * 연속된 한 주의 YYYY-MM-DD 날짜에 과제를 배치한다.
 * 날짜 문자열끼리 비교하므로 UTC 변환이나 DST로 날짜가 밀리지 않는다.
 * 시작일과 마감일 모두 포함하며 같은 날짜를 차지하면 서로 다른 줄을 쓴다.
 */
export function layoutWeekAssignments(
  assignments: readonly CalendarAssignment[],
  weekDates: readonly string[],
): { segments: AssignmentSegment[]; laneCount: number } {
  if (weekDates.length === 0) return { segments: [], laneCount: 0 };

  const firstDate = weekDates[0];
  const lastDate = weekDates[weekDates.length - 1];
  const visible = assignments
    .filter(
      ({ startDate, dueDate }) =>
        startDate <= dueDate && startDate <= lastDate && dueDate >= firstDate,
    )
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        b.dueDate.localeCompare(a.dueDate) ||
        `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`),
    );

  const laneEnds: number[] = [];
  const segments = visible.map((assignment): AssignmentSegment => {
    const firstIndex = weekDates.findIndex(
      (date) => date >= assignment.startDate,
    );
    const afterLastIndex = weekDates.findIndex(
      (date) => date > assignment.dueDate,
    );
    const lastIndex =
      afterLastIndex === -1 ? weekDates.length - 1 : afterLastIndex - 1;
    let lane = laneEnds.findIndex((end) => end < firstIndex);

    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = lastIndex;

    return {
      key: `${assignment.kind}:${assignment.id}`,
      assignment,
      column: firstIndex + 1,
      span: lastIndex - firstIndex + 1,
      lane: lane + 1,
      continuesBefore: assignment.startDate < firstDate,
      continuesAfter: assignment.dueDate > lastDate,
    };
  });

  return { segments, laneCount: laneEnds.length };
}
