import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, timingSafeEqual } from 'node:crypto';
import { UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.password !== dto.passwordConfirmation) {
      throw new ConflictException('As senhas nÃ£o coincidem.');
    }

    const role = dto.role ?? UserRole.ALUNO;
    if (role === UserRole.ADMIN) {
      const expected = process.env.SIGE_MANAGER_CODE;
      const digest = (value: string) => createHash('sha256').update(value).digest();
      if (!expected || !dto.managerCode || !timingSafeEqual(digest(expected), digest(dto.managerCode))) {
        throw new ForbiddenException('Código de gestor inválido ou não configurado.');
      }
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('E-mail jÃ¡ cadastrado.');
    }

    const password = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.toLowerCase(),
        role,
        password,
        lastAccessAt: new Date(),
      },
    });

    const accessToken = await this.createToken(user.id, user.email, user.role, user.sessionVersion);

    return {
      user: this.publicUser(user),
      accessToken,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || !(await argon2.verify(user.password, dto.password))) {
      throw new UnauthorizedException('E-mail ou senha invÃ¡lidos.');
    }

    if (!user.isActive) throw new UnauthorizedException('Conta inativa. Entre em contato com a administração.');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastAccessAt: new Date() } });
    const accessToken = await this.createToken(user.id, user.email, user.role, user.sessionVersion);

    return {
      user: this.publicUser(user),
      accessToken,
    };
  }

  /** Logout invalida todas as sessoes do usuario, inclusive Bearer tokens copiados. */
  async logoutEverywhere(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
  }

  private async createToken(id: string, email: string, role: UserRole, sessionVersion: number) {
    return this.jwtService.signAsync({
      sub: id,
      email,
      role,
      sv: sessionVersion,
    });
  }

  private publicUser(user: { id: string; name: string; email: string; role: UserRole }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}

