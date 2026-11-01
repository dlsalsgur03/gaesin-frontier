import type { AssignmentStatus } from "@/lib/assignment-status";

/** 팀 API 응답 모델. Prisma BigInt ID는 문자열로 전달받는다. */
export type TeamRole = "OWNER" | "MEMBER";

export type TeamSummary = {
  id: string;
  name: string;
  role: TeamRole;
  memberCount: number;
};

export type TeamMember = {
  userId: string;
  nickname: string;
  role: TeamRole;
  /** 참여 시각(ISO). 화면에서는 브라우저 로컬 날짜로 표시한다. */
  joinedAt: string;
  isMe: boolean;
};

export type TeamDetail = {
  id: string;
  name: string;
  inviteCode: string;
  myRole: TeamRole;
  members: TeamMember[];
};

export const roleLabel: Record<TeamRole, string> = {
  OWNER: "소유자",
  MEMBER: "멤버",
};

/** 팀 과제. 날짜는 UTC 기준 YYYY-MM-DD이며 화면에서 시간대 변환 없이 표시한다. */
export type TeamAssignment = {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  status: AssignmentStatus;
  taskCount: number;
  doneTaskCount: number;
};

/** 팀 과제의 할 일. 담당자와 마감일은 없을 수 있다. */
export type TeamTask = {
  id: string;
  teamAssignmentId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  assigneeNickname: string | null;
  dueDate: string | null;
  status: AssignmentStatus;
};
