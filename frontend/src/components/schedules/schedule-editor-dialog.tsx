"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import {
  defaultStartInput,
  fromLocalInput,
  toLocalInput,
  type Schedule,
} from "@/lib/schedules";

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900";
const buttonClass =
  "min-h-10 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold disabled:opacity-50";

/**
 * 팀 일정 등록·수정·삭제 창. 시각은 브라우저 시간대로 입력받는다.
 * 종료 시각은 선택값이며 비워 두면 시작 시각과 같은 일정으로 저장한다.
 */
export default function ScheduleEditorDialog({
  team,
  schedule,
  onClose,
  onSaved,
}: {
  team: { id: string; name: string };
  /** 없으면 새 일정 등록 */
  schedule?: Schedule;
  onClose: () => void;
  /** saved가 없으면 삭제한 것이다. */
  onSaved: (saved?: Schedule) => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const endHintId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const [form, setForm] = useState(() => ({
    title: schedule?.title ?? "",
    description: schedule?.description ?? "",
    startAt: schedule ? toLocalInput(schedule.startAt) : defaultStartInput(),
    endAt:
      schedule && schedule.endAt !== schedule.startAt
        ? toLocalInput(schedule.endAt)
        : "",
  }));
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
    const startAt = fromLocalInput(form.startAt);
    const endAt = form.endAt ? fromLocalInput(form.endAt) : null;
    if (!remove) {
      const problem = !form.title.trim()
        ? "제목을 입력해주세요."
        : !startAt
          ? "시작 시각을 입력해주세요."
          : form.endAt && !endAt
            ? "종료 시각을 확인해주세요."
            : endAt && endAt < startAt
              ? "종료 시각은 시작 시각 이후여야 합니다."
              : "";
      if (problem) {
        setError(problem);
        return;
      }
    }
    busyRef.current = true;
    setBusy(true);
    try {
      if (remove) {
        await apiRequest(`/schedules/${schedule?.id}`, { method: "DELETE" });
        onSaved();
        return;
      }
      const { schedule: saved } = await apiRequest<{ schedule: Schedule }>(
        schedule ? `/schedules/${schedule.id}` : `/teams/${team.id}/schedules`,
        {
          method: schedule ? "PUT" : "POST",
          body: JSON.stringify({
            title: form.title.trim(),
            description: form.description,
            startAt,
            endAt,
          }),
        },
      );
      onSaved(saved);
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
        <div className="min-w-0">
          <h2 id={titleId} className="text-xl font-bold">
            팀 일정 {schedule ? "수정" : "등록"}
          </h2>
          <p className="mt-1 truncate text-sm text-zinc-500">{team.name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className={buttonClass}
          aria-label="일정 창 닫기"
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              시작 <span className="text-zinc-500">(필수)</span>
              <input
                type="datetime-local"
                required
                min="1000-01-01T00:00"
                max="9999-12-31T23:59"
                value={form.startAt}
                onChange={(event) =>
                  setForm({ ...form, startAt: event.target.value })
                }
                className={inputClass}
              />
            </label>
            <label className="block text-sm font-medium">
              종료 <span className="text-zinc-500">(선택)</span>
              <input
                type="datetime-local"
                min={form.startAt || "1000-01-01T00:00"}
                max="9999-12-31T23:59"
                value={form.endAt}
                aria-describedby={endHintId}
                onChange={(event) =>
                  setForm({ ...form, endAt: event.target.value })
                }
                className={inputClass}
              />
            </label>
          </div>
          <div
            id={endHintId}
            className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500"
          >
            <span>종료를 비워 두면 시작 시각과 같은 일정으로 저장합니다.</span>
            {form.endAt && (
              <button
                type="button"
                onClick={() => setForm({ ...form, endAt: "" })}
                className="font-semibold text-blue-700 underline"
              >
                종료 비우기
              </button>
            )}
          </div>
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
          {confirmDelete ? (
            <div className="rounded-lg bg-red-50 p-4">
              <p className="text-sm text-red-800">
                이 일정을 삭제할까요? 팀원 모두에게서 사라지며 되돌릴 수
                없습니다.
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
              {schedule && (
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
                {busy
                  ? "저장 중..."
                  : schedule
                    ? "변경 사항 저장"
                    : "일정 등록"}
              </button>
            </div>
          )}
        </fieldset>
      </form>
    </dialog>
  );
}
