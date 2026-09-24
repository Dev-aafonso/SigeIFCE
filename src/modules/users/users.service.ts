import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import {
  USER_ROLES,
  UserRole,
} from './dto/select-role.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async selectRole(
    userId: string,
    role: UserRole,
  ) {
    if (!USER_ROLES.includes(role)) {
      throw new BadRequestException(
        'Função inválida.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado.',
      );
    }

    return this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        role,
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });
  }
}
