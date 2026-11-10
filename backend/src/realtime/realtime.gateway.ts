import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { readAccessTokenCookie, verifyAccessToken } from '../auth/access-token';
import { isAllowedOrigin } from '../common/cors-origins';
import { PrismaService } from '../prisma/prisma.service';

type SocketData = { userId: string; exp: number };
type AppSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>;

/** team:changed가 알리는 변경 범위. 프론트는 해당 화면만 다시 불러온다. */
export type TeamChangeScope = 'team' | 'assignments' | 'files';

const userRoom = (userId: bigint | string) => `user:${userId}`;
const teamRoom = (teamId: bigint | string) => `team:${teamId}`;

/** 연결 거부 사유는 클라이언트의 connect_error에서 err.data로 받는다. */
function rejection(code: string, message: string) {
  return Object.assign(new Error(message), { data: { code, message } });
}

/**
 * 브라우저와의 실시간 연결. 클라이언트가 보내는 이벤트는 없고 서버가 알림만 보낸다.
 *
 * - 인증: 핸드셰이크의 access_token 쿠키(HTTP와 같은 JWT). 출처는 CORS_ORIGIN 목록만 허용한다.
 * - 룸: 연결 시 서버가 `user:{id}`와 소속된 모든 `team:{id}`에 넣는다.
 *   팀 참여·탈퇴·내보내기·삭제 때 TeamsService가 이 서비스를 불러 룸을 맞춘다.
 * - 토큰이 만료되는 시각에 서버가 연결을 끊는다.
 */
@WebSocketGateway({
  serveClient: false,
  cors: {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  },
  // 웹소켓에는 CORS가 적용되지 않으므로 다른 사이트에서 쿠키로 연결하지 못하게 출처를 직접 확인한다.
  allowRequest: (
    request: { headers: { origin?: string } },
    callback: (error: string | null | undefined, success: boolean) => void,
  ) => callback(null, isAllowedOrigin(request.headers.origin)),
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  @WebSocketServer()
  private server?: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    server.use((socket: AppSocket, next) => {
      const token = readAccessTokenCookie(socket.handshake.headers.cookie);
      verifyAccessToken(this.jwtService, token)
        .then((verified) => {
          if (!verified)
            return next(rejection('UNAUTHENTICATED', '로그인이 필요합니다.'));
          socket.data = verified;
          next();
        })
        .catch(next);
    });
  }

  async handleConnection(socket: AppSocket) {
    const { userId, exp } = socket.data;
    // 개인 룸에 먼저 들어가야 조회 도중 참여한 팀도 joinTeam으로 받을 수 있다.
    await socket.join(userRoom(userId));
    try {
      const memberships = await this.prisma.teamMember.findMany({
        where: { userId: BigInt(userId) },
        select: { teamId: true },
      });
      if (socket.disconnected) return;
      await socket.join(memberships.map(({ teamId }) => teamRoom(teamId)));
    } catch (error) {
      this.logger.error('소켓 팀 룸 입장 실패', error);
      socket.disconnect(true);
      return;
    }

    const remaining = exp * 1000 - Date.now();
    this.expiryTimers.set(
      socket.id,
      setTimeout(() => socket.disconnect(true), Math.max(remaining, 0)),
    );
  }

  handleDisconnect(socket: AppSocket) {
    clearTimeout(this.expiryTimers.get(socket.id));
    this.expiryTimers.delete(socket.id);
  }

  /** 팀에 새로 들어온 사용자의 열린 연결을 팀 룸에 넣는다. */
  joinTeam(userId: bigint | string, teamId: bigint | string) {
    this.server?.in(userRoom(userId)).socketsJoin(teamRoom(teamId));
  }

  /** 팀을 떠난(내보내진) 사용자의 연결을 팀 룸에서 빼고 알린다. */
  leaveTeam(userId: bigint | string, teamId: bigint | string) {
    if (!this.server) return;
    this.server.in(userRoom(userId)).socketsLeave(teamRoom(teamId));
    this.server
      .to(userRoom(userId))
      .emit('team:removed', { teamId: teamId.toString() });
  }

  /** 삭제된 팀의 모든 연결에 알리고 룸을 비운다. */
  closeTeam(teamId: bigint | string) {
    if (!this.server) return;
    this.server
      .to(teamRoom(teamId))
      .emit('team:removed', { teamId: teamId.toString() });
    this.server.in(teamRoom(teamId)).socketsLeave(teamRoom(teamId));
  }

  /**
   * 팀 데이터가 바뀌었음을 팀원에게 알린다(변경한 사람 포함). 내용은 보내지 않으며
   * 받은 화면이 REST로 다시 불러온다. 커밋이 끝난 뒤 호출한다.
   */
  teamChanged(teamId: bigint | string, ...scopes: TeamChangeScope[]) {
    this.emitToTeam(teamId, 'team:changed', {
      teamId: teamId.toString(),
      scopes,
    });
  }

  /** 팀 룸의 모든 연결(보낸 사람 포함)에 이벤트를 보낸다. */
  emitToTeam(teamId: bigint | string, event: string, payload: unknown) {
    this.server?.to(teamRoom(teamId)).emit(event, payload);
  }
}
