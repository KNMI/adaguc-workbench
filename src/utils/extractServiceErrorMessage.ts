// A failed WMS/WCS request (e.g. GetFeatureInfo past the server's own
// maxquerylimit) responds with a non-2xx status and an OGC
// <ServiceExceptionReport> XML body - even when INFO_FORMAT=json was
// requested - rather than JSON. Pulls the human-readable message out of
// that, falling back to the raw response text when it isn't recognizably
// an OGC exception report.
export const extractServiceErrorMessage = (responseText: string): string => {
  const trimmed = responseText.trim();
  if (!trimmed) {
    return 'The server returned an empty error response.';
  }
  if (trimmed.startsWith('<')) {
    const xmlDoc = new DOMParser().parseFromString(trimmed, 'text/xml');
    const exceptionText = xmlDoc
      .querySelector('ServiceException, Exception, ExceptionText')
      ?.textContent?.trim();
    if (exceptionText) {
      return exceptionText;
    }
  }
  return trimmed;
};
