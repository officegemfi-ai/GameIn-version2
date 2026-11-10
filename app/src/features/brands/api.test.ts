import { describe, expect, it } from 'vitest';
import { brandSlug } from './api';

const SLUG = /^[a-z0-9-]{2,40}$/; // brands.slug, as the database checks it

describe('a brand’s web name', () => {
  it.each(['HYPERCORE', 'Orbital Audio', 'L’Oréal Gaming', '  Grid Fuel  ', 'A1'])('is left to the database when its own passes (%s)', (name) => {
    expect(brandSlug(name)).toBeUndefined();
  });

  it('is cut to fit when the name is longer than a web name can be', () => {
    const slug = brandSlug('The Really Long Named Esports Energy Drink Company')!; // 50 characters as a web name
    expect(slug).toMatch(SLUG);
    expect(slug.startsWith('the-really-long-named-esports-en')).toBe(true);
    // a cut that lands on a dash doesn't leave two in a row
    expect(brandSlug('Thirty One Characters Of Words x and then a great deal more of them')).not.toMatch(/--/);
  });

  it('keeps two long names apart that only differ past the cut, and the same name the same', () => {
    const texas = brandSlug('The Really Long Named Esports Energy Drink Company of Texas')!;
    const ohio = brandSlug('The Really Long Named Esports Energy Drink Company of Ohio')!;
    expect(texas).not.toBe(ohio); // one web name for both would have the second refused as "taken"
    expect(brandSlug('the really long named esports energy drink company of TEXAS!')).toBe(texas); // still the same brand name
    expect(texas).toMatch(SLUG);
    expect(ohio).toMatch(SLUG);
  });

  it.each(['任天堂 ゲーム', 'Игровой Бренд', '🎮', 'X', '—', 'é'])('is a neutral one when the name has too little to make one from (%s)', (name) => {
    expect(brandSlug(name)).toMatch(SLUG);
  });

  it('keeps the one letter there is, and tells such names apart', () => {
    expect(brandSlug('X')).toMatch(/^x-[a-z0-9]{7}$/);
    expect(brandSlug('任天堂')).toMatch(/^brand-[a-z0-9]{7}$/);
    expect(brandSlug('任天堂')).not.toBe(brandSlug('セガ'));
    expect(brandSlug(' 任天堂 ')).toBe(brandSlug('任天堂'));
  });
});
