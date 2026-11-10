import { describe, expect, it } from 'vitest';
import { centsToInput, feeStep, fivePercent, formatCents, fundingFee, instantPayoutFee, parseDollars, splitCents } from './money';

// Every expected value below was computed by the database's own functions (five_percent, instant_payout_fee,
// fee_step, split_cents), so the app's previews can never drift from what the database charges.
describe('the fee formulas match the database', () => {
  it.each([
    [0, 0, 0], [1, 0, 0], [9, 0, 0], [10, 1, 0], [29, 1, 0], [30, 2, 0], [9999, 500, 150], [10000, 500, 150],
    [15000, 750, 225], [30000, 1500, 450], [31570, 1579, 474], [123456789, 6172839, 1851852],
  ])('%i cents: 5%% = %i, instant payout fee = %i', (cents, five, instant) => {
    expect(fivePercent(cents)).toBe(five);
    expect(instantPayoutFee(cents)).toBe(instant);
  });

  it.each([[0, 15000, 750], [15000, 15000, 750], [10, 10, 0], [19, 1, 0], [29990, 7, 0]])('fee_step(%i, %i) = %i', (before, amount, fee) => {
    expect(feeStep(before, amount)).toBe(fee);
  });

  it.each([[30000, 2, [15000, 15000]], [100, 3, [33, 33, 34]], [1, 1, [1]], [99999, 7, [14285, 14285, 14285, 14285, 14285, 14285, 14289]]])(
    'split_cents(%i, %i)',
    (total, parts, expected) => {
      expect(splitCents(total, parts)).toEqual(expected);
      expect(splitCents(total, parts).reduce((a, b) => a + b, 0)).toBe(total);
    },
  );

  it('charges the funding fee on the running total, less what earlier payments were charged', () => {
    // $150 funded with $7.50 fee before; funding the other $150 adds 5% of $300 minus $7.50
    expect(fundingFee(15000, 750, 15000)).toBe(750);
    // three thirds of $100: the rounding lands once, not three times
    expect(fundingFee(0, 0, 3333) + fundingFee(3333, fivePercent(3333), 3333) + fundingFee(6666, fivePercent(6666), 3334)).toBe(fivePercent(10000));
  });
});

describe('dollars and cents', () => {
  it('formats cents as dollars', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(null)).toBe('$0.00');
  });

  it.each([
    ['300', 30000], ['299.99', 29999], ['$1,234.5', 123450], ['0.5', 50], [' 40 ', 4000], ['12.', 1200],
  ])('reads %s as %i cents', (text, cents) => expect(parseDollars(text)).toBe(cents));

  it.each(['', 'abc', '-5', '1.234', '1e3', '$', '12,34.5.6'])('rejects %s', (text) => expect(parseDollars(text)).toBeNull());

  it.each([['1,000', 100000], ['1,234,567.89', 123456789], ['$ 12,000', 1200000], ['999', 99900], ['1000000', 100000000], ['100,000', 10000000], ['0500', 50000]])(
    'takes a comma between groups of three digits as a thousands separator: %s',
    (text, cents) => expect(parseDollars(text)).toBe(cents),
  );

  // "299,99" is $299.99 to much of the world; stripping the comma made it $29,999.00, a hundred times the offer
  it.each(['299,99', '1,5', '0,50', '12,34', '1,2345', '1,23,456', ',500', '1,,000', '1,000,', '1.000,00', '0,500', '0,500.00', '00,500', '012,345'])(
    'asks again rather than guess at a comma that isn’t a thousands separator: %s',
    (text) => expect(parseDollars(text)).toBeNull(),
  );

  it('shows cents back as an input value', () => {
    expect(centsToInput(29999)).toBe('299.99');
    expect(centsToInput(null)).toBe('');
  });
});
