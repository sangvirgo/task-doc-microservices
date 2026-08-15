import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { createReadStream } from 'fs';

@Injectable()
export class MinioStorageService {
  private readonly client: Client;
  private readonly bucket: string;
  private bucketEnsured = false;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.get<string>('MINIO_BUCKET') || 'documents';
    const useSsl = this.configService.get<boolean | string>('MINIO_USE_SSL');
    this.client = new Client({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT') || 'localhost',
      port: this.configService.get<number>('MINIO_PORT') || 9000,
      useSSL: useSsl === true || useSsl === 'true',
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY') || '',
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY') || '',
    });
  }

  async putObject(objectKey: string, filePath: string, size: number): Promise<void> {
    await this.ensureBucket();
    await this.client.putObject(this.bucket, objectKey, createReadStream(filePath), size);
  }

  async getObject(objectKey: string): Promise<NodeJS.ReadableStream> {
    await this.ensureBucket();
    return this.client.getObject(this.bucket, objectKey);
  }

  async removeObject(objectKey: string): Promise<void> {
    await this.ensureBucket();
    await this.client.removeObject(this.bucket, objectKey);
  }

  async statObject(objectKey: string) {
    await this.ensureBucket();
    return this.client.statObject(this.bucket, objectKey);
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return;

    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
    const confirmed = await this.client.bucketExists(this.bucket);
    if (!confirmed) {
      throw new InternalServerErrorException(`MinIO bucket ${this.bucket} is unavailable`);
    }

    this.bucketEnsured = true;
  }
}
