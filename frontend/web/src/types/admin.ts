export interface ManagedUser { id: string; email: string; role: 'ADMIN' | 'EMPLOYEE'; locked_at: string | null; capabilities: string[]; created_at: string; }
export interface MemberOption { id: string; email: string; }
export interface SecurityAlert { id: string; rule_id: string; severity: string; actor_id: string | null; description: string; status: string; resolved_at: string | null; resolved_by: string | null; created_at: string; }
export interface SecurityRule { id: string; name: string; description: string | null; rule_type: string; threshold: number; window_minutes: number; enabled: boolean; action: 'ALERT' | 'BLOCK'; created_at: string; }
