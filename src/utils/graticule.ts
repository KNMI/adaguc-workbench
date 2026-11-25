import { get as getOlProjection, transform } from 'ol/proj';

// The latitude/longitude lines for a map view, worked out in the browser:
// which meridians and parallels to draw so that there are about ten of each
// in view, their shape in the view's projection, and where to label them.
//
// Works from the view alone - by asking the projection where points of the
// view are on the globe - so it needs to know nothing about the projection
// itself, and handles every srs the viewer can show.

const LON_LAT = 'EPSG:4326';

// About this many meridians, and this many parallels, in view.
export const TARGET_LINE_COUNT = 10;

// How many points of the view are asked for their lon/lat, along each side.
const SAMPLES_PER_SIDE = 17;
// How many straight pieces a line is drawn with, over the part in view.
const PIECES_PER_LINE = 64;
// A safeguard: never more lines than this of either kind.
const MAX_LINE_COUNT = 60;

// [minX, minY, maxX, maxY] in the view's projection.
type Extent = number[];
type Coordinate = number[];

export interface LonLatRange {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  // All the way around the globe: lonMin is -180 and lonMax 180.
  isFullCircle: boolean;
}

export type LabelEdge = 'top' | 'bottom' | 'left' | 'right' | 'none';

export interface GraticuleLabel {
  text: string;
  coordinate: Coordinate;
  // The side of the view the label sits at, to draw its text inward from -
  // or 'none' for a line that ends inside the view.
  edge: LabelEdge;
}

export interface GraticuleLine {
  kind: 'meridian' | 'parallel';
  // Its longitude or latitude, in degrees.
  value: number;
  // In the view's projection. More than one piece when the line is cut:
  // by the edge of the projection, or where it can't be shown.
  pieces: Coordinate[][];
  label: GraticuleLabel | null;
}

export interface Graticule {
  lonStep: number;
  latStep: number;
  lines: GraticuleLine[];
}

// 45, 30, 20, 15 and 10 degrees, then 5, 2, 1, 0.5, 0.2, 0.1, ... down to a
// millionth of a degree (some 10 cm).
const DEGREE_STEPS: number[] = [
  45,
  30,
  20,
  15,
  10,
  ...[0, -1, -2, -3, -4, -5, -6].flatMap((exponent) =>
    [5, 2, 1].map((digit) => digit * 10 ** exponent),
  ),
];

// The round number of degrees between lines that comes closest to
// `lineCount` lines over `span` degrees.
export const niceDegreeStep = (
  span: number,
  lineCount = TARGET_LINE_COUNT,
): number => {
  const ideal = span / lineCount;
  return DEGREE_STEPS.reduce((best, step) =>
    Math.abs(Math.log(step / ideal)) < Math.abs(Math.log(best / ideal))
      ? step
      : best,
  );
};

const decimalsOf = (step: number): number =>
  step >= 1 ? 0 : Math.ceil(-Math.log10(step) - 1e-9);

// A multiple of the step, without the rounding noise of multiplying (3 x
// 0.1 is not 0.3).
const multipleOf = (step: number, count: number): number =>
  Number((count * step).toFixed(decimalsOf(step)));

const formatDegrees = (
  value: number,
  step: number,
  positive: string,
  negative: string,
): string => {
  const text = Math.abs(value).toFixed(decimalsOf(step));
  if (Number(text) === 0) {
    return '0°';
  }
  return `${text}°${value < 0 ? negative : positive}`;
};

export const formatLongitude = (longitude: number, step: number): string => {
  // Into -180..180: a view across the date line counts on past 180.
  const wrapped = ((((longitude + 180) % 360) + 360) % 360) - 180;
  if (Math.abs(Math.abs(wrapped) - 180) < 1e-9) {
    return `${(180).toFixed(decimalsOf(step))}°`;
  }
  return formatDegrees(wrapped, step, 'E', 'W');
};

export const formatLatitude = (latitude: number, step: number): string =>
  formatDegrees(latitude, step, 'N', 'S');

const isFinitePoint = (point: Coordinate | null): point is Coordinate =>
  point !== null && Number.isFinite(point[0]) && Number.isFinite(point[1]);

// proj4 throws for some coordinates outside a projection's valid area.
const project = (
  point: Coordinate,
  from: string,
  to: string,
): Coordinate | null => {
  try {
    const result = transform(point, from, to);
    return isFinitePoint(result) ? result : null;
  } catch {
    return null;
  }
};

const contains = (extent: Extent, point: Coordinate): boolean =>
  point[0] >= extent[0] &&
  point[0] <= extent[2] &&
  point[1] >= extent[1] &&
  point[1] <= extent[3];

const distance = (a: Coordinate, b: Coordinate): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

