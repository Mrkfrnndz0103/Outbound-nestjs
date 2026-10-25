import { Module } from '@nestjs/common';
import { SeaTalkClient } from './seatalk.client.js';
import { SeaTalkController } from './seatalk.controller.js';

@Module({
  providers: [SeaTalkClient],
  controllers: [SeaTalkController],
  exports: [SeaTalkClient],
})
export class IntegrationsModule {}
