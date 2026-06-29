import { type Provider } from '@nestjs/common';
import { type TerminusAsyncOptions, type TerminusModuleOptions } from './terminus-options.interface';
export declare const createOptionsProvider: (options?: TerminusModuleOptions) => Provider;
export declare const createAsyncOptionsProvider: (options: TerminusAsyncOptions) => Provider;
export declare const createTerminusProviders: (options?: TerminusModuleOptions) => Provider[];
