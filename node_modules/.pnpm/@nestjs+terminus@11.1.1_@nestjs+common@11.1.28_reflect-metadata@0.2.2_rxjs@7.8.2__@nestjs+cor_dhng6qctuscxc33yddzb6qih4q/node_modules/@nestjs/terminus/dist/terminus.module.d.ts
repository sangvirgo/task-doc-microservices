import { type DynamicModule } from '@nestjs/common';
import { type TerminusAsyncOptions, type TerminusModuleOptions } from './terminus-options.interface';
/**
 * The Terminus module integrates health checks
 * and graceful shutdowns in your Nest application
 *
 * @publicApi
 */
export declare class TerminusModule {
    /**
     * Register the module synchronously.
     */
    static forRoot(options?: TerminusModuleOptions): DynamicModule;
    /**
     * Register the module asynchronously.
     */
    static forRootAsync(options: TerminusAsyncOptions): DynamicModule;
    private static createAsyncProviders;
}
