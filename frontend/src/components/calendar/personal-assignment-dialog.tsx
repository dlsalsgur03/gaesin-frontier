"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";

type Task = {
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  status: "TODO" | "DONE";
};
const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900";
const buttonClass =
  "min-h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50";

export default function PersonalAssignmentDialog({
  id,
  initialDate,
  onClose,
  onSaved,
}: {
  id?: string;
  initialDate: string;
  onClose: () => void;
  onSaved: (date?: string) => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const [task, setTask] = useState<Task>({
    title: "",
    description: "",
    startDate: initialDate,
    dueDate: initialDate,
    status: "TODO",
  });
  const [loading, setLoading] = useState(Boolean(id));
  const [loaded, setLoaded] = useState(!id);
  const [revision, setRevision] = useState(0);
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

  useEffect(() => {
    if (!id) return;
    let active = true;
    const controller = new AbortController();
    apiRequest<{ assignment: Task }>(`/assignments/${id}`, {
      signal: controller.signal,
    })
      .then(({ assignment }) => {
        if (active) {
          setTask({
            title: assignment.title,
            description: assignment.description,
            startDate: assignment.startDate,
            dueDate: assignment.dueDate,
            status: assignment.status,
          });
          setLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401)
          router.replace("/login");
        setError(
          error instanceof Error
            ? error.message
            : "과제를 불러오지 못했습니다.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, revision, router]);

  async function mutate(remove = false) {
    if (busyRef.current) return;
    setError("");
    if (!remove && (!task.title.trim() || task.startDate > task.dueDate)) {
      setError(
        !task.title.trim()
          ? "제목을 입력해주세요."
          : "마감일은 시작일 이후여야 합니다.",
      );
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      await apiRequest(id ? `/assignments/${id}` : "/assignments", {
        method: remove ? "DELETE" : id ? "PUT" : "POST",
        ...(remove
          ? {}
          : { body: JSON.stringify({ ...task, title: task.title.trim() }) }),
      });
      onSaved(remove ? undefined : task.startDate);
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
          {id ? "개인 과제 수정" : "개인 과제 등록"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className={buttonClass}
          aria-label="과제 창 닫기"
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
      {loading ? (
        <p role="status" className="py-8">
          과제를 불러오고 있습니다.
        </p>
      ) : !loaded ? (
        <button
          type="button"
          className={`${buttonClass} mt-4`}
          onClick={() => {
            setError("");
            setLoading(true);
            setRevision((value) => value + 1);
          }}
        >
          다시 시도
        </button>
      ) : (
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
                value={task.title}
                onChange={(event) =>
                  setTask({ ...task, title: event.target.value })
                }
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium">
              설명
              <textarea
                rows={4}
                maxLength={10000}
                value={task.description}
                onChange={(event) =>
                  setTask({ ...task, description: event.target.value })
                }
                className={inputClass}
              />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                시작일
                <input
                  type="date"
                  required
                  min="1000-01-01"
                  max="9999-12-31"
                  value={task.startDate}
                  onChange={(event) =>
                    setTask({ ...task, startDate: event.target.value })
                  }
                  className={inputClass}
                />
              </label>
              <label className="block text-sm font-medium">
                마감일
                <input
                  type="date"
                  required
                  min={task.startDate || "1000-01-01"}
                  max="9999-12-31"
                  value={task.dueDate}
                  onChange={(event) =>
                    setTask({ ...task, dueDate: event.target.value })
                  }
                  className={inputClass}
                />
              </label>
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={task.status === "DONE"}
                onChange={(event) =>
                  setTask({
                    ...task,
                    status: event.target.checked ? "DONE" : "TODO",
                  })
                }
                className="h-4 w-4"
              />
              완료한 과제
            </label>
            {confirmDelete ? (
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-sm text-red-800">
                  이 과제를 삭제할까요? 삭제하면 되돌릴 수 없습니다.
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
                {id && (
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
                  {busy ? "저장 중..." : id ? "변경 사항 저장" : "과제 등록"}
                </button>
              </div>
            )}
          </fieldset>
        </form>
      )}
    </dialog>
  );
}
