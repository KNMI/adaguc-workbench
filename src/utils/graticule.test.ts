import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';
import { WMProj4Defs } from '@opengeoweb/webmap';
import {
  buildGraticule,
  formatLatitude,
  formatLongitude,
  getVisibleLonLatRange,
  GraticuleLine,
  niceDegreeStep,
} from './graticule';
import { getSameAreaBbox } from './sameAreaBbox';
import { registerExtraProjections } from './registerExtraProjections';

// The real proj4 and OpenLayers, as the map uses them: the projections
// opengeoweb defines itself, and the viewer's own on top.
WMProj4Defs.forEach(([code, definition]) => {
  proj4.defs(code, definition);
});
register(proj4);
registerExtraProjections();

const ALL_SRS = [
  'CRS:84',
  'EPSG:25831',
  'EPSG:25832',
  'EPSG:28992',
  'EPSG:3035',
  'EPSG:3067',
  'EPSG:32661',
  'EPSG:3395',
  'EPSG:3411',
  'EPSG:3412',
  'EPSG:3575',
  'EPSG:3832',
  'EPSG:3857',
  'EPSG:3994',
  'EPSG:40000',
  'EPSG:4258',
  'EPSG:4326',
  'EPSG:50001',
  'EPSG:5041',
  'EPSG:54030',
  'EPSG:7399',
  'EPSG:900913',
];

// Views in the base map's projection, [minX, minY, maxX, maxY].
const netherlands = [356222, 6371000, 812632, 7290000];
const europe = [-2000000, 3000000, 4000000, 15000000];
const aStreet = [545000, 6860000, 545500, 6861000];
const world = [-20037508, -20037508, 20037508, 20037508];
const acrossTheDateLine = [19000000, -3000000, 21000000, 1000000];

// The same area as a view in the base map's projection, in another srs.
const inSrs = (extent: number[], srs: string): number[] => {
  const bbox = getSameAreaBbox(
    {
      srs: 'EPSG:3857',
      bbox: {
        left: extent[0],
        bottom: extent[1],
        right: extent[2],
        top: extent[3],
      },
    },
    srs,
  );
  if (!bbox) {
    throw new Error(`no view in ${srs}`);
  }
  return [bbox.left, bbox.bottom, bbox.right, bbox.top];
};

// The lines that are in view: those are the ones with a label.
const inView = (
  lines: GraticuleLine[],
  kind: GraticuleLine['kind'],
): GraticuleLine[] =>
  lines.filter((line) => line.kind === kind && line.label !== null);

describe('niceDegreeStep', () => {
  it.each([
    [360, 30],
    [180, 20],
    [150, 15],
    [100, 10],
    [50, 5],
    [20, 2],
    [10, 1],
    [5, 0.5],
    [2, 0.2],
    [1, 0.1],
    [0.05, 0.005],
  ])('spaces lines over %s degrees %s degrees apart', (span, step) => {
    expect(niceDegreeStep(span)).toBeCloseTo(step, 9);
  });

  it('keeps the number of lines near ten for any span', () => {
    for (let span = 0.0001; span <= 360; span *= 1.07) {
      const lineCount = span / niceDegreeStep(span);
      // Round steps are up to 2.5 times apart (0.2 and 0.5), so the count
      // can be off by the square root of that either way.
      expect(lineCount).toBeGreaterThan(6);
      expect(lineCount).toBeLessThan(16);
    }
  });

  it('aims for another number of lines when asked', () => {
    expect(niceDegreeStep(100, 5)).toBe(20);
  });
});

describe('formatLongitude and formatLatitude', () => {
  it('names the hemisphere, except on the equator and the prime meridian', () => {
    expect(formatLongitude(5, 1)).toBe('5°E');
    expect(formatLongitude(-5, 1)).toBe('5°W');
    expect(formatLongitude(0, 1)).toBe('0°');
    expect(formatLatitude(52, 1)).toBe('52°N');
    expect(formatLatitude(-52, 1)).toBe('52°S');
    expect(formatLatitude(0, 1)).toBe('0°');
  });

  it('shows as many decimals as the step between lines has', () => {
    expect(formatLongitude(4.5, 0.5)).toBe('4.5°E');
    expect(formatLongitude(5, 0.5)).toBe('5.0°E');
    expect(formatLatitude(52.33, 0.01)).toBe('52.33°N');
    expect(formatLatitude(52.3005, 0.0005)).toBe('52.3005°N');
    expect(formatLatitude(0, 0.5)).toBe('0°');
  });

  it('counts longitudes past the date line back from 180', () => {
    expect(formatLongitude(190, 10)).toBe('170°W');
    expect(formatLongitude(-190, 10)).toBe('170°E');
    expect(formatLongitude(180, 10)).toBe('180°');
    expect(formatLongitude(-180, 10)).toBe('180°');
  });
});

