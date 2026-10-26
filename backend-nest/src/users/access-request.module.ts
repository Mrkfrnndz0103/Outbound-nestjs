import { Module } from '@nestjs/common';
import { AccessRequestController } from './access-request.controller.js';

@Module({ controllers: [AccessRequestController] })
export class AccessRequestModule {}
