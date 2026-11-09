import { describe, expect, it } from 'vitest';
import { checkItems, checkTerms, dealDays, itemsFromJson, itemsToJson } from './items';

describe('deliverables', () => {
  it('reads the database JSON, skipping anything malformed', () => {
    expect(itemsFromJson([{ label: 'Stream', days: 5 }, { label: 'Clip' }, 'x', null, { days: 3 }, [1]])).toEqual([{ label: 'Stream', days: 5 }, { label: 'Clip' }]);
    expect(itemsFromJson(null)).toEqual([]);
    expect(itemsFromJson({ label: 'not an array' })).toEqual([]);
  });

  it('writes trimmed labels and whole days', () => {
    expect(itemsToJson([{ label: '  Stream ', days: 4.6 }, { label: 'Clip' }])).toEqual([{ label: 'Stream', days: 5 }, { label: 'Clip' }]);
  });

  it('follows the database rules (items_valid)', () => {
    expect(checkItems([])).toMatch(/1 to 20/);
    expect(checkItems(Array.from({ length: 21 }, () => ({ label: 'x' })))).toMatch(/1 to 20/);
    expect(checkItems([{ label: '  ' }])).toMatch(/Name deliverable 1/);
    expect(checkItems([{ label: 'x'.repeat(121) }])).toMatch(/over 120/);
    expect(checkItems([{ label: 'ok', days: 0 }])).toMatch(/1 to 365 days/);
    expect(checkItems([{ label: 'ok', days: 366 }])).toMatch(/1 to 365 days/);
    expect(checkItems([{ label: 'ok', days: 365 }, { label: 'fine' }])).toBeNull();
  });

  it('checks the amount the way check_terms does', () => {
    expect(checkTerms(null, [{ label: 'a' }])).toMatch(/above \$0/);
    expect(checkTerms(0, [{ label: 'a' }])).toMatch(/above \$0/);
    expect(checkTerms(1, [{ label: 'a' }, { label: 'b' }])).toMatch(/a cent per deliverable/);
    expect(checkTerms(1_000_000_001, [{ label: 'a' }])).toMatch(/\$10,000,000/);
    expect(checkTerms(30000, [{ label: 'a' }, { label: 'b' }])).toBeNull();
  });

  it('takes as long as the longest deliverable, 7 days when none is given', () => {
    expect(dealDays([{ label: 'a', days: 3 }, { label: 'b' }])).toBe(7);
    expect(dealDays([{ label: 'a', days: 30 }])).toBe(30);
  });
});
