import DOMPurify from 'dompurify';

const sanitizeHTML = (
  htmlToBeSanitezed: string,
): {
  __html: string;
} => ({
  __html: DOMPurify.sanitize(htmlToBeSanitezed, {
    ALLOWED_TAGS: [
      'b',
      'i',
      'em',
      'strong',
      'a',
      'table',
      'td',
      'tr',
      'br',
      'hr',
      'th',
    ],
    ALLOWED_ATTR: ['href'],
  }),
});
export default sanitizeHTML;