describe('getVisibleLonLatRange', () => {
  it('finds the part of the globe a view shows', () => {
    const range = getVisibleLonLatRange(netherlands, 'EPSG:3857');

    expect(range?.lonMin).toBeCloseTo(3.2, 1);
    expect(range?.lonMax).toBeCloseTo(7.3, 1);
    expect(range?.latMin).toBeCloseTo(49.56, 1);
    expect(range?.latMax).toBeCloseTo(54.63, 1);
    expect(range?.isFullCircle).toBe(false);
  });

  it('finds the same part of the globe in a rotated projection', () => {
    // North is not up over the Netherlands in this polar projection, so
    // the view's corners are not its lowest and highest lon/lat.
    const range = getVisibleLonLatRange(
      inSrs(netherlands, 'EPSG:3411'),
      'EPSG:3411',
    );

    expect(range?.lonMin).toBeLessThan(3.2);
    expect(range?.lonMax).toBeGreaterThan(7.3);
    expect(range?.lonMax ?? NaN).toBeLessThan(12);
    expect(range?.latMin).toBeCloseTo(49.6, 0);
    expect(range?.latMax).toBeCloseTo(54.7, 0);
  });

  it('keeps a view across the date line as one stretch of longitudes', () => {
    // Regression guard: from the lowest to the highest longitude (-180 to
    // 180 here) would be nearly all of the globe, for a view 18 degrees
    // wide.
    const range = getVisibleLonLatRange(
      inSrs(acrossTheDateLine, 'EPSG:3832'),
      'EPSG:3832',
    );

    expect(range?.isFullCircle).toBe(false);
    expect(range?.lonMin).toBeCloseTo(170.7, 0);
    expect(range?.lonMax).toBeCloseTo(188.6, 0);
  });

  it('takes in all longitudes when a pole is in view', () => {
    // Around the north pole in a polar projection: every meridian
    // crosses the view.
    const range = getVisibleLonLatRange(
      [-1000000, -1000000, 1000000, 1000000],
      'EPSG:3575',
    );

    expect(range).toMatchObject({
      lonMin: -180,
      lonMax: 180,
      latMax: 90,
      isFullCircle: true,
    });
    expect(range?.latMin).toBeGreaterThan(70);
  });

  it('takes in all longitudes for a view of the whole world', () => {
    expect(getVisibleLonLatRange(world, 'EPSG:3857')).toMatchObject({
      lonMin: -180,
      lonMax: 180,
      isFullCircle: true,
    });
  });

  it('leaves out the part of a view that is not on the globe', () => {
    // A view twice as wide and high as the Mollweide world map: only the
    // points inside its oval lead back to themselves.
    const range = getVisibleLonLatRange(
      [-36000000, -18000000, 36000000, 18000000],
      'EPSG:7399',
    );

    expect(range).toMatchObject({ lonMin: -180, lonMax: 180 });
    expect(range?.latMin).toBeGreaterThanOrEqual(-90);
    expect(range?.latMax).toBeLessThanOrEqual(90);
  });

  it('returns null for a view that shows none of the globe', () => {
    // Beside the Mollweide world map.
    expect(
      getVisibleLonLatRange([30000000, 0, 31000000, 1000000], 'EPSG:7399'),
    ).toBeNull();
  });

  it('returns null for an srs the viewer has no projection for, or an empty view', () => {
    expect(getVisibleLonLatRange(netherlands, 'EPSG:9999')).toBeNull();
    expect(getVisibleLonLatRange([5, 5, 5, 5], 'EPSG:3857')).toBeNull();
  });
});

