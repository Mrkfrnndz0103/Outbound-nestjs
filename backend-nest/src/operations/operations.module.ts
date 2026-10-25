import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { OperationsController } from './operations.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [OperationsController],
})
export class OperationsModule {}
