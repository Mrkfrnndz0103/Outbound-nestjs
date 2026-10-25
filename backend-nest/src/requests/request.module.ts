import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RequestController } from './request.controller.js';
import { RequestService } from './request.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RequestController],
  providers: [RequestService],
})
export class RequestModule {}
