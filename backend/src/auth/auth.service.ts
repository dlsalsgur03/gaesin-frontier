import { 
  ConflictException, 
  Injectable, 
  UnauthorizedException 
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { SignupDto } from './dto/signup.dto'
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(    // 생성자
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          nickname: dto.nickname,
        }, 
        select: {
          id: true,
          email: true,
          nickname: true,
          createdAt: true,
        },
      });

      return {
        message: '회원가입이 완료되었습니다.',
        user: {
          ...user,
          id: user.id.toString(),
        },
      };
    } catch (error: unknown) {
      // 동시에 같은 이메일로 가입해도 DB의 UNIQUE 제약으로 차단
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('이미 사용 중인 이메일입니다.');
      }

      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        nickname: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 잘못되었습니다.',
      );
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 잘못되었습니다.',
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id.toString(),
    });

    return { 
      accessToken,
      user: {
        id: user.id.toString(),
        email: user.email,
        nickname: user.nickname,
      },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: {
        id: true,
        email: true,
        nickname: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }

    return {
      ...user,
      id: user.id.toString(),
    };
  }
}