import { Controller, Get } from '@nestjs/common';

@Controller(['health', 'up'])
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'backend-nest',
      timestamp: new Date().toISOString(),
    };
  }
}
