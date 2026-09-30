/** 캘린더 API 응답 모델. 날짜는 UTC 기준 YYYY-MM-DD이며 화면에서 시간대 변환 없이 표시한다. */
type AssignmentBase = {
  /** Prisma BigInt ID는 API에서 문자열로 전달받는다. */
  id: string;
  title: string;
  startDate: string;
  dueDate: string;
  status: "TODO" | "DONE";
};

export type CalendarAssignment = AssignmentBase &
  ({ kind: "personal" } | { kind: "team"; teamId: string; teamName: string });

export type AssignmentSegment = {
  key: string;
  assignment: CalendarAssignment;
  /** CSS Grid에 사용할 1부터 시작하는 열과 행. */
  column: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};
