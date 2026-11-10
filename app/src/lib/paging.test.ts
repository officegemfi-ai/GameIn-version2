import { describe, expect, it } from 'vitest';
import { loadedRows, nextPage, PAGE, pageRange } from './paging';

describe('lists a page at a time', () => {
  it('asks for one page of rows, both ends included, with no gap or overlap between pages', () => {
    expect(pageRange(0)).toEqual([0, PAGE - 1]);
    expect(pageRange(1)).toEqual([PAGE, 2 * PAGE - 1]);
    expect(pageRange(3, 24)).toEqual([72, 95]);
    for (let page = 0; page < 5; page++) expect(pageRange(page + 1)[0]).toBe(pageRange(page)[1] + 1);
  });

  it('knows there is more only while pages come back full', () => {
    const full = Array.from({ length: PAGE }, (_, i) => i);
    expect(nextPage(full, [full])).toBe(1);
    expect(nextPage(full, [full, full])).toBe(2);
    expect(nextPage(full.slice(0, PAGE - 1), [full, full.slice(0, PAGE - 1)])).toBeUndefined();
    expect(nextPage([], [[]])).toBeUndefined();
    // a full last page that happens to be the end: one more (empty) page is asked for, and that ends it
    expect(nextPage([], [full, []])).toBeUndefined();
    expect(nextPage([1, 2], [[1, 2]], 2)).toBe(1);
  });

  it('shows the pages loaded so far as one list, in order', () => {
    expect(loadedRows(undefined)).toEqual([]);
    expect(loadedRows({ pages: [[1, 2], [3], []] })).toEqual([1, 2, 3]);
  });
});
