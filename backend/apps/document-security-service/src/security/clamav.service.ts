import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'fs';
import { Socket } from 'net';

@Injectable()
export class ClamavService {
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.host = this.configService.get<string>('CLAMAV_HOST') || 'localhost';
    this.port = Number(this.configService.get<number | string>('CLAMAV_PORT') || 3310);
    this.timeoutMs = Number(this.configService.get<number | string>('CLAMAV_TIMEOUT_MS') || 10_000);
  }

  async scanFile(filePath: string): Promise<{ clean: true } | { clean: false; result: string }> {
    const socket = new Socket();

    return new Promise((resolve, reject) => {
      let settled = false;
      let response = '';

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(error);
      };

      socket.setTimeout(this.timeoutMs, () => {
        fail(new ServiceUnavailableException('ClamAV scan timed out'));
      });

      socket.once('error', (error) => {
        fail(new ServiceUnavailableException(`ClamAV unavailable: ${error.message}`));
      });

      socket.on('data', (chunk: Buffer) => {
        response += chunk.toString('utf8');
      });

      socket.once('close', () => {
        if (settled) return;
        settled = true;
        const normalized = response.replace(/\0/g, '').trim();
        if (!normalized) {
          reject(new InternalServerErrorException('ClamAV returned an empty response'));
          return;
        }
        if (normalized.endsWith('OK')) {
          resolve({ clean: true });
          return;
        }
        if (normalized.includes('FOUND')) {
          resolve({ clean: false, result: normalized });
          return;
        }
        reject(new InternalServerErrorException(`Malformed ClamAV response: ${normalized}`));
      });

      socket.connect(this.port, this.host, () => {
        socket.write('zINSTREAM\0');
        const input = createReadStream(filePath);

        input.on('error', (error) => {
          fail(
            new InternalServerErrorException(`Unable to read upload for scan: ${error.message}`),
          );
        });

        input.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const length = Buffer.alloc(4);
          length.writeUInt32BE(buffer.length, 0);
          socket.write(length);
          socket.write(buffer);
        });

        input.on('end', () => {
          const endMarker = Buffer.alloc(4);
          endMarker.writeUInt32BE(0, 0);
          socket.write(endMarker);
        });
      });
    });
  }
}
