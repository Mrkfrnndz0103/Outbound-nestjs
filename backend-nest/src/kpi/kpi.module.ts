import { Module } from '@nestjs/common';
import { KpiController } from './kpi.controller.js';

@Module({ controllers: [KpiController] })
export class KpiModule {}
