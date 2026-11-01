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
