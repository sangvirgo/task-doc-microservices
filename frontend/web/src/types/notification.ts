export interface Notification {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string;
  channel: string;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface NotificationPreference {
  id: string;
  user_id: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
}
