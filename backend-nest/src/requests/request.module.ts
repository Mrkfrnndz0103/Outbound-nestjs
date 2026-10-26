import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RequestController } from './request.controller.js';
import { RequestService } from './request.service.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [RequestController],
  providers: [RequestService],
})
export class RequestModule {}
