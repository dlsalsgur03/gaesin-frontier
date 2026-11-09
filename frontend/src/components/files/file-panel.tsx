"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiDownload, apiRequest } from "@/lib/api";
import { fileProblem, formatFileSize, type StoredFile } from "@/lib/files";

/**
 * 개인 과제 첨부 또는 팀 파일. 팀 파일에 assignmentId를 주면 그 팀 과제에 연결된 파일만 보이고,
 * 새로 올린 파일도 그 과제에 연결된다. 주지 않으면 팀의 모든 파일을 보고 연결할 과제를 고른다.
 */
export type FileTarget =
  | { kind: "assignment"; assignmentId: string }
  | { kind: "team"; teamId: string; assignmentId?: string };

type AssignmentOption = { id: string; title: string };

const ALL = "all";
const UNTAGGED = "none";
const buttonClass =
  "min-h-10 shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50";
const selectClass =
  "min-h-10 max-w-full min-w-0 rounded-lg border border-zinc-300 bg-white px-2 text-sm";

export default function FilePanel({
  target,
  heading = "첨부파일",
  level = 3,
}: {
  target: FileTarget;
  heading?: string;
  level?: 3 | 4;
}) {
  const router = useRouter();
  const headingId = useId();
  const busyRef = useRef(false);
  const Heading = level === 4 ? "h4" : "h3";
  const teamId = target.kind === "team" ? target.teamId : null;
  // 팀 과제 상세에서 보는 경우 그 팀 과제 ID. 개인 과제 ID와 섞지 않는다.
  const fixedId = target.kind === "team" ? target.assignmentId : undefined;
  // 팀 전체 파일을 볼 때만 과제를 골라 연결·필터한다.
  const tagMode = target.kind === "team" && !fixedId;
  const listPath =
    target.kind === "team"
      ? `/teams/${target.teamId}/files`
      : `/assignments/${target.assignmentId}/files`;

  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    revision: number;
    files: StoredFile[];
    assignments: AssignmentOption[];
    error: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [filter, setFilter] = useState(ALL);
  const [uploadTag, setUploadTag] = useState(UNTAGGED);
  // 재조회 중에도 이전 목록을 보여 깜빡이지 않게 한다.
  const reloading = result?.revision !== revision;
  const files = result?.files ?? [];
  const assignments = result?.assignments ?? [];
  const visible = files.filter((file) =>
    fixedId
      ? file.teamAssignmentId === fixedId
      : !tagMode || filter === ALL
        ? true
        : filter === UNTAGGED
          ? file.teamAssignmentId === null
          : file.teamAssignmentId === filter,
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const options = { signal: controller.signal };
    Promise.all([
      apiRequest<{ files: StoredFile[] }>(listPath, options),
      tagMode && teamId
        ? apiRequest<{ assignments: AssignmentOption[] }>(
            `/teams/${teamId}/assignments`,
            options,
          )
        : Promise.resolve({ assignments: [] }),
    ])
      .then(([list, team]) => {
        if (!active) return;
        setResult({
          revision,
          files: list.files,
          assignments: team.assignments.map(({ id, title }) => ({
            id,
            title,
          })),
          error: "",
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401)
          router.replace("/login");
        setResult({
          revision,
          files: [],
          assignments: [],
          error:
            error instanceof Error
              ? error.message
              : "파일 목록을 불러오지 못했습니다.",
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [listPath, tagMode, teamId, revision, router]);

  /** 한 번에 하나씩 처리하고, 끝나면 목록을 다시 불러온다. */
  async function run(action: () => Promise<string>, failure: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await action());
      setConfirmId(null);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401)
        router.replace("/login");
      setError(error instanceof Error ? error.message : failure);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setRevision((value) => value + 1);
    }
  }

  function upload(picked: File[]) {
    if (!picked.length) return;
    const problem = picked.map(fileProblem).find(Boolean);
    if (problem) {
      setNotice("");
      setError(problem);
      return;
    }
    const tag = fixedId ?? (uploadTag === UNTAGGED ? null : uploadTag);
    void run(async () => {
      let done = 0;
      try {
        for (const file of picked) {
          const body = new FormData();
          if (tag) body.append("teamAssignmentId", tag);
          body.append("file", file);
          await apiRequest(listPath, { method: "POST", body });
          done++;
        }
      } catch (error) {
        // 여러 개 중 일부만 올라간 경우 어디까지 됐는지 알려준다.
        if (done > 0 && error instanceof Error)
          throw new Error(
            `${done}개를 올린 뒤 실패했습니다: ${picked[done].name} — ${error.message}`,
          );
        throw error;
      }
      return picked.length === 1
        ? `파일을 올렸습니다: ${picked[0].name}`
        : `파일 ${picked.length}개를 올렸습니다.`;
    }, "파일을 올리지 못했습니다. 다시 시도해주세요.");
  }

  async function download(file: StoredFile) {
    setError("");
    try {
      await apiDownload(`/files/${file.id}/download`, file.fileName);
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401)
        router.replace("/login");
      setError(
        error instanceof Error ? error.message : "파일을 받지 못했습니다.",
      );
    }
  }

  const disabled = busy || !result;

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Heading id={headingId} className="font-semibold">
            {heading}
          </Heading>
          <p className="text-sm text-zinc-500">
            파일당 20MB까지 올릴 수 있습니다.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          {tagMode && (
            <select
              aria-label="새로 올릴 파일을 연결할 과제"
              value={uploadTag}
              disabled={disabled}
              onChange={(event) => setUploadTag(event.target.value)}
              className={selectClass}
            >
              <option value={UNTAGGED}>과제 연결 안 함</option>
              {assignments.map(({ id, title }) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          )}
          <label
            className={`${buttonClass} cursor-pointer border-blue-600 bg-blue-600 text-white focus-within:outline-2 focus-within:outline-blue-600 ${disabled ? "pointer-events-none opacity-50" : ""}`}
          >
            {busy ? "처리 중..." : "파일 올리기"}
            <input
              type="file"
              multiple
              disabled={disabled}
              className="sr-only"
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? []);
                // 같은 파일을 다시 고를 수 있게 비운다.
                event.target.value = "";
                upload(picked);
              }}
            />
          </label>
        </div>
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

      {!result ? (
        <p role="status" className="py-6 text-center text-sm text-zinc-500">
          파일 목록을 불러오고 있습니다.
        </p>
      ) : result.error ? (
        <div
          role="alert"
          className="space-y-3 rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          <p>{result.error}</p>
          <button
            type="button"
            className={`${buttonClass} bg-white`}
            onClick={() => setRevision((value) => value + 1)}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <>
          {tagMode && files.length > 0 && (
            <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
              과제별 보기
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className={selectClass}
              >
                <option value={ALL}>전체 ({files.length})</option>
                <option value={UNTAGGED}>
                  과제 연결 안 됨 (
                  {files.filter((file) => !file.teamAssignmentId).length})
                </option>
                {assignments.map(({ id, title }) => (
                  <option key={id} value={id}>
                    {title} (
                    {
                      files.filter((file) => file.teamAssignmentId === id)
                        .length
                    }
                    )
                  </option>
                ))}
              </select>
            </label>
          )}
          {visible.length === 0 ? (
            <p className="rounded-xl bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
              {files.length === 0 || fixedId
                ? "아직 올린 파일이 없습니다."
                : "선택한 과제에 연결된 파일이 없습니다."}
            </p>
          ) : (
            <ul
              aria-busy={reloading}
              className="divide-y divide-zinc-100 rounded-xl border border-zinc-100"
            >
              {visible.map((file) => (
                <li key={file.id} className="space-y-3 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => void download(file)}
                        className="break-all text-left font-medium text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600"
                        aria-label={`${file.fileName} 내려받기`}
                      >
                        {file.fileName}
                      </button>
                      <p className="mt-1 text-sm text-zinc-500">
                        {formatFileSize(file.size)} · {file.uploaderNickname}
                        {file.isMine && target.kind === "team"
                          ? " (나)"
                          : ""} ·{" "}
                        {new Date(file.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                      {tagMode && (
                        <p className="mt-2">
                          <span
                            className={`inline-block max-w-full truncate rounded-md px-2 py-1 align-middle text-xs font-semibold ${file.teamAssignmentTitle ? "bg-violet-50 text-violet-700" : "bg-zinc-100 text-zinc-500"}`}
                          >
                            {file.teamAssignmentTitle ?? "과제 연결 안 됨"}
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2 sm:shrink-0">
                      {tagMode && file.isMine && (
                        <select
                          aria-label={`${file.fileName} 연결 과제 변경`}
                          value={file.teamAssignmentId ?? UNTAGGED}
                          disabled={disabled || reloading}
                          onChange={(event) => {
                            const value = event.target.value;
                            void run(async () => {
                              await apiRequest(`/files/${file.id}`, {
                                method: "PUT",
                                body: JSON.stringify({
                                  teamAssignmentId:
                                    value === UNTAGGED ? null : value,
                                }),
                              });
                              return `연결 과제를 바꿨습니다: ${file.fileName}`;
                            }, "연결 과제를 바꾸지 못했습니다.");
                          }}
                          className={selectClass}
                        >
                          <option value={UNTAGGED}>과제 연결 안 함</option>
                          {assignments.map(({ id, title }) => (
                            <option key={id} value={id}>
                              {title}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => void download(file)}
                      >
                        내려받기
                      </button>
                      {file.isMine && (
                        <button
                          type="button"
                          disabled={disabled}
                          className={`${buttonClass} text-red-700`}
                          aria-label={`${file.fileName} 삭제`}
                          onClick={() => setConfirmId(file.id)}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                  {confirmId === file.id && (
                    <div className="rounded-lg bg-red-50 p-3">
                      <p className="text-sm text-red-800">
                        {file.fileName} 파일을 삭제할까요? 되돌릴 수 없습니다.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          className={`${buttonClass} border-red-200 bg-white text-red-700`}
                          onClick={() =>
                            void run(async () => {
                              await apiRequest(`/files/${file.id}`, {
                                method: "DELETE",
                              });
                              return `파일을 삭제했습니다: ${file.fileName}`;
                            }, "파일을 삭제하지 못했습니다.")
                          }
                        >
                          {busy ? "삭제 중..." : "삭제 확인"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className={`${buttonClass} bg-white`}
                          onClick={() => setConfirmId(null)}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
