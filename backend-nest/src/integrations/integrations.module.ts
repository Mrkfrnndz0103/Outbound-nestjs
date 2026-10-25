import { Module } from '@nestjs/common';
import { SeaTalkClient } from './seatalk.client.js';

@Module({
  providers: [SeaTalkClient],
  exports: [SeaTalkClient],
})
export class IntegrationsModule {}
