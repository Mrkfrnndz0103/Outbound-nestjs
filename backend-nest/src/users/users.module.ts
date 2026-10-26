import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [DatabaseModule],
  controllers: [UsersController],
})
export class UsersModule {}
