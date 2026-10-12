import { PresenceModule } from './presences/presence.module';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { RolesGuard } from './common/guards/roles.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { SafeExceptionFilter } from './common/filters/safe-exception.filter';
import { SecurityAuditInterceptor } from './common/interceptors/security-audit.interceptor';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { EventsModule } from './modules/events/events.module';
import { ActionsModule } from './modules/actions/actions.module';
import { RegistrationsModule } from './modules/registrations/registrations.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 120 }]),
    PresenceModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    EventsModule,
    ActionsModule,
    RegistrationsModule,
    CertificatesModule,
    DashboardModule,
    ReportsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: SecurityAuditInterceptor },
    { provide: APP_FILTER, useClass: SafeExceptionFilter },
  ],
})
export class AppModule {}