/** 파일 API 응답 모델. 팀 파일은 팀 과제 하나에 연결되어 있을 수 있다. */
export type StoredFile = {
  id: string;
  fileName: string;
  /** 바이트 */
  size: number;
  /** 올린 시각(ISO). 화면에서는 브라우저 로컬 날짜로 표시한다. */
  createdAt: string;
  uploaderNickname: string;
  isMine: boolean;
  teamAssignmentId: string | null;
  teamAssignmentTitle: string | null;
};

/** 백엔드 제한과 같다(20MB). 형식은 제한하지 않는다. */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 올리기 전에 브라우저에서 먼저 확인한다. 문제가 없으면 빈 문자열. */
export function fileProblem(file: File) {
  if (file.size === 0) return `빈 파일은 올릴 수 없습니다: ${file.name}`;
  if (file.size > MAX_FILE_SIZE)
    return `파일은 20MB까지 올릴 수 있습니다: ${file.name} (${formatFileSize(file.size)})`;
  return "";
}
