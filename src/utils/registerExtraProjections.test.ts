import proj4 from 'proj4';
import { get as getOlProjection } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import { registerExtraProjections } from './registerExtraProjections';

vi.mock('proj4', () => ({
  default: { defs: vi.fn() },
}));
vi.mock('ol/proj/proj4', () => ({
  register: vi.fn(),
}));
// The OpenLayers projection each srs gets once registered - keeping track of
// the extent it's given.
const mockSetExtent = vi.hoisted(() => vi.fn());
vi.mock('ol/proj', () => ({
  get: vi.fn(() => ({ setExtent: mockSetExtent })),
}));

const mockProj4Defs = vi.mocked(proj4.defs);
const mockRegister = vi.mocked(register);
const mockGetOlProjection = vi.mocked(getOlProjection);

describe('registerExtraProjections', () => {
  // The module tracks whether it has already registered in its own
  // top-level state, so both assertions have to live in the same test:
  // calling it a second time (in a separate test) would be a silent
  // no-op by the time it runs, making "only registers once" trivially
  // true for the wrong reason.
  it('defines proj4 strings for projections @opengeoweb/webmap-react does not already register, registers them with OpenLayers, limits Robinson to its valid area, and only does so once', () => {
    registerExtraProjections();

    const definedCodes = mockProj4Defs.mock.calls.map(([code]) => code);
    expect(definedCodes).toEqual(
      expect.arrayContaining(['EPSG:54030', 'EPSG:25831', 'EPSG:25832']),
    );
    expect(mockRegister).toHaveBeenCalledWith(proj4);
    expect(mockRegister).toHaveBeenCalledTimes(1);

    // Without it, OpenLayers reprojecting base map tiles outside Robinson's
    // valid area froze the page.
    expect(mockGetOlProjection).toHaveBeenCalledWith('EPSG:54030');
    expect(mockSetExtent).toHaveBeenCalledWith([
      -17005833.33052523, -8625154.880728867, 17005833.33052523,
      8625154.880728867,
    ]);

    registerExtraProjections();

    expect(mockRegister).toHaveBeenCalledTimes(1);
  });
});
