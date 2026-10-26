import { Module } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service.js';
import { SeaTalkClient } from './seatalk.client.js';
import { SeaTalkController } from './seatalk.controller.js';

@Module({
  providers: [SeaTalkClient, GoogleSheetsService],
  controllers: [SeaTalkController],
  exports: [SeaTalkClient, GoogleSheetsService],
})
export class IntegrationsModule {}
