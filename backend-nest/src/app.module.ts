import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { requestContextMiddleware } from './common/request-context.middleware.js';
import { HealthController } from './health/health.controller.js';
import { RequestModule } from './requests/request.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, RequestModule],
  controllers: [HealthController],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestContextMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
