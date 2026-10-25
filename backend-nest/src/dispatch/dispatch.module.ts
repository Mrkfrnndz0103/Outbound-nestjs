import { Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller.js';

@Module({ controllers: [DispatchController] })
export class DispatchModule {}
