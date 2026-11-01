"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";
import { roleLabel, type TeamDetail, type TeamSummary } from "@/lib/teams";
import TeamDetailPanel from "./team-detail";

const inputClass =
  "min-h-10 w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900";
const buttonClass =
  "min-h-10 shrink-0 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50";

export default function Teams() {
  const router = useRouter();
  const busyRef = useRef(false);
  const nameId = useId();
  const codeId = useId();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    revision: number;
    teams: TeamSummary[];
    error: string;
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const current = result?.revision === revision ? result : null;
  const teams = current?.teams ?? [];

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    apiRequest<{ teams: TeamSummary[] }>("/teams", {
      signal: controller.signal,
    })
      .then((data) => {
        if (!active) return;
        setResult({ revision, teams: data.teams, error: "" });
        // 선택한 팀이 없으면(첫 진입, 탈퇴·삭제 직후) 목록 맨 위 팀을 연다.
        setSelected((id) => id ?? data.teams[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401)
          router.replace("/login");
        setResult({
          revision,
          teams: [],
          error:
            error instanceof Error
              ? error.message
              : "팀 목록을 불러오지 못했습니다.",
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [revision, router]);

  async function submit(path: string, body: object, done: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      const { team } = await apiRequest<{ team: TeamDetail }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setName("");
      setInviteCode("");
      setNotice(`${done} ${team.name}`);
      setSelected(team.id);
      setRevision((value) => value + 1);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401)
        router.replace("/login");
      setFormError(
        error instanceof Error
          ? error.message
          : "요청을 처리하지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <section
        aria-labelledby="teams-title"
        className="rounded-2xl border border-zinc-200 bg-white shadow-sm"
      >
        <div className="border-b border-zinc-200 p-5 sm:p-7">
          <h2 id="teams-title" className="text-xl font-bold">
            팀
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            팀을 만들거나 초대 코드로 참여하세요.
          </p>
        </div>
        <div className="space-y-5 p-5 sm:p-7">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return setFormError("팀 이름을 입력해주세요.");
              void submit(
                "/teams",
                { name: name.trim() },
                "팀을 만들었습니다:",
              );
            }}
          >
            <label htmlFor={nameId} className="block text-sm font-medium">
              새 팀 이름
            </label>
            <div className="mt-1 flex gap-2">
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
                disabled={busy}
                className={`${buttonClass} border-blue-600 bg-blue-600 text-white`}
              >
                만들기
              </button>
            </div>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!inviteCode.trim())
                return setFormError("초대 코드를 입력해주세요.");
              void submit(
                "/teams/join",
                { inviteCode: inviteCode.trim() },
                "팀에 참여했습니다:",
              );
            }}
          >
            <label htmlFor={codeId} className="block text-sm font-medium">
              초대 코드
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id={codeId}
                value={inviteCode}
                maxLength={50}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setInviteCode(event.target.value)}
                className={`${inputClass} font-mono uppercase`}
              />
              <button type="submit" disabled={busy} className={buttonClass}>
                참여
              </button>
            </div>
          </form>
          {formError && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {formError}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-blue-700">
              {notice}
            </p>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-zinc-100 pt-5">
            <h3 className="font-semibold">내 팀</h3>
            <button
              type="button"
              className={buttonClass}
              disabled={!current}
              onClick={() => setRevision((value) => value + 1)}
            >
              새로고침
            </button>
          </div>
          {!current ? (
            <p role="status" className="py-6 text-center text-zinc-500">
              팀 목록을 불러오고 있습니다.
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
          ) : teams.length === 0 ? (
            <p className="rounded-xl bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
              아직 참여한 팀이 없습니다.
            </p>
          ) : (
            <ul className="space-y-1">
              {teams.map((team) => (
                <li key={team.id}>
                  <button
                    type="button"
                    aria-current={selected === team.id ? "true" : undefined}
                    onClick={() => {
                      setNotice("");
                      setSelected(team.id);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left focus-visible:outline-2 focus-visible:outline-blue-600 ${selected === team.id ? "bg-blue-50" : "hover:bg-zinc-50"}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-zinc-900">
                        {team.name}
                      </span>
                      <span className="text-sm text-zinc-500">
                        멤버 {team.memberCount}명
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                      {roleLabel[team.role]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      {selected ? (
        <TeamDetailPanel
          key={selected}
          id={selected}
          onChanged={() => {
            setNotice("");
            setRevision((value) => value + 1);
          }}
          onGone={(message) => {
            setSelected(null);
            setNotice(message);
            setRevision((value) => value + 1);
          }}
        />
      ) : (
        <section className="hidden rounded-2xl border border-dashed border-zinc-300 p-7 text-center text-zinc-500 lg:flex lg:items-center lg:justify-center">
          팀을 만들거나 초대 코드로 참여하면 여기에 팀룸이 열립니다.
        </section>
      )}
    </div>
  );
}
