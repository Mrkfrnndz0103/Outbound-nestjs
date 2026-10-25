import { Module } from '@nestjs/common';
import { PresenceController } from './presence.controller.js';

@Module({
  controllers: [PresenceController],
})
export class PresenceModule {}
