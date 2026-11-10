"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import {
  assignmentStatuses,
  statusClass,
  statusLabel,
  type AssignmentStatus,
} from "@/lib/assignment-status";
import { dateKey } from "@/lib/calendar/dates";
import type { TeamAssignment, TeamMember, TeamTask } from "@/lib/teams";
import AssignmentEditorDialog from "../calendar/assignment-editor-dialog";
import TaskDialog from "./task-dialog";
import FilePanel from "../files/file-panel";
import { useTeamChanged } from "@/lib/realtime";

const buttonClass =
  "min-h-10 shrink-0 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50";

/** 팀 과제 상세와 할 일 목록. 할 일의 진행 상태는 목록에서 바로 바꿀 수 있다. */
export default function TeamAssignmentDetail({
  id,
  team,
  members,
  onBack,
  onGone,
}: {
  id: string;
  team: { id: string; name: string };
  members: TeamMember[];
  onBack: () => void;
  /** 삭제되었거나 더 이상 볼 수 없는 과제일 때 */
  onGone: (message: string) => void;
}) {
  const router = useRouter();
  const busyRef = useRef(false);
  // 부모가 매 렌더마다 새로 만드는 콜백이 재조회를 일으키지 않도록 ref로 읽는다.
  const onGoneRef = useRef(onGone);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    revision: number;
    assignment: TeamAssignment | null;
    tasks: TeamTask[];
    error: string;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [taskEditor, setTaskEditor] = useState<{ task?: TeamTask } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // 재조회 중에도 이전 내용을 그대로 보여 상태를 바꿀 때마다 화면이 깜빡이지 않게 한다.
  const current = result;
  const reloading = result?.revision !== revision;
  const assignment = current?.assignment;
  const tasks = current?.tasks ?? [];

  useEffect(() => {
    onGoneRef.current = onGone;
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const options = { signal: controller.signal };
    Promise.all([
      apiRequest<{ assignment: TeamAssignment }>(
        `/team-assignments/${id}`,
        options,
      ),
      apiRequest<{ tasks: TeamTask[] }>(
        `/team-assignments/${id}/tasks`,
        options,
      ),
    ])
      .then(([detail, list]) => {
        if (active)
          setResult({
            revision,
            assignment: detail.assignment,
            tasks: list.tasks,
            error: "",
          });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401)
          router.replace("/login");
        // 다른 팀원이 삭제했거나 팀에서 나간 경우다.
        if (error instanceof ApiError && error.status === 404)
          return onGoneRef.current("팀 과제를 더 이상 볼 수 없습니다.");
        setResult({
          revision,
          assignment: null,
          tasks: [],
          error:
            error instanceof Error
              ? error.message
              : "팀 과제를 불러오지 못했습니다.",
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, revision, router]);

  // 다른 팀원이 과제·할 일을 바꾸면 지금 내용을 보인 채로 다시 불러온다.
  // 내 요청을 처리하는 중이면 그 요청이 끝난 뒤 다시 불러오므로 건너뛴다(삭제 중 404 방지).
  useTeamChanged(team.id, "assignments", () => {
    if (!busyRef.current) setRevision((value) => value + 1);
  });

  async function changeStatus(task: TeamTask, status: AssignmentStatus) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // PUT은 전체 수정이므로 바꾸지 않는 값도 그대로 보낸다.
      await apiRequest(`/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate,
          status,
        }),
      });
      setNotice(`상태를 바꿨습니다: ${task.title} → ${statusLabel[status]}`);
      setRevision((value) => value + 1);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401)
        router.replace("/login");
      setError(
        error instanceof Error
          ? error.message
          : "상태를 바꾸지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const back = (
    <button type="button" className={buttonClass} onClick={onBack}>
      ← 과제 목록
    </button>
  );

  if (!current)
    return (
      <div className="space-y-4">
        {back}
        <p role="status" className="py-8 text-center text-zinc-500">
          팀 과제를 불러오고 있습니다.
        </p>
      </div>
    );

  if (!assignment)
    return (
      <div className="space-y-4">
        {back}
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
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {back}
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClass}
            disabled={busy || reloading}
            onClick={() => setRevision((value) => value + 1)}
          >
            새로고침
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => setEditing(true)}
          >
            과제 수정
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="min-w-0 break-words text-lg font-bold">
            {assignment.title}
          </h3>
          <span
            className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${statusClass[assignment.status]}`}
          >
            {statusLabel[assignment.status]}
          </span>
        </div>
        <p className="text-sm tabular-nums text-zinc-500">
          {assignment.startDate || "시작일 미정"} ~{" "}
          {assignment.dueDate || "마감일 미정"}
        </p>
        {assignment.description && (
          <p className="whitespace-pre-wrap break-words text-sm text-zinc-700">
            {assignment.description}
          </p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-blue-700">
          {notice}
        </p>
      )}

      <section aria-labelledby={`tasks-${id}`} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 id={`tasks-${id}`} className="font-semibold">
              할 일
            </h4>
            <p className="text-sm text-zinc-500">
              {assignment.doneTaskCount}/{assignment.taskCount} 완료
            </p>
          </div>
          <button
            type="button"
            className={`${buttonClass} border-blue-600 bg-blue-600 text-white`}
            onClick={() => setTaskEditor({})}
          >
            할 일 추가
          </button>
        </div>
        {tasks.length === 0 ? (
          <p className="rounded-xl bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
            아직 할 일이 없습니다. 역할을 나눠 할 일을 추가해보세요.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`break-words font-medium ${task.status === "DONE" ? "text-zinc-400 line-through" : "text-zinc-900"}`}
                  >
                    {task.title}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {task.assigneeNickname ?? "미배정"}
                    {" · "}
                    {task.dueDate ? `${task.dueDate} 마감` : "마감일 없음"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <select
                    aria-label={`${task.title} 진행 상태`}
                    value={task.status}
                    disabled={busy || reloading}
                    onChange={(event) =>
                      void changeStatus(
                        task,
                        event.target.value as AssignmentStatus,
                      )
                    }
                    className="min-h-10 rounded-lg border border-zinc-300 bg-white px-2 text-sm"
                  >
                    {assignmentStatuses.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={buttonClass}
                    aria-label={`${task.title} 수정`}
                    onClick={() => setTaskEditor({ task })}
                  >
                    수정
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FilePanel
        target={{ kind: "team", teamId: team.id, assignmentId: assignment.id }}
        heading="연결된 파일"
        level={4}
      />

      {editing && (
        <AssignmentEditorDialog
          id={assignment.id}
          team={team}
          initialDate={dateKey(new Date())}
          onClose={() => setEditing(false)}
          onSaved={(date) => {
            setEditing(false);
            if (!date) return onGone("팀 과제를 삭제했습니다.");
            setNotice("팀 과제를 저장했습니다.");
            setRevision((value) => value + 1);
          }}
        />
      )}
      {taskEditor && (
        <TaskDialog
          assignmentId={assignment.id}
          task={taskEditor.task}
          members={members}
          onClose={() => setTaskEditor(null)}
          onSaved={(message) => {
            setTaskEditor(null);
            setError("");
            setNotice(message);
            setRevision((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
