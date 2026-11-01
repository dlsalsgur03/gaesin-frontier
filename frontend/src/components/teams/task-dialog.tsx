"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import {
  assignmentStatuses,
  type AssignmentStatus,
} from "@/lib/assignment-status";
import type { TeamMember, TeamTask } from "@/lib/teams";

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900";
const buttonClass =
  "min-h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50";

type Form = {
  title: string;
  description: string;
  assigneeId: string;
  dueDate: string;
  status: AssignmentStatus;
};

/** 할 일 등록·수정·삭제 창. task가 있으면 수정, 없으면 assignmentId에 새로 만든다. */
export default function TaskDialog({
  assignmentId,
  task,
  members,
  onClose,
  onSaved,
}: {
  assignmentId: string;
  task?: TeamTask;
  members: TeamMember[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const [form, setForm] = useState<Form>({
    title: task?.title ?? "",
    description: task?.description ?? "",
    assigneeId: task?.assigneeId ?? "",
    dueDate: task?.dueDate ?? "",
    status: task?.status ?? "TODO",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);

  async function mutate(remove = false) {
    if (busyRef.current) return;
    setError("");
    if (!remove && !form.title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await apiRequest(
        task ? `/tasks/${task.id}` : `/team-assignments/${assignmentId}/tasks`,
        {
          method: remove ? "DELETE" : task ? "PUT" : "POST",
          ...(remove
            ? {}
            : {
                body: JSON.stringify({
                  title: form.title.trim(),
                  description: form.description,
                  assigneeId: form.assigneeId || null,
                  dueDate: form.dueDate || null,
                  status: form.status,
                }),
              }),
        },
      );
      onSaved(
        remove
          ? "할 일을 삭제했습니다."
          : task
            ? "할 일을 저장했습니다."
            : "할 일을 추가했습니다.",
      );
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401)
        router.replace("/login");
      setError(
        error instanceof Error
          ? error.message
          : "저장하지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busyRef.current) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl backdrop:bg-zinc-950/40 sm:p-7"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-xl font-bold">
          {task ? "할 일 수정" : "할 일 추가"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className={buttonClass}
          aria-label="할 일 창 닫기"
        >
          닫기
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          void mutate();
        }}
      >
        <fieldset disabled={busy} className="space-y-4">
          <label className="block text-sm font-medium">
            제목 <span className="text-zinc-500">(필수)</span>
            <input
              required
              maxLength={100}
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
              className={inputClass}
            />
          </label>
          <label className="block text-sm font-medium">
            설명
            <textarea
              rows={3}
              maxLength={10000}
              value={form.description}
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              className={inputClass}
            />
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              담당자
              <select
                value={form.assigneeId}
                onChange={(event) =>
                  setForm({ ...form, assigneeId: event.target.value })
                }
                className={inputClass}
              >
                <option value="">미배정</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.nickname}
                    {member.isMe ? " (나)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              마감일 <span className="text-zinc-500">(선택)</span>
              <input
                type="date"
                min="1000-01-01"
                max="9999-12-31"
                value={form.dueDate}
                onChange={(event) =>
                  setForm({ ...form, dueDate: event.target.value })
                }
                className={inputClass}
              />
            </label>
          </div>
          <label className="block text-sm font-medium">
            진행 상태
            <select
              value={form.status}
              onChange={(event) =>
                setForm({
                  ...form,
                  status: event.target.value as AssignmentStatus,
                })
              }
              className={inputClass}
            >
              {assignmentStatuses.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {confirmDelete ? (
            <div className="rounded-lg bg-red-50 p-4">
              <p className="text-sm text-red-800">
                이 할 일을 삭제할까요? 삭제하면 되돌릴 수 없습니다.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void mutate(true)}
                  className={`${buttonClass} text-red-700`}
                >
                  {busy ? "삭제 중..." : "삭제 확인"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className={buttonClass}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-between gap-3 pt-2">
              {task && (
                <button
                  type="button"
                  className={`${buttonClass} text-red-700`}
                  onClick={() => setConfirmDelete(true)}
                >
                  삭제
                </button>
              )}
              <button
                type="submit"
                className={`${buttonClass} ml-auto bg-blue-600 text-white`}
              >
                {busy ? "저장 중..." : task ? "변경 사항 저장" : "할 일 추가"}
              </button>
            </div>
          )}
        </fieldset>
      </form>
    </dialog>
  );
}
