import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, role: true },
      orderBy: { email: 'asc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return user;
  }

  async findMyProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return user;
  }

  async updateMyProfile(id: string, dto: UpdateProfileDto) {
    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();

    if (name.length < 2) {
      throw new BadRequestException('O nome deve ter pelo menos 2 caracteres.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing && existing.id !== id) {
      throw new ConflictException('Este e-mail já está em uso.');
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data: { name, email },
        select: { id: true, name: true, email: true, role: true },
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Este e-mail já está em uso.');
      }

      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Usuário não encontrado.');
      }

      throw error;
    }
  }

  async changeMyPassword(id: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.passwordConfirmation) {
      throw new BadRequestException(
        'A confirmação não corresponde à nova senha.',
      );
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'A nova senha deve ser diferente da senha atual.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const validPassword = await argon2.verify(
      user.password,
      dto.currentPassword,
    );

    if (!validPassword) {
      throw new UnauthorizedException('A senha atual está incorreta.');
    }

    const passwordHash = await argon2.hash(dto.newPassword);

    await this.prisma.user.update({
      where: { id },
      data: { password: passwordHash },
    });

    return { message: 'Senha alterada com sucesso.' };
  }

  async updateRole(id: string, role: UserRole) {
    await this.findById(id);

    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, role: true },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Usuário removido com sucesso.' };
  }
}