describe('buildGraticule', () => {
  it.each([
    ['the Netherlands', netherlands],
    ['Europe', europe],
    ['a street', aStreet],
    ['across the date line', acrossTheDateLine],
  ])(
    'keeps about ten lines each way in view of %s, in every srs',
    (_name, view) => {
      ALL_SRS.forEach((srs) => {
        const graticule = buildGraticule(inSrs(view, srs), srs);
        if (!graticule) {
          throw new Error(`no graticule in ${srs}`);
        }
        const meridians = inView(graticule.lines, 'meridian').length;
        const parallels = inView(graticule.lines, 'parallel').length;
        expect(meridians, `meridians in ${srs}`).toBeGreaterThanOrEqual(6);
        expect(meridians, `meridians in ${srs}`).toBeLessThanOrEqual(18);
        expect(parallels, `parallels in ${srs}`).toBeGreaterThanOrEqual(6);
        expect(parallels, `parallels in ${srs}`).toBeLessThanOrEqual(18);
      });
    },
  );

  it('puts lines on round numbers of degrees', () => {
    const graticule = buildGraticule(netherlands, 'EPSG:3857');

    expect(graticule).toMatchObject({ lonStep: 0.5, latStep: 0.5 });
    expect(
      inView(graticule?.lines ?? [], 'meridian').map((line) => line.value),
    ).toEqual([3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7]);
    expect(
      inView(graticule?.lines ?? [], 'parallel').map((line) => line.value),
    ).toEqual([50, 50.5, 51, 51.5, 52, 52.5, 53, 53.5, 54, 54.5]);
  });

  it('labels meridians where they leave the view at the top, and parallels at the left', () => {
    const graticule = buildGraticule(netherlands, 'EPSG:3857');

    inView(graticule?.lines ?? [], 'meridian').forEach((line) => {
      expect(line.label?.edge).toBe('top');
      expect(line.label?.coordinate[1]).toBeCloseTo(netherlands[3], 0);
      expect(line.label?.text).toBe(formatLongitude(line.value, 0.5));
    });
    inView(graticule?.lines ?? [], 'parallel').forEach((line) => {
      expect(line.label?.edge).toBe('left');
      expect(line.label?.coordinate[0]).toBeCloseTo(netherlands[0], 0);
      expect(line.label?.text).toBe(formatLatitude(line.value, 0.5));
    });
  });

  it('draws lines one step beyond the view, without a label', () => {
    const graticule = buildGraticule(netherlands, 'EPSG:3857');

    const unlabelled = (graticule?.lines ?? [])
      .filter((line) => line.label === null)
      .map((line) => `${line.kind} ${line.value}`);
    expect(unlabelled).toEqual(
      expect.arrayContaining(['meridian 3', 'meridian 7.5', 'parallel 55']),
    );
  });

  it('follows the curve of a line in a projection that bends it', () => {
    // The 52nd parallel over the Netherlands in a polar projection: an arc
    // around the pole, not a straight line between its two ends.
    const view = inSrs(netherlands, 'EPSG:40000');
    const graticule = buildGraticule(view, 'EPSG:40000');

    const parallel = graticule?.lines.find(
      (line) => line.kind === 'parallel' && line.value === 52,
    );
    const piece = parallel?.pieces[0] ?? [];
    expect(piece.length).toBeGreaterThan(30);
    // Every point of it at the same distance from the pole, at [0, 0].
    const radii = piece.map(([x, y]) => Math.hypot(x, y));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1);
    // ...which its middle would not be on a straight line.
    const first = piece[0];
    const last = piece[piece.length - 1];
    const straightMiddle = Math.hypot(
      (first[0] + last[0]) / 2,
      (first[1] + last[1]) / 2,
    );
    expect(radii[0] - straightMiddle).toBeGreaterThan(1000);
  });

  it('closes the parallels around a pole that is in view', () => {
    const graticule = buildGraticule(
      [-1000000, -1000000, 1000000, 1000000],
      'EPSG:3575',
    );

    expect(graticule?.lonStep).toBe(30);
    expect(
      (graticule?.lines ?? [])
        .filter((line) => line.kind === 'meridian')
        .map((line) => line.value),
    ).toEqual([-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150]);
    const parallel = graticule?.lines.find(
      (line) => line.kind === 'parallel' && line.value === 85,
    );
    const piece = parallel?.pieces[0] ?? [];
    expect(parallel?.pieces).toHaveLength(1);
    expect(piece[0][0]).toBeCloseTo(piece[piece.length - 1][0], 3);
    expect(piece[0][1]).toBeCloseTo(piece[piece.length - 1][1], 3);
  });

  it.each(['EPSG:3395', 'EPSG:3832', 'EPSG:54030', 'EPSG:7399', 'EPSG:3994'])(
    'never draws a line across the world map of %s',
    (srs) => {
      // Regression guard: a parallel that runs off one side of a world map
      // carries on at the other side. Drawn in one go, the step between
      // those two is a line straight across the whole map.
      const view = inSrs(acrossTheDateLine, srs);
      const zoomedOut = [
        view[0] - 30000000,
        view[1] - 15000000,
        view[2] + 30000000,
        view[3] + 15000000,
      ];
      const graticule = buildGraticule(zoomedOut, srs);
      if (!graticule) {
        throw new Error(`no graticule in ${srs}`);
      }

      graticule.lines.forEach((line) => {
        line.pieces.forEach((piece) => {
          for (let i = 1; i < piece.length; i += 1) {
            const step = Math.hypot(
              piece[i][0] - piece[i - 1][0],
              piece[i][1] - piece[i - 1][1],
            );
            // No step anywhere near the width of the world (some 36000 km
            // on these maps).
            expect(step, `${line.kind} ${line.value}`).toBeLessThan(8000000);
          }
        });
      });
    },
  );

  it('leaves out what a projection cannot show', () => {
    // Mercator has no poles: its meridians end before them, rather than
    // running off to infinity.
    const graticule = buildGraticule(world, 'EPSG:3857');

    (graticule?.lines ?? []).forEach((line) => {
      line.pieces.forEach((piece) => {
        piece.forEach((point) => {
          expect(Number.isFinite(point[0])).toBe(true);
          expect(Number.isFinite(point[1])).toBe(true);
        });
      });
    });
    expect(
      (graticule?.lines ?? []).some(
        (line) => line.kind === 'parallel' && Math.abs(line.value) === 90,
      ),
    ).toBe(false);
  });

  it('returns null when there is nothing to draw', () => {
    expect(buildGraticule(netherlands, 'EPSG:9999')).toBeNull();
    expect(
      buildGraticule([30000000, 0, 31000000, 1000000], 'EPSG:7399'),
    ).toBeNull();
  });
});
