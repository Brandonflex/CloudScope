import {
  asArray,
  asRecord,
  cellValue,
  compactCurrency,
  currency,
  dateTime,
  humanize,
  percent,
  providerLabel,
  riskClass,
  severityClass,
  shortDate,
  statusLabel,
  timeAgo,
  typeLabel
} from './format';

describe('format helpers', () => {
  describe('currency', () => {
    it('formats whole and fractional amounts as USD', () => {
      expect(currency(1234.5)).toBe('$1,234.50');
      expect(currency(0)).toBe('$0.00');
    });

    it('treats null and undefined as zero', () => {
      expect(currency(null)).toBe('$0.00');
      expect(currency(undefined, 0)).toBe('$0');
    });

    it('formats compact currency for chart labels', () => {
      expect(compactCurrency(1250)).toBe('$1.3K');
    });
  });

  describe('percent', () => {
    it('renders a percentage with the requested precision', () => {
      expect(percent(68.24)).toBe('68%');
      expect(percent(68.24, 1)).toBe('68.2%');
      expect(percent(undefined)).toBe('0%');
    });
  });

  describe('dates', () => {
    it('formats valid dates and degrades gracefully', () => {
      expect(shortDate('2026-10-19T00:00:00Z')).toMatch(/Oct 1[89]/);
      expect(shortDate('not-a-date')).toBe('—');
      expect(shortDate(null)).toBe('—');
      expect(dateTime(undefined)).toBe('—');
    });

    it('describes relative time', () => {
      expect(timeAgo(new Date().toISOString())).toMatch(/^\d+s ago$/);
      expect(timeAgo(null)).toBe('never');
      expect(timeAgo('nonsense')).toBe('never');
    });
  });

  describe('labels', () => {
    it('maps known resource types and humanises unknown ones', () => {
      expect(typeLabel('VirtualMachine')).toBe('Virtual machine');
      expect(typeLabel('CustomWidget')).toBe('Custom Widget');
    });

    it('normalises provider, status and humanised identifiers', () => {
      expect(providerLabel('AWS')).toBe('AWS');
      expect(providerLabel('Azure')).toBe('Azure');
      expect(statusLabel('Healthy')).toBe('Healthy');
      expect(humanize('cost_center')).toBe('Cost center');
    });

    it('builds CSS class names for risk and severity', () => {
      expect(riskClass('High')).toBe('risk-high');
      expect(severityClass('Critical')).toBe('severity-critical');
      expect(severityClass(undefined)).toBe('severity-medium');
      expect(severityClass('INFO')).toBe('severity-low');
    });
  });

  describe('property access helpers', () => {
    it('coerces unknown property values into display strings', () => {
      expect(cellValue(null)).toBe('—');
      expect(cellValue(true)).toBe('Yes');
      expect(cellValue(['a', 1])).toBe('a, 1');
      expect(cellValue({ a: 1 })).toBe('{"a":1}');
    });

    it('guards object and array access', () => {
      expect(asRecord({ a: 1 })).toEqual({ a: 1 });
      expect(asRecord('nope')).toEqual({});
      expect(asArray([1, 2])).toEqual([1, 2]);
      expect(asArray('nope')).toEqual([]);
    });
  });
});
