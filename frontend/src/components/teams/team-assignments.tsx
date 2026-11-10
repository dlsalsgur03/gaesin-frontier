"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import {
  assignmentStatuses,
  statusClass,
  statusLabel,
} from "@/lib/assignment-status";
import { dateKey } from "@/lib/calendar/dates";
import type { TeamAssignment, TeamMember } from "@/lib/teams";
import AssignmentEditorDialog from "../calendar/assignment-editor-dialog";
import { useTeamChanged } from "@/lib/realtime";
import TeamAssignmentDetail from "./team-assignment-detail";

const filters = [
  { value: "all", label: "전체" },
  ...assignmentStatuses,
] as const;
const buttonClass =
  "min-h-10 shrink-0 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50";

/** 팀룸의 과제 탭. 목록에서 과제를 고르면 할 일을 관리하는 상세 화면으로 바뀐다. */
export default function TeamAssignments({
  team,
  members,
}: {
  team: { id: string; name: string };
  members: TeamMember[];
}) {
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  /** 다른 팀원의 변경을 반영하는 조용한 재조회. 지금 목록을 보인 채로 다시 불러온다. */
  const [quiet, setQuiet] = useState(0);
  const [result, setResult] = useState<{
    revision: number;
    assignments: TeamAssignment[];
    error: string;
  } | null>(null);
  const [filter, setFilter] =
    useState<(typeof filters)[number]["value"]>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const current = result?.revision === revision ? result : null;
  const assignments = current?.assignments ?? [];
  const visible = assignments.filter(
    (task) => filter === "all" || task.status === filter,
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    apiRequest<{ assignments: TeamAssignment[] }>(
      `/teams/${team.id}/assignments`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (active)
          setResult({ revision, assignments: data.assignments, error: "" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401)
          router.replace("/login");
        // 조용한 재조회가 실패하면 지금 목록을 그대로 둔다.
        setResult((previous) =>
          previous?.revision === revision && !previous.error
            ? previous
            : {
                revision,
                assignments: [],
                error:
                  error instanceof Error
                    ? error.message
                    : "팀 과제를 불러오지 못했습니다.",
              },
        );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [team.id, revision, quiet, router]);

  useTeamChanged(team.id, "assignments", () => setQuiet((value) => value + 1));

  if (selected)
    return (
      <TeamAssignmentDetail
        key={selected}
        id={selected}
        team={team}
        members={members}
        onBack={() => {
          setSelected(null);
          setNotice("");
          setRevision((value) => value + 1);
        }}
        onGone={(message) => {
          setSelected(null);
          setNotice(message);
          setRevision((value) => value + 1);
        }}
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="팀 과제 상태 필터"
          className="flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1"
        >
          {filters.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`min-h-10 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 ${filter === value ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={!current}
            onClick={() => setRevision((value) => value + 1)}
          >
            새로고침
          </button>
          <button
            type="button"
            className={`${buttonClass} border-blue-600 bg-blue-600 text-white`}
            onClick={() => setCreating(true)}
          >
            팀 과제 등록
          </button>
        </div>
      </div>
      {notice && (
        <p role="status" className="text-sm text-blue-700">
          {notice}
        </p>
      )}
      {!current ? (
        <p role="status" className="py-8 text-center text-zinc-500">
          팀 과제를 불러오고 있습니다.
        </p>
      ) : current.error ? (
        <div
          role="alert"
          className="space-y-3 rounded-xl bg-red-50 p-4 text-red-700"
        >
          <p>{current.error}</p>
          <button
            type="button"
            className={buttonClass}
            onClick={() => setRevision((value) => value + 1)}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <>
          <p role="status" className="text-sm text-zinc-500">
            전체 {assignments.length}개 · 표시 {visible.length}개 · 마감일순
          </p>
          {visible.length === 0 ? (
            <p className="rounded-xl bg-zinc-50 px-4 py-12 text-center text-zinc-500">
              {assignments.length === 0
                ? "아직 팀 과제가 없습니다. 첫 과제를 등록해보세요."
                : "선택한 상태의 과제가 없습니다."}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {visible.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setNotice("");
                      setSelected(task.id);
                    }}
                    aria-label={`${task.title} 열기`}
                    className="flex w-full flex-col gap-2 rounded-lg px-3 py-4 text-left hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-600 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-zinc-900">
                        {task.title}
                      </p>
                      <p className="mt-1 text-sm tabular-nums text-zinc-500">
                        {task.startDate || "시작일 미정"} ~{" "}
                        {task.dueDate || "마감일 미정"}
                        {" · "}할 일 {task.doneTaskCount}/{task.taskCount} 완료
                      </p>
                    </div>
                    <span
                      className={`shrink-0 self-start rounded-md px-2 py-1 text-xs font-semibold ${statusClass[task.status]}`}
                    >
                      {statusLabel[task.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {creating && (
        <AssignmentEditorDialog
          team={team}
          initialDate={dateKey(new Date())}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setNotice("팀 과제를 등록했습니다.");
            setRevision((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
