import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
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
      throw new ConflictException('As senhas não coincidem.');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('E-mail já cadastrado.');
    }

    const password = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        password,
        // role não é enviado: o Prisma aplica @default(ALUNO).
      },
    });

    const accessToken = await this.createToken(user.id, user.email, user.role);

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
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const accessToken = await this.createToken(user.id, user.email, user.role);

    return {
      user: this.publicUser(user),
      accessToken,
    };
  }

  private async createToken(id: string, email: string, role: UserRole) {
    return this.jwtService.signAsync({
      sub: id,
      email,
      role,
    });
  }

  private publicUser(user: { id: string; email: string; role: UserRole }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}