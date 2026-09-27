/** API 응답을 변환해서 전달할 화면용 모델. 날짜는 지역 날짜 YYYY-MM-DD 형식이다. */
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