// Whether the pole is a single point of the map that is in view - as in a
// polar projection, where every meridian then crosses the view. (In a
// projection like Mercator the pole is infinitely far away, and in plain
// lon/lat it is a line.)
const isPoleInView = (
  extent: Extent,
  srs: string,
  latitude: number,
): boolean => {
  const pole = project([0, latitude], LON_LAT, srs);
  const sameFromElsewhere = project([90, latitude], LON_LAT, srs);
  if (!pole || !sameFromElsewhere || !contains(extent, pole)) {
    return false;
  }
  const tolerance =
    Math.max(extent[2] - extent[0], extent[3] - extent[1]) / 1e6;
  return distance(pole, sameFromElsewhere) <= tolerance;
};

// The part of the globe a view shows: the lon/lat of a grid of points over
// the view. Null when none of the view is on the globe.
export const getVisibleLonLatRange = (
  extent: Extent,
  srs: string,
): LonLatRange | null => {
  const width = extent[2] - extent[0];
  const height = extent[3] - extent[1];
  if (!getOlProjection(srs) || !(width > 0) || !(height > 0)) {
    return null;
  }
  // About a pixel: a point of the view is only on the globe when its
  // lon/lat leads back to it. Outside a world map's outline - around a
  // Robinson or Mollweide map, or beside a Mercator one - a projection
  // still gives an answer, but not one that leads back.
  const tolerance = Math.max(width, height) / 1000;
  const lons: number[] = [];
  const lats: number[] = [];
  for (let row = 0; row < SAMPLES_PER_SIDE; row += 1) {
    for (let column = 0; column < SAMPLES_PER_SIDE; column += 1) {
      const point = [
        extent[0] + (width * column) / (SAMPLES_PER_SIDE - 1),
        extent[1] + (height * row) / (SAMPLES_PER_SIDE - 1),
      ];
      const lonLat = project(point, srs, LON_LAT);
      if (lonLat && Math.abs(lonLat[1]) <= 90 + 1e-9) {
        const back = project(lonLat, LON_LAT, srs);
        if (back && distance(back, point) <= tolerance) {
          lons.push(lonLat[0]);
          lats.push(lonLat[1]);
        }
      }
    }
  }
  if (lons.length < 2) {
    return null;
  }

  const northPoleInView = isPoleInView(extent, srs, 90);
  const southPoleInView = isPoleInView(extent, srs, -90);
  const latMin = southPoleInView ? -90 : Math.max(-90, Math.min(...lats));
  const latMax = northPoleInView ? 90 : Math.min(90, Math.max(...lats));

  // The longitudes in view are an arc of the circle of longitudes: all of
  // it but the largest gap between two neighbouring ones. (Not simply from
  // the lowest to the highest: a view across the date line has 179 and
  // -179 in it.)
  lons.sort((a, b) => a - b);
  const lowest = lons[0];
  const highest = lons[lons.length - 1];
  let lonMin = lowest;
  let lonMax = highest;
  let largestGap = lowest + 360 - highest;
  for (let i = 1; i < lons.length; i += 1) {
    const gap = lons[i] - lons[i - 1];
    if (gap > largestGap) {
      largestGap = gap;
      lonMin = lons[i];
      lonMax = lons[i - 1] + 360;
    }
  }
  // Nearly all the way around counts as all the way: with the gap that
  // small, it can't be told apart from the spacing of the points asked.
  const isFullCircle =
    northPoleInView || southPoleInView || lonMax - lonMin > 300;
  return isFullCircle
    ? { lonMin: -180, lonMax: 180, latMin, latMax, isFullCircle }
    : { lonMin, lonMax, latMin, latMax, isFullCircle };
};

// A line given in lon/lat, in the view's projection - cut wherever the
// projection can't show it, and wherever it jumps: a parallel running off
// one side of a world map carries on at the other side, which must not be
// drawn as a line across the map. A jump shows in the point halfway two
// lon/lats not being halfway their two points on the map.
const projectLine = (lonLats: Coordinate[], srs: string): Coordinate[][] => {
  const pieces: Coordinate[][] = [];
  let piece: Coordinate[] = [];
  let previous: Coordinate | null = null;
  let previousLonLat: Coordinate | null = null;
  const cut = (): void => {
    if (piece.length > 1) {
      pieces.push(piece);
    }
    piece = [];
  };
  lonLats.forEach((lonLat) => {
    const point = project(lonLat, LON_LAT, srs);
    if (!point) {
      cut();
      previous = null;
      previousLonLat = null;
      return;
    }
    if (previous && previousLonLat) {
      const halfway = project(
        [
          (previousLonLat[0] + lonLat[0]) / 2,
          (previousLonLat[1] + lonLat[1]) / 2,
        ],
        LON_LAT,
        srs,
      );
      const halfwayOnMap = [
        (previous[0] + point[0]) / 2,
        (previous[1] + point[1]) / 2,
      ];
      if (
        !halfway ||
        distance(halfway, halfwayOnMap) > 0.25 * distance(previous, point)
      ) {
        cut();
      }
    }
    piece.push(point);
    previous = point;
    previousLonLat = lonLat;
  });
  cut();
  return pieces;
};

