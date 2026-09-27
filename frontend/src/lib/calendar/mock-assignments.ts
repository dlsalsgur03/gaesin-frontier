import { dateKey } from "./dates";
import type { CalendarAssignment } from "./types";

/**
 * 화면을 처음 연 달 기준의 예시 데이터. 월 이동 시 다시 생성하지 않는다.
 * 실제 모델의 시작일과 마감일은 nullable이므로 API 연결 시 날짜 정책이 필요하다.
 * createdAt을 시작일로 간주하거나 Schedule에 별도 저장하지 않는다.
 */
export function createMockAssignments(
  referenceDate: Date,
): CalendarAssignment[] {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const date = (day: number) => dateKey(new Date(year, month, day));
  const day = referenceDate.getDate();
  const firstSunday = 1 + ((7 - new Date(year, month, 1).getDay()) % 7);
  const monthEnd = new Date(year, month + 1, 0).getDate();

  return [
    {
      id: "1",
      kind: "personal",
      title: "지난달 학습 내용 정리",
      startDate: date(-2),
      dueDate: date(3),
      status: "DONE",
    },
    {
      id: "2",
      kind: "personal",
      title: "자료구조 연습 문제",
      startDate: date(day - 2),
      dueDate: date(day + 2),
      status: "TODO",
    },
    {
      id: "3",
      kind: "personal",
      title: "온라인 퀴즈 제출",
      startDate: date(day),
      dueDate: date(day),
      status: "TODO",
    },
    {
      id: "4",
      kind: "personal",
      title: "강의 복습 노트",
      startDate: date(day - 1),
      dueDate: date(day),
      status: "DONE",
    },
    {
      id: "5",
      kind: "personal",
      title: "다음 달 발표 준비",
      startDate: date(monthEnd - 2),
      dueDate: date(monthEnd + 4),
      status: "TODO",
    },
    {
      id: "1",
      kind: "team",
      teamId: "1",
      teamName: "개신프론티어",
      title: "협업 서비스 프로젝트",
      startDate: date(-3),
      dueDate: date(monthEnd + 5),
      status: "TODO",
    },
    {
      id: "2",
      kind: "team",
      teamId: "1",
      teamName: "개신프론티어",
      title: "요구사항 정리",
      startDate: date(firstSunday + 5),
      dueDate: date(firstSunday + 9),
      status: "DONE",
    },
    {
      id: "3",
      kind: "team",
      teamId: "2",
      teamName: "데이터베이스 스터디",
      title: "ERD 설계 및 검토",
      startDate: date(day - 1),
      dueDate: date(day + 3),
      status: "TODO",
    },
    {
      id: "4",
      kind: "team",
      teamId: "2",
      teamName: "데이터베이스 스터디",
      title: "설계안 최종 제출",
      startDate: date(day + 1),
      dueDate: date(day + 1),
      status: "DONE",
    },
  ];
}
