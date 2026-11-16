// A dimension value that is a date-time (ISO 8601, e.g.
// "2026-11-16T07:40:00Z"), written out readably in the viewer's own time
// zone and in UTC - or null for any other value (an elevation, a member
// number, ...).
export interface TimeValueText {
  local: string;
  utc: string;
}

const FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
};

export const formatTimeValue = (
  value: string | undefined,
  // The viewer's own time zone unless given (for tests).
  localTimeZone?: string,
): TimeValueText | null => {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return {
    local: date.toLocaleString(undefined, {
      ...FORMAT,
      timeZone: localTimeZone,
    }),
    utc: date.toLocaleString(undefined, { ...FORMAT, timeZone: 'UTC' }),
  };
};
