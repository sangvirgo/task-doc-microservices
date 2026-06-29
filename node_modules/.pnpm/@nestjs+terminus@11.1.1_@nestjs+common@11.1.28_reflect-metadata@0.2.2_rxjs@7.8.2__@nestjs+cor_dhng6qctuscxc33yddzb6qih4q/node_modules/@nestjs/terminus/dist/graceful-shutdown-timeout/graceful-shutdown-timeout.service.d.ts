import { type BeforeApplicationShutdown, LoggerService } from '@nestjs/common';
import { TerminusModuleOptions } from '../';
/**
 * Handles Graceful shutdown timeout useful to await
 * for some time before the application shuts down.
 */
export declare class GracefulShutdownService implements BeforeApplicationShutdown {
    private readonly logger;
    private readonly options;
    constructor(logger: LoggerService, options: TerminusModuleOptions);
    private get isEnabled();
    beforeApplicationShutdown(signal: string): Promise<void>;
}
