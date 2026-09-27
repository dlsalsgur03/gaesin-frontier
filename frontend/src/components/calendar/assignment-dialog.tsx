"use client";

import { useEffect, useId, useRef } from "react";
import type { CalendarAssignment } from "@/lib/calendar/types";

export default function AssignmentDialog({
  assignment,
  onClose,
}: {
  assignment: CalendarAssignment;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const isDone = assignment.status === "DONE";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    dialog.showModal();
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-zinc-950/40"
    >
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <p
            className={`rounded-md px-2 py-1 text-xs font-semibold ${assignment.kind === "team" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}`}
          >
            {assignment.kind === "team" ? "팀 과제" : "개인 과제"}
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="과제 정보 닫기"
            className="-mr-2 -mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl text-zinc-500 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <h2
          id={titleId}
          className="mt-4 break-words text-xl font-bold leading-snug"
        >
          {assignment.title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-zinc-500">
          과제 일정과 상태를 확인하는 읽기 전용 화면입니다.
        </p>
        <dl className="mt-6 space-y-5 text-sm">
          <div>
            <dt className="font-medium text-zinc-500">기간</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-medium tabular-nums">
              <time dateTime={assignment.startDate}>
                {assignment.startDate.replaceAll("-", ".")}
              </time>
              <span>~</span>
              <time dateTime={assignment.dueDate}>
                {assignment.dueDate.replaceAll("-", ".")}
              </time>
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500">완료 상태</dt>
            <dd
              className={`mt-1 inline-flex rounded-md px-2 py-1 font-medium ${isDone ? "bg-zinc-100 text-zinc-600" : "bg-amber-50 text-amber-800"}`}
            >
              {isDone ? "완료" : "미완료"}
            </dd>
          </div>
          {assignment.kind === "team" && (
            <div>
              <dt className="font-medium text-zinc-500">팀 이름</dt>
              <dd className="mt-1 break-words font-medium">
                {assignment.teamName}
              </dd>
            </div>
          )}
        </dl>
      </div>
    </dialog>
  );
}
