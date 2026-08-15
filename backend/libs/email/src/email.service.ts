import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailInput {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface MailOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/**
 * Reads SMTP settings from the environment. Kept separate so callers can build a transport
 * with explicit options (tests) while production uses process.env.
 */
export function mailOptionsFromEnv(): MailOptions {
  return {
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.MAIL_PORT || 587),
    secure: (process.env.MAIL_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
    from: process.env.MAIL_FROM || process.env.MAIL_USER || '',
  };
}

/**
 * Thin SMTP sender. One shared transporter is created lazily on first use; failures propagate
 * so callers can decide whether a blocked email must fail the surrounding operation.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  async sendMail(input: MailInput, options: MailOptions = mailOptionsFromEnv()): Promise<void> {
    const transporter = this.getTransporter(options);
    try {
      await transporter.sendMail({
        from: options.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      this.logger.log(`email sent to=${input.to} subject="${input.subject}"`);
    } catch (error) {
      this.logger.error(
        `email failed to=${input.to} subject="${input.subject}" — ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw error;
    }
  }

  private getTransporter(options: MailOptions): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: options.host,
        port: options.port,
        secure: options.secure,
        auth: { user: options.user, pass: options.pass },
      });
    }
    return this.transporter;
  }
}