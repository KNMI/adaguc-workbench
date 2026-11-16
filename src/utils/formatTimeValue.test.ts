import { formatTimeValue } from './formatTimeValue';

describe('formatTimeValue', () => {
  it('writes a date-time out in the given local time zone and in UTC', () => {
    const text = formatTimeValue('2026-11-16T07:40:00Z', 'Europe/Amsterdam');

    expect(text?.utc).toContain('07:40:00');
    expect(text?.utc).toContain('UTC');
    // An hour ahead of UTC in the Dutch winter.
    expect(text?.local).toContain('08:40:00');
    expect(text?.local).not.toContain('UTC');
  });

  it('leaves values that are not a date-time alone', () => {
    expect(formatTimeValue('850')).toBeNull();
    expect(formatTimeValue('2026')).toBeNull();
    expect(formatTimeValue('2026-99-99T99:99:00Z')).toBeNull();
    expect(formatTimeValue(undefined)).toBeNull();
  });
});
