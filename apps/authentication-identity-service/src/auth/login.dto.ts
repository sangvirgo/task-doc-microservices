import { z } from 'zod';

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in_seconds: number;
}
