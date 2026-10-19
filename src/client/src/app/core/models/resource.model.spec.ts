import {
  COMPLIANCE_FRAMEWORKS,
  PROVIDER_COLORS,
  RESOURCE_TYPES,
  RESOURCE_TYPE_LABELS,
  RISK_COLORS,
  STATUS_COLORS
} from './resource.model';

describe('resource model maps', () => {
  it('defines a label for every resource type', () => {
    for (const type of RESOURCE_TYPES) {
      expect(RESOURCE_TYPE_LABELS[type]).withContext(type).toBeTruthy();
    }
  });

  it('has no duplicate resource types', () => {
    expect(new Set(RESOURCE_TYPES).size).toBe(RESOURCE_TYPES.length);
  });

  it('defines colours for both providers and all risk levels', () => {
    expect(PROVIDER_COLORS.Azure).toBeTruthy();
    expect(PROVIDER_COLORS.AWS).toBeTruthy();

    for (const risk of ['Low', 'Medium', 'High', 'Critical'] as const) {
      expect(RISK_COLORS[risk]).withContext(risk).toBeTruthy();
    }
  });

  it('defines a colour for every health status', () => {
    for (const status of ['Healthy', 'Warning', 'Critical', 'Stopped', 'Provisioning', 'Deprovisioning', 'Unknown'] as const) {
      expect(STATUS_COLORS[status]).withContext(status).toBeTruthy();
    }
  });

  it('exposes the four compliance frameworks used by the API', () => {
    expect(COMPLIANCE_FRAMEWORKS).toEqual(['CIS', 'SOC2', 'HIPAA', 'GDPR']);
  });
});
