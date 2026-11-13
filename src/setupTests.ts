import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

// jsdom doesn't provide these, but react-router (pulled in by
// @opengeoweb/authentication, which @opengeoweb/webmap imports) needs them
// as soon as it's loaded - i.e. by any test using the real store.
Object.assign(globalThis, { TextEncoder, TextDecoder });
