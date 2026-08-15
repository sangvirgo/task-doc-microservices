import { Global, Module } from '@nestjs/common';

import { EmailService } from './email.service';

/**
 * Shared SMTP sender. Registered as global so any app that imports it can inject EmailService
 * without declaring it again.
 */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}