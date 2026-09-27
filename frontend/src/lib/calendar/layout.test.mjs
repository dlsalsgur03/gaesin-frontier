import assert from "node:assert/strict";
import test from "node:test";
import { dateKey, getMonthWeeks, moveMonth } from "./dates.ts";
import { layoutWeekAssignments } from "./layout.ts";

const week = [
  "2026-09-13",
  "2026-09-14",
  "2026-09-15",
  "2026-09-16",
  "2026-09-17",
  "2026-09-18",
  "2026-09-19",
];
const assignment = (id, startDate, dueDate, extra = {}) => ({
  id,
  kind: "personal",
  title: `과제 ${id}`,
  startDate,
  dueDate,
  status: "TODO",
  ...extra,
});

test("시작일·마감일을 모두 포함하고 하루짜리 과제는 한 칸을 사용한다", () => {
  const { segments } = layoutWeekAssignments(
    [assignment("1", week[1], week[3]), assignment("2", week[5], week[5])],
    week,
  );
  assert.deepEqual(
    segments.map(({ column, span }) => [column, span]),
    [
      [2, 3],
      [6, 1],
    ],
  );
});

test("기간의 끝 날짜가 겹치면 다른 줄, 다음 날 시작이면 같은 줄에 배치한다", () => {
  const { segments, laneCount } = layoutWeekAssignments(
    [
      assignment("1", week[0], week[2]),
      assignment("2", week[2], week[3]),
      assignment("3", week[3], week[4]),
    ],
    week,
  );
  assert.deepEqual(
    segments.map(({ lane }) => lane),
    [1, 2, 1],
  );
  assert.equal(laneCount, 2);
});

test("주 경계를 넘는 과제를 자르고 이어짐을 표시한다", () => {
  const { segments } = layoutWeekAssignments(
    [
      assignment("1", "2026-09-10", "2026-09-22"),
      assignment("2", "2026-09-12", "2026-09-14"),
      assignment("3", "2026-09-18", "2026-09-20"),
    ],
    week,
  );
  assert.deepEqual(
    segments.map(({ column, span, continuesBefore, continuesAfter }) => [
      column,
      span,
      continuesBefore,
      continuesAfter,
    ]),
    [
      [1, 7, true, true],
      [1, 2, true, false],
      [6, 2, false, true],
    ],
  );
});

test("월 경계 과제가 양쪽 달에 같은 기간으로 표시된다", () => {
  const tasks = [assignment("1", "2026-09-29", "2026-10-03")];
  for (const month of [new Date(2026, 8, 1), new Date(2026, 9, 1)]) {
    const segments = getMonthWeeks(month).flatMap(
      (dates) => layoutWeekAssignments(tasks, dates.map(dateKey)).segments,
    );
    assert.equal(segments.length, 1);
    assert.equal(segments[0].column, 3);
    assert.equal(segments[0].span, 5);
    assert.equal(segments[0].assignment, tasks[0]);
  }
});

test("연도 경계와 여러 주를 넘는 전체 기간에서 날짜 누락·중복이 없다", () => {
  const task = assignment("1", "2025-12-29", "2026-01-15");
  const displayedDates = getMonthWeeks(new Date(2026, 0, 1)).flatMap(
    (dates) => {
      const keys = dates.map(dateKey);
      return layoutWeekAssignments([task], keys).segments.flatMap((segment) =>
        keys.slice(segment.column - 1, segment.column - 1 + segment.span),
      );
    },
  );
  assert.equal(displayedDates.length, 18);
  assert.equal(new Set(displayedDates).size, 18);
  assert.equal(displayedDates[0], task.startDate);
  assert.equal(displayedDates.at(-1), task.dueDate);
});

test("같은 ID의 개인·팀 과제와 완료 과제도 독립적으로 표시한다", () => {
  const { segments, laneCount } = layoutWeekAssignments(
    [
      assignment("1", week[0], week[6], { status: "DONE" }),
      assignment("1", week[0], week[6], {
        kind: "team",
        teamId: "1",
        teamName: "테스트 팀",
      }),
    ],
    week,
  );
  assert.equal(laneCount, 2);
  assert.deepEqual(
    segments.map((segment) => segment.key),
    ["personal:1", "team:1"],
  );
});

test("빈 주·범위 밖·역전된 기간은 막대를 만들지 않는다", () => {
  assert.deepEqual(layoutWeekAssignments([], week), {
    segments: [],
    laneCount: 0,
  });
  assert.deepEqual(
    layoutWeekAssignments([assignment("1", week[0], week[6])], []),
    { segments: [], laneCount: 0 },
  );
  assert.equal(
    layoutWeekAssignments(
      [
        assignment("1", "2026-09-01", "2026-09-12"),
        assignment("2", "2026-09-20", "2026-09-30"),
        assignment("3", week[4], week[0]),
      ],
      week,
    ).segments.length,
    0,
  );
});

test("입력 순서에 관계없이 배치가 같고 원본 배열을 변경하지 않는다", () => {
  const tasks = [
    assignment("2", week[2], week[4]),
    assignment("1", week[0], week[6]),
  ];
  const original = structuredClone(tasks);
  assert.deepEqual(
    layoutWeekAssignments(tasks, week),
    layoutWeekAssignments([...tasks].reverse(), week),
  );
  assert.deepEqual(tasks, original);
});

test("겹치는 과제 30개도 모두 별도 줄에 배치한다", () => {
  const { segments, laneCount } = layoutWeekAssignments(
    Array.from({ length: 30 }, (_, index) =>
      assignment(String(index), week[2], week[3]),
    ),
    week,
  );
  assert.equal(segments.length, 30);
  assert.equal(laneCount, 30);
  assert.equal(new Set(segments.map((segment) => segment.lane)).size, 30);
});

test("윤년과 연도 이동에서도 42일 달력에 모든 날짜가 포함된다", () => {
  const days = getMonthWeeks(new Date(2024, 1, 1)).flat();
  assert.equal(days.length, 42);
  assert.equal(days.filter((date) => date.getMonth() === 1).length, 29);
  assert.equal(days[0].getDay(), 0);
  assert.equal(days.at(-1).getDay(), 6);
  assert.equal(dateKey(moveMonth(new Date(2026, 11, 31), 1)), "2027-01-01");
  assert.equal(dateKey(moveMonth(new Date(2026, 0, 31), -1)), "2025-12-01");
});
