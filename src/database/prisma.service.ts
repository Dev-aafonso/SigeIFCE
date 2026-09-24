import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly mockMode =
    process.env.MOCK_MODE === 'true';

  constructor() {
    const adapter = new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ||
        'postgresql://localhost:5432/sigeifce',
    });

    super({
      adapter,
    });
  }

  async onModuleInit() {
    if (this.mockMode) {
      console.log(
        'SIGE IFCE: MOCK_MODE ativo — PostgreSQL não será conectado.',
      );
      return;
    }

    await this.$connect();
  }

  async onModuleDestroy() {
    if (this.mockMode) {
      return;
    }

    await this.$disconnect();
  }
}
