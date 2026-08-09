import { formatPreviewActorLabel } from '../src/security/preview-watermark-identity';

describe('formatPreviewActorLabel', () => {
  it('includes a readable user name, email, and stable user id', () => {
    expect(
      formatPreviewActorLabel({
        userId: 'user-123',
        email: 'alice.nguyen@example.com',
      }),
    ).toBe('USER: alice.nguyen | EMAIL: alice.nguyen@example.com | ID: user-123');
  });

  it('falls back to the user id when the email is unavailable', () => {
    expect(formatPreviewActorLabel({ userId: 'user-123' })).toBe(
      'USER: user-123 | EMAIL: unavailable | ID: user-123',
    );
  });
});
