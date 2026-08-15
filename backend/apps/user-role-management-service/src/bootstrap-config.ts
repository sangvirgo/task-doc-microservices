import type { INestApplication } from '@nestjs/common';

import { attachAuthContextFromHeaders } from '@c17/auth-context';

export function configureApp(app: INestApplication): void {
  app.use(attachAuthContextFromHeaders);
}