const nearestEdge = (extent: Extent, point: Coordinate): LabelEdge => {
  const distances: [LabelEdge, number][] = [
    ['left', point[0] - extent[0]],
    ['right', extent[2] - point[0]],
    ['bottom', point[1] - extent[1]],
    ['top', extent[3] - point[1]],
  ];
  return distances.reduce((best, candidate) =>
    candidate[1] < best[1] ? candidate : best,
  )[0];
};

// Where a line's label goes: where the line leaves the view - at the top
// if it does so more than once for a meridian, at the left for a parallel
// - or else, for a line that stays inside the view, at its top or left
// end.
const placeLabel = (
  pieces: Coordinate[][],
  extent: Extent,
  kind: GraticuleLine['kind'],
  text: string,
): GraticuleLabel | null => {
  // Higher is better: the top for a meridian, the left for a parallel.
  const preference = (point: Coordinate): number =>
    kind === 'meridian' ? point[1] : -point[0];
  let crossing: Coordinate | null = null;
  let inside: Coordinate | null = null;
  const keepBest = (
    best: Coordinate | null,
    candidate: Coordinate,
  ): Coordinate =>
    best === null || preference(candidate) > preference(best)
      ? candidate
      : best;

  pieces.forEach((piece) => {
    piece.forEach((point, index) => {
      const isInside = contains(extent, point);
      if (isInside) {
        inside = keepBest(inside, point);
      }
      if (index === 0) {
        return;
      }
      const before = piece[index - 1];
      if (contains(extent, before) === isInside) {
        return;
      }
      // The point where the line crosses the edge of the view, closed in
      // on from its inside and its outside point.
      let [from, to] = isInside ? [point, before] : [before, point];
      for (let i = 0; i < 20; i += 1) {
        const middle = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
        if (contains(extent, middle)) {
          from = middle;
        } else {
          to = middle;
        }
      }
      crossing = keepBest(crossing, from);
    });
  });

  if (crossing) {
    return { text, coordinate: crossing, edge: nearestEdge(extent, crossing) };
  }
  return inside ? { text, coordinate: inside, edge: 'none' } : null;
};

const pointsBetween = (from: number, to: number): number[] =>
  Array.from(
    { length: PIECES_PER_LINE + 1 },
    (_, index) => from + ((to - from) * index) / PIECES_PER_LINE,
  );

// The latitude/longitude lines for a view: its extent, [minX, minY, maxX,
// maxY], in the given srs. Null when there is nothing to draw: an srs the
// viewer has no projection for, or a view that shows none of the globe.
export const buildGraticule = (
  extent: Extent,
  srs: string,
): Graticule | null => {
  const range = getVisibleLonLatRange(extent, srs);
  if (!range) {
    return null;
  }
  const { lonMin, lonMax, latMin, latMax, isFullCircle } = range;
  const lonStep = niceDegreeStep(Math.max(lonMax - lonMin, 1e-9));
  const latStep = niceDegreeStep(Math.max(latMax - latMin, 1e-9));
  // One step beyond the part in view, so that lines don't end short of the
  // edge of the view.
  const south = Math.max(-90, latMin - latStep);
  const north = Math.min(90, latMax + latStep);
  const west = isFullCircle ? -180 : lonMin - lonStep;
  const east = isFullCircle ? 180 : lonMax + lonStep;

  const lines: GraticuleLine[] = [];
  const addLine = (
    kind: GraticuleLine['kind'],
    value: number,
    lonLats: Coordinate[],
    text: string,
  ): void => {
    const pieces = projectLine(lonLats, srs);
    if (pieces.length > 0) {
      lines.push({
        kind,
        value,
        pieces,
        label: placeLabel(pieces, extent, kind, text),
      });
    }
  };

  const firstMeridian = Math.ceil(west / lonStep - 1e-9);
  // All the way around, 180 west and 180 east are the same meridian.
  const lastMeridian = isFullCircle
    ? Math.ceil(east / lonStep - 1e-9) - 1
    : Math.floor(east / lonStep + 1e-9);
  for (
    let count = firstMeridian;
    count <= lastMeridian && count - firstMeridian < MAX_LINE_COUNT;
    count += 1
  ) {
    const longitude = multipleOf(lonStep, count);
    addLine(
      'meridian',
      longitude,
      pointsBetween(south, north).map((latitude) => [longitude, latitude]),
      formatLongitude(longitude, lonStep),
    );
  }

  const firstParallel = Math.ceil(south / latStep - 1e-9);
  const lastParallel = Math.floor(north / latStep + 1e-9);
  for (
    let count = firstParallel;
    count <= lastParallel && count - firstParallel < MAX_LINE_COUNT;
    count += 1
  ) {
    const latitude = multipleOf(latStep, count);
    // The pole itself is a point, not a line.
    if (Math.abs(latitude) < 90) {
      addLine(
        'parallel',
        latitude,
        pointsBetween(west, east).map((longitude) => [longitude, latitude]),
        formatLatitude(latitude, latStep),
      );
    }
  }

  return { lonStep, latStep, lines };
};
