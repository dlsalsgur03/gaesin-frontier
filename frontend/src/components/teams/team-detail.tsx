"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { roleLabel, type TeamDetail, type TeamMember } from "@/lib/teams";

const inputClass =
  "min-h-10 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900";
const buttonClass =
  "min-h-10 shrink-0 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50";

/** 되돌리기 어려운 작업은 한 번 더 확인한다. */
type Confirm =
  | { kind: "regenerate" | "leave" | "delete" }
  | { kind: "transfer" | "remove"; member: TeamMember };

function ConfirmBox({
  message,
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  message: string;
  action: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg bg-red-50 p-4">
      <p className="text-sm text-red-800">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className={`${buttonClass} border-red-200 bg-white text-red-700`}
        >
          {busy ? "처리 중..." : action}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className={`${buttonClass} bg-white`}
        >
          취소
        </button>
      </div>
    </div>
  );
}

export default function TeamDetailPanel({
  id,
  onChanged,
  onGone,
}: {
  id: string;
  /** 팀 이름·멤버 수가 바뀌어 목록을 다시 불러와야 할 때 */
  onChanged: () => void;
  /** 탈퇴·삭제로 더 이상 이 팀을 볼 수 없을 때 */
  onGone: (message: string) => void;
}) {
  const router = useRouter();
  const nameId = useId();
  const busyRef = useRef(false);
  // 부모가 매 렌더마다 새로 만드는 콜백이 재조회를 일으키지 않도록 ref로 읽는다.
  const onGoneRef = useRef(onGone);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    revision: number;
    team: TeamDetail | null;
    error: string;
  } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const current = result?.revision === revision ? result : null;
  const team = current?.team;
  const isOwner = team?.myRole === "OWNER";

  useEffect(() => {
    onGoneRef.current = onGone;
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    apiRequest<{ team: TeamDetail }>(`/teams/${id}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!active) return;
        setResult({ revision, team: data.team, error: "" });
        setName(data.team.name);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401)
          router.replace("/login");
        // 다른 곳에서 내보내졌거나 삭제된 팀이다.
        if (error instanceof ApiError && error.status === 404)
          return onGoneRef.current("팀을 더 이상 볼 수 없습니다.");
        setResult({
          revision,
          team: null,
          error:
            error instanceof Error
              ? error.message
              : "팀을 불러오지 못했습니다.",
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, revision, router]);

  async function run(
    path: string,
    init: RequestInit,
    done: string,
    gone = false,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await apiRequest<{ team?: TeamDetail }>(path, init);
      setConfirm(null);
      if (gone) return onGone(done);
      if (data.team) {
        setResult({ revision, team: data.team, error: "" });
        setName(data.team.name);
      }
      setNotice(done);
      onChanged();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401)
        router.replace("/login");
      setError(
        error instanceof Error
          ? error.message
          : "요청을 처리하지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function copyInviteCode(code: string) {
    setError("");
    try {
      await navigator.clipboard.writeText(code);
      setNotice("초대 코드를 복사했습니다.");
    } catch {
      setError("복사하지 못했습니다. 코드를 직접 선택해 복사해주세요.");
    }
  }

  if (!current)
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <p role="status" className="text-center text-zinc-500">
          팀 정보를 불러오고 있습니다.
        </p>
      </section>
    );

  if (!team)
    return (
      <section
        role="alert"
        className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-7 text-red-700 shadow-sm"
      >
        <p>{current.error}</p>
        <button
          type="button"
          className={buttonClass}
          onClick={() => setRevision((value) => value + 1)}
        >
          다시 시도
        </button>
      </section>
    );

  return (
    <section
      aria-labelledby="team-detail-title"
      className="rounded-2xl border border-zinc-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 p-5 sm:p-7">
        <div className="min-w-0">
          <h2 id="team-detail-title" className="break-words text-xl font-bold">
            {team.name}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            내 역할: {roleLabel[team.myRole]} · 멤버 {team.members.length}명
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          disabled={busy}
          onClick={() => setRevision((value) => value + 1)}
        >
          새로고침
        </button>
      </div>

      <div className="space-y-6 p-5 sm:p-7">
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

        <div className="space-y-3">
          <h3 className="font-semibold">초대 코드</h3>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-zinc-100 px-3 py-2 font-mono text-lg tracking-widest select-all">
              {team.inviteCode}
            </code>
            <button
              type="button"
              className={buttonClass}
              onClick={() => void copyInviteCode(team.inviteCode)}
            >
              복사
            </button>
            {isOwner && (
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() => setConfirm({ kind: "regenerate" })}
              >
                재발급
              </button>
            )}
          </div>
          <p className="text-sm text-zinc-500">
            이 코드를 받은 사람은 팀에 참여할 수 있습니다.
          </p>
          {confirm?.kind === "regenerate" && (
            <ConfirmBox
              message="새 코드를 발급하면 지금 코드로는 더 이상 참여할 수 없습니다."
              action="재발급"
              busy={busy}
              onCancel={() => setConfirm(null)}
              onConfirm={() =>
                void run(
                  `/teams/${id}/invite-code`,
                  { method: "POST" },
                  "초대 코드를 재발급했습니다.",
                )
              }
            />
          )}
        </div>

        {isOwner && (
          <form
            className="space-y-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return setError("팀 이름을 입력해주세요.");
              void run(
                `/teams/${id}`,
                { method: "PUT", body: JSON.stringify({ name: name.trim() }) },
                "팀 이름을 바꿨습니다.",
              );
            }}
          >
            <label htmlFor={nameId} className="block font-semibold">
              팀 이름
            </label>
            <div className="flex gap-2">
              <input
                id={nameId}
                value={name}
                maxLength={100}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                className={inputClass}
              />
              <button
                type="submit"
                disabled={busy || name.trim() === team.name}
                className={buttonClass}
              >
                저장
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          <h3 className="font-semibold">멤버</h3>
          <ul className="divide-y divide-zinc-100">
            {team.members.map((member) => (
              <li key={member.userId} className="space-y-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-zinc-900">
                      {member.nickname}
                      {member.isMe && (
                        <span className="ml-1 text-sm text-zinc-500">(나)</span>
                      )}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {roleLabel[member.role]} ·{" "}
                      {new Date(member.joinedAt).toLocaleDateString("ko-KR")}{" "}
                      참여
                    </p>
                  </div>
                  {isOwner && member.role === "MEMBER" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        className={buttonClass}
                        aria-label={`${member.nickname}에게 소유권 넘기기`}
                        onClick={() => setConfirm({ kind: "transfer", member })}
                      >
                        소유권 넘기기
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className={`${buttonClass} text-red-700`}
                        aria-label={`${member.nickname} 내보내기`}
                        onClick={() => setConfirm({ kind: "remove", member })}
                      >
                        내보내기
                      </button>
                    </div>
                  )}
                </div>
                {confirm?.kind === "transfer" &&
                  confirm.member.userId === member.userId && (
                    <ConfirmBox
                      message={`${member.nickname}님에게 소유권을 넘길까요? 넘긴 뒤에는 일반 멤버가 됩니다.`}
                      action="소유권 넘기기"
                      busy={busy}
                      onCancel={() => setConfirm(null)}
                      onConfirm={() =>
                        void run(
                          `/teams/${id}/transfer`,
                          {
                            method: "POST",
                            body: JSON.stringify({ userId: member.userId }),
                          },
                          `${member.nickname}님에게 소유권을 넘겼습니다.`,
                        )
                      }
                    />
                  )}
                {confirm?.kind === "remove" &&
                  confirm.member.userId === member.userId && (
                    <ConfirmBox
                      message={`${member.nickname}님을 팀에서 내보낼까요?`}
                      action="내보내기"
                      busy={busy}
                      onCancel={() => setConfirm(null)}
                      onConfirm={() =>
                        void run(
                          `/teams/${id}/members/${member.userId}`,
                          { method: "DELETE" },
                          `${member.nickname}님을 내보냈습니다.`,
                        )
                      }
                    />
                  )}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3 border-t border-zinc-100 pt-5">
          {isOwner ? (
            <>
              <p className="text-sm text-zinc-500">
                팀을 나가려면 먼저 다른 멤버에게 소유권을 넘겨주세요.
              </p>
              {confirm?.kind === "delete" ? (
                <ConfirmBox
                  message="팀을 삭제할까요? 팀 과제·세부 작업·일정·메시지·파일 기록이 모두 삭제되며 되돌릴 수 없습니다."
                  action="팀 삭제"
                  busy={busy}
                  onCancel={() => setConfirm(null)}
                  onConfirm={() =>
                    void run(
                      `/teams/${id}`,
                      { method: "DELETE" },
                      `팀을 삭제했습니다: ${team.name}`,
                      true,
                    )
                  }
                />
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className={`${buttonClass} text-red-700`}
                  onClick={() => setConfirm({ kind: "delete" })}
                >
                  팀 삭제
                </button>
              )}
            </>
          ) : confirm?.kind === "leave" ? (
            <ConfirmBox
              message="팀에서 탈퇴할까요? 다시 참여하려면 초대 코드가 필요합니다."
              action="탈퇴"
              busy={busy}
              onCancel={() => setConfirm(null)}
              onConfirm={() =>
                void run(
                  `/teams/${id}/leave`,
                  { method: "POST" },
                  `팀에서 탈퇴했습니다: ${team.name}`,
                  true,
                )
              }
            />
          ) : (
            <button
              type="button"
              disabled={busy}
              className={`${buttonClass} text-red-700`}
              onClick={() => setConfirm({ kind: "leave" })}
            >
              팀 탈퇴
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
