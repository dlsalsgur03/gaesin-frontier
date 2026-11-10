"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { useTeamChanged } from "@/lib/realtime";
import { formatScheduleRange, type Schedule } from "@/lib/schedules";
import ScheduleEditorDialog from "../schedules/schedule-editor-dialog";

const buttonClass =
  "min-h-10 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50";

function ScheduleList({
  schedules,
  onOpen,
}: {
  schedules: Schedule[];
  onOpen: (schedule: Schedule) => void;
}) {
  return (
    <ul className="divide-y divide-zinc-100">
      {schedules.map((schedule) => (
        <li key={schedule.id} className="flex items-start gap-2 py-2">
          <span
            aria-hidden="true"
            className="mt-3.5 h-2 w-2 shrink-0 rounded-full bg-orange-500"
          />
          <button
            type="button"
            onClick={() => onOpen(schedule)}
            aria-haspopup="dialog"
            className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <p className="break-words font-semibold text-zinc-900">
              {schedule.title}
            </p>
            <p className="mt-0.5 text-sm tabular-nums text-zinc-500">
              {formatScheduleRange(schedule)}
            </p>
            {schedule.description && (
              <p className="mt-1 line-clamp-2 text-sm whitespace-pre-line text-zinc-600">
                {schedule.description}
              </p>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 팀룸의 일정 탭. 다가오는 일정과 지난 일정을 나눠 보여준다. */
export default function TeamSchedules({
  team,
}: {
  team: { id: string; name: string };
}) {
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  /** 다른 팀원의 변경을 반영하는 조용한 재조회. 지금 목록을 보인 채로 다시 불러온다. */
  const [quiet, setQuiet] = useState(0);
  const [result, setResult] = useState<{
    revision: number;
    schedules: Schedule[];
    error: string;
  } | null>(null);
  const [editor, setEditor] = useState<{ schedule?: Schedule } | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const current = result?.revision === revision ? result : null;
  const schedules = current?.schedules ?? [];
  // 끝나지 않은 일정은 가까운 순, 지난 일정은 최근 순으로 보여준다.
  const upcoming = schedules.filter(
    (item) => new Date(item.endAt).getTime() >= now,
  );
  const past = schedules
    .filter((item) => new Date(item.endAt).getTime() < now)
    .reverse();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    apiRequest<{ schedules: Schedule[] }>(`/teams/${team.id}/schedules`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!active) return;
        setResult({ revision, schedules: data.schedules, error: "" });
        setNow(Date.now());
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
                schedules: [],
                error:
                  error instanceof Error
                    ? error.message
                    : "팀 일정을 불러오지 못했습니다.",
              },
        );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [team.id, revision, quiet, router]);

  useTeamChanged(team.id, "schedules", () => setQuiet((value) => value + 1));

  const listProps = {
    onOpen: (schedule: Schedule) => {
      setNotice("");
      setEditor({ schedule });
    },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          팀원 모두가 일정을 등록·수정할 수 있으며, 일정은 캘린더에도
          표시됩니다.
        </p>
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
            onClick={() => {
              setNotice("");
              setEditor({});
            }}
          >
            일정 등록
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
          팀 일정을 불러오고 있습니다.
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
      ) : schedules.length === 0 ? (
        <p className="rounded-xl bg-zinc-50 px-4 py-12 text-center text-zinc-500">
          아직 팀 일정이 없습니다. 첫 일정을 등록해보세요.
        </p>
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="upcoming-schedules">
            <h3 id="upcoming-schedules" className="font-semibold">
              다가오는 일정{" "}
              <span className="text-sm font-normal text-zinc-500">
                {upcoming.length}개
              </span>
            </h3>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">
                다가오는 일정이 없습니다.
              </p>
            ) : (
              <ScheduleList schedules={upcoming} {...listProps} />
            )}
          </section>
          {past.length > 0 && (
            <section aria-labelledby="past-schedules">
              <h3 id="past-schedules" className="font-semibold">
                지난 일정{" "}
                <span className="text-sm font-normal text-zinc-500">
                  {past.length}개
                </span>
              </h3>
              <ScheduleList schedules={past} {...listProps} />
            </section>
          )}
        </div>
      )}
      {editor && (
        <ScheduleEditorDialog
          team={team}
          schedule={editor.schedule}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            setEditor(null);
            setNotice(saved ? "일정을 저장했습니다." : "일정을 삭제했습니다.");
            setRevision((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
