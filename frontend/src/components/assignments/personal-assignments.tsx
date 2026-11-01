"use client";

import {
  assignmentStatuses,
  statusLabel,
  statusClass,
  type AssignmentStatus,
} from "@/lib/assignment-status";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { dateKey } from "@/lib/calendar/dates";
import PersonalAssignmentDialog from "../calendar/personal-assignment-dialog";

type Assignment = {
  id: string;
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  status: AssignmentStatus;
};
const filters = [
  { value: "all", label: "전체" },
  ...assignmentStatuses,
] as const;
const buttonClass =
  "min-h-10 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50";

export default function PersonalAssignments() {
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] =
    useState<(typeof filters)[number]["value"]>("all");
  const [editor, setEditor] = useState<{ id?: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{
    revision: number;
    assignments: Assignment[];
    error: string;
  } | null>(null);
  const current = result?.revision === revision ? result : null;
  const assignments = current?.assignments ?? [];
  const visible = assignments.filter(
    (task) => filter === "all" || task.status === filter,
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    apiRequest<{ assignments: Assignment[] }>("/assignments", {
      signal: controller.signal,
    })
      .then((data) => {
        if (active)
          setResult({ revision, assignments: data.assignments, error: "" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401)
          router.replace("/login");
        setResult({
          revision,
          assignments: [],
          error:
            error instanceof Error
              ? error.message
              : "과제를 불러오지 못했습니다.",
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [revision, router]);

  return (
    <section
      aria-labelledby="personal-title"
      className="rounded-2xl border border-zinc-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 p-5 sm:p-7">
        <div>
          <h2 id="personal-title" className="text-xl font-bold">
            개인 과제
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            날짜와 관계없이 내 과제를 모두 확인하고 관리하세요.
          </p>
        </div>
        <button
          type="button"
          className={`${buttonClass} bg-blue-600 text-white`}
          onClick={() => setEditor({})}
        >
          개인 과제 등록
        </button>
      </div>
      <div className="space-y-4 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="과제 상태 필터"
            className="flex gap-1 rounded-xl bg-zinc-100 p-1"
          >
            {filters.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-10 rounded-lg px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 ${filter === value ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={buttonClass}
            disabled={!current}
            onClick={() => setRevision((value) => value + 1)}
          >
            새로고침
          </button>
        </div>
        {notice && (
          <p role="status" className="text-sm text-blue-700">
            {notice}
          </p>
        )}
        {!current ? (
          <p role="status" className="py-8 text-center text-zinc-500">
            과제를 불러오고 있습니다.
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
              전체 {assignments.length}개 · 표시 {visible.length}개 · 최근
              등록순
            </p>
            {visible.length === 0 ? (
              <p className="rounded-xl bg-zinc-50 px-4 py-12 text-center text-zinc-500">
                {assignments.length === 0
                  ? "아직 개인 과제가 없습니다. 첫 과제를 등록해보세요."
                  : "선택한 상태의 과제가 없습니다."}
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {visible.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => setEditor({ id: task.id })}
                      aria-label={`${task.title} 수정`}
                      className="flex w-full flex-col gap-3 rounded-lg px-3 py-5 text-left hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-600 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-semibold text-zinc-900">
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="mt-1 line-clamp-2 break-words text-sm text-zinc-500">
                            {task.description}
                          </p>
                        )}
                        <p className="mt-2 text-sm tabular-nums text-zinc-500">
                          {task.startDate || "시작일 미정"} ~{" "}
                          {task.dueDate || "마감일 미정"}
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
      </div>
      {editor && (
        <PersonalAssignmentDialog
          id={editor.id}
          initialDate={dateKey(new Date())}
          onClose={() => setEditor(null)}
          onSaved={(date) => {
            setEditor(null);
            setFilter("all");
            setNotice(date ? "과제를 저장했습니다." : "과제를 삭제했습니다.");
            setRevision((value) => value + 1);
          }}
        />
      )}
    </section>
  );
}
