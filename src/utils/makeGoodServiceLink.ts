// Normalizes a WMS/WCS/AutoWMS service url so a query param can always be
// appended directly after the result - handles a url with no query string
// yet, one that already ends in exactly one "?"/"&", and one with a
// malformed/duplicated trailing separator (e.g. ".../autowms??", a common
// copy-paste slip) that would otherwise still be treated as "already has a
// separator" and produce a broken "??key=value" request no server
// recognizes - or the url having query params already but no trailing
// separator at all (producing a broken "...xkey=value" request instead).
export const makeGoodServiceLink = (service: string): string => {
  const trimmed = service.replace(/[?&]+$/, '');
  return `${trimmed}${trimmed.includes('?') ? '&' : '?'}`;
};
