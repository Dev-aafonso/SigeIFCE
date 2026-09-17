import { Module } from '@nestjs/common';

import { PrismaModule } from './database/prisma.module';

import { actionsModule } from './modules/actions/actions.module';
import { authModule } from './modules/auth/auth.module';
import { certificatesModule } from './modules/certificates/certificates.module';
import { eventsModule } from './modules/events/events.module';
import { registrationsModule } from './modules/registrations/registrations.module';
import { usersModule } from './modules/users/users.module';

@Module({
  imports: [
    PrismaModule,
    actionsModule,
    authModule,
    certificatesModule,
    eventsModule,
    registrationsModule,
    usersModule,

  ],
})
export class AppModule {}

