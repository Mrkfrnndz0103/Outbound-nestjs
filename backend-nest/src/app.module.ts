import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { requestContextMiddleware } from './common/request-context.middleware.js';
import { HealthController } from './health/health.controller.js';
import { RequestModule } from './requests/request.module.js';
import { OperationsModule } from './operations/operations.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    IntegrationsModule,
    AuthModule,
    RequestModule,
    OperationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestContextMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
