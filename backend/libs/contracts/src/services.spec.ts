import { SERVICE_NAMES, SERVICES } from './services';

describe('service registry', () => {
  it('declares the ten applications of V3 §3', () => {
    expect(SERVICE_NAMES).toEqual([
      'api-gateway',
      'authentication-identity-service',
      'user-role-management-service',
      'task-management-service',
      'document-management-service',
      'document-security-service',
      'permission-service',
      'audit-log-service',
      'notification-service',
      'security-monitoring-service',
    ]);
  });

  it('gives every service its own database, except the gateway which owns none', () => {
    const databases = SERVICES.map((service) => service.database).filter(
      (database) => database !== null,
    );

    expect(new Set(databases).size).toBe(databases.length);
    expect(databases).toHaveLength(9);
    expect(SERVICES.find((service) => service.name === 'api-gateway')?.database).toBeNull();
  });

  it('gives every service its own port', () => {
    const ports = SERVICES.map((service) => service.port);

    expect(new Set(ports).size).toBe(ports.length);
  });
});
