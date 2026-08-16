import type { Capability } from './capability';

export interface ManagedUser { id: string; email: string; role: 'ADMIN' | 'EMPLOYEE'; locked_at: string | null; capabilities: Capability[]; created_at: string; }
export interface MemberOption { id: string; email: string; }
export interface SecurityAlert { id: string; rule_id: string; severity: string; actor_id: string | null; description: string; status: string; resolved_at: string | null; resolved_by: string | null; created_at: string; metadata: Record<string, unknown> | null; }
export interface SecurityRule { id: string; name: string; description: string | null; rule_type: string; threshold: number; window_minutes: number; enabled: boolean; action: 'ALERT' | 'BLOCK'; send_alert_email: boolean; created_at: string; }
