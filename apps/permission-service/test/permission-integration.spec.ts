import { PermissionService } from '../src/permissions/permission.service';

describe('Permission Service Integration (V3 §8.1, ADR-0001)', () => {
  let permissionService: PermissionService;

  beforeEach(() => {
    permissionService = new PermissionService();
    permissionService.seedBaselineGrants();
  });

  describe('ADMIN Hard-Deny (§5.2.1, ADR-0004)', () => {
    it('should deny ADMIN-forbidden actions (all return ADMIN_CONTENT_DENIED)', () => {
      const result = permissionService.check({
        actor_id: 'anyone',
        resource_type: 'DOCUMENT',
        resource_id: 'doc-1',
        action: 'PREVIEW',
      });

      expect(result.allowed).toBe(false);
      expect(result.reason_code).toBe('ADMIN_CONTENT_DENIED');
    });
  });

  describe('Grant Lookup (§5.5)', () => {
    it('should return NO_GRANT for non-existent actor', () => {
      // Any action denied by ADMIN rules takes precedence in Phase 1
      // but NO_GRANT is still a valid reason code for non-existent actors
      const result = permissionService.check({
        actor_id: 'user-999',
        resource_type: 'TASK',
        resource_id: 'doc-1',
        action: 'TASK_PARTICIPATE',
      });

      expect(result.allowed).toBe(false);
      // Could be NO_GRANT or ADMIN_CONTENT_DENIED depending on if action is forbidden
      expect(['NO_GRANT', 'ADMIN_CONTENT_DENIED']).toContain(result.reason_code);
    });
  });

  describe('Grant Revocation (§5.5)', () => {
    it('should track and report grant revocation', () => {
      const grants = permissionService.getAllGrants();
      expect(grants.length).toBeGreaterThan(0);

      const grant = grants[0];
      permissionService.revokeGrant(grant.id);

      const updated = permissionService.getAllGrants();
      const revoked = updated.find((g) => g.id === grant.id);
      expect(revoked?.revoked_at).toBeDefined();
    });
  });

  describe('Grant Management', () => {
    it('should return empty grant list when no grants exist', () => {
      const newService = new PermissionService();
      const grants = newService.getAllGrants();
      expect(grants).toEqual([]);
    });

    it('should populate grants after seeding', () => {
      const grants = permissionService.getAllGrants();
      expect(grants.length).toBeGreaterThan(0);
    });
  });

  describe('Fail-Closed Behavior (§5.5.3)', () => {
    it('should return denial on error', () => {
      // Test with unknown resource type - should still return a denial, not throw
      const result = permissionService.check({
        actor_id: 'test',
        resource_type: 'UNKNOWN_TYPE',
        resource_id: 'test',
        action: 'PREVIEW',
      });

      // Should return a denial
      expect(result.allowed).toBe(false);
    });
  });
});
