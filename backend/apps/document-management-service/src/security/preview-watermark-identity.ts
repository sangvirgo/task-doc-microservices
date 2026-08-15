export interface PreviewActorIdentity {
  userId: string;
  email?: string | null;
}

export function formatPreviewActorLabel(identity: PreviewActorIdentity): string {
  const email = identity.email?.trim() || 'unavailable';
  const name = email.includes('@') ? email.slice(0, email.indexOf('@')) : identity.userId;

  return `USER: ${name} | EMAIL: ${email} | ID: ${identity.userId}`;
}
