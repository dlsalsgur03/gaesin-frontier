export const assignmentStatuses = [
  { value: "TODO", label: "등록" },
  { value: "IN_PROGRESS", label: "진행 중" },
  { value: "DONE", label: "완료" },
] as const;
export type AssignmentStatus = (typeof assignmentStatuses)[number]["value"];
export const statusLabel: Record<AssignmentStatus, string> = {
  TODO: "등록",
  IN_PROGRESS: "진행 중",
  DONE: "완료",
};
export const statusClass: Record<AssignmentStatus, string> = {
  TODO: "bg-zinc-100 text-zinc-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  DONE: "bg-emerald-50 text-emerald-700",
};
