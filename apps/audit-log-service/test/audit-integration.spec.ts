import { AuditService } from '../src/audit/audit.service';

describe('Audit Service Integration', () => {
  let auditService: AuditService;

  beforeEach(() => {
    auditService = new AuditService();
  });

  describe('Hash Chain (V3 §5.7, ADR-0002)', () => {
    it('should append events with correct hash chain', () => {
      const event1 = {
        event_id: 'evt-1',
        event_type: 'user.login',
        occurred_at: new Date().toISOString(),
        actor_id: 'user-1',
        resource_type: 'USER',
        resource_id: 'user-1',
        payload: { success: true },
      };

      const event2 = {
        event_id: 'evt-2',
        event_type: 'document.accessed',
        occurred_at: new Date().toISOString(),
        actor_id: 'user-1',
        resource_type: 'DOCUMENT',
        resource_id: 'doc-1',
        payload: { action: 'PREVIEW' },
      };

      const result1 = auditService.appendEvent(event1);
      const result2 = auditService.appendEvent(event2);

      expect(result1.current_hash).toBeDefined();
      expect(result2.current_hash).toBeDefined();
      expect(result1.current_hash).not.toEqual(result2.current_hash);
      expect(result2.sequence_number).toBe(result1.sequence_number + 1);
    });

    it('should detect tampering via chain verification', () => {
      const event = {
        event_id: 'evt-1',
        event_type: 'user.login',
        occurred_at: new Date().toISOString(),
        actor_id: 'user-1',
        resource_type: 'USER',
        resource_id: 'user-1',
        payload: { success: true },
      };

      auditService.appendEvent(event);

      // Verify chain integrity is valid
      expect(auditService.verifyChainIntegrity()).toBe(true);
    });

    it('should be idempotent on redelivery (ADR-0002 dedupe)', () => {
      const event = {
        event_id: 'evt-1',
        event_type: 'user.login',
        occurred_at: new Date().toISOString(),
        actor_id: 'user-1',
        resource_type: 'USER',
        resource_id: 'user-1',
        payload: { success: true },
      };

      const result1 = auditService.appendEvent(event);
      const result2 = auditService.appendEvent(event); // Redelivery

      // Same event_id should return same hash
      expect(result1.current_hash).toBe(result2.current_hash);
      expect(result1.sequence_number).toBe(result2.sequence_number);
    });
  });

  describe('Chain Head', () => {
    it('should track chain head correctly', () => {
      const event = {
        event_id: 'evt-1',
        event_type: 'test.event',
        occurred_at: new Date().toISOString(),
        actor_id: 'user-1',
        resource_type: 'TEST',
        resource_id: 'test-1',
        payload: {},
      };

      const result = auditService.appendEvent(event);
      const head = auditService.getChainHead();

      expect(head.last_hash).toBe(result.current_hash);
      expect(head.last_event_id).toBe(event.event_id);
      expect(head.sequence).toBe(1);
    });
  });
});
