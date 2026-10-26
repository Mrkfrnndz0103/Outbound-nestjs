import { Module } from '@nestjs/common';
import { GoogleSheetsService } from './google-sheets.service.js';
import { SeaTalkClient } from './seatalk.client.js';
import { SeaTalkController } from './seatalk.controller.js';
import { SeaTalkApprovalService } from './seatalk-approval.service.js';

@Module({
  providers: [SeaTalkClient, SeaTalkApprovalService, GoogleSheetsService],
  controllers: [SeaTalkController],
  exports: [SeaTalkClient, SeaTalkApprovalService, GoogleSheetsService],
})
export class IntegrationsModule {}
