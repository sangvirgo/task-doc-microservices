export interface AuthLoginFailedPayload {
  user_id?: string;
  reason: string;
}

export interface AuthSessionRevokedPayload {
  user_id: string;
  session_id: string;
}

export interface UserLockedPayload {
  user_id: string;
  locked_at: string;
}

export interface UserCapabilityGrantedPayload {
  user_id: string;
  capability: string;
  granted_by: string;
}
