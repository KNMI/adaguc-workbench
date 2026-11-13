import { Bbox, toArray } from '@opengeoweb/webmap';
import { XmlJsonNode } from './xmlToJson';

export interface WCSSupportedProjection {
  srs: string;
  bbox: Bbox;
}

export interface WCSCoverage {
  name: string;
  service: string;
  title?: string;
  abstract?: string;
  supportedProjections: WCSSupportedProjection[];
  width: number;
  height: number;
  cellsizeX: number;
  cellsizeY: number;
  originX: string;
  originY: string;
  nativeCRS: string;
  nativeFormat?: string;
  formats: string[];
}

// A WCS 1.0.0 lonLatEnvelope/gml:Envelope is two <gml:pos> elements, each
// "x y" - combine them into the left/bottom/right/top shape the rest of
// this app already uses for a bbox.
const parseBboxFromPositions = (positions: XmlJsonNode[]): Bbox => {
  const [first, second] = positions;
  const [left, bottom] = (first?.value ?? '0 0').split(' ').map(Number);
  const [right, top] = (second?.value ?? '0 0').split(' ').map(Number);
  return { left, bottom, right, top };
};

// Ports webmapjsext's WCSPanel.js / WMJSCoverage.js parseDescribeCoverage,
// which this app's own copy of a DescribeCoverage request/response
// otherwise has no reason to differ from.
export const parseDescribeCoverage = (
  json: XmlJsonNode,
  service: string,
): WCSCoverage => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root = json as any;
  const coverageOffering = root.CoverageDescription?.CoverageOffering;
  const name = coverageOffering?.name?.value as string | undefined;
  if (!coverageOffering || !name) {
    throw new Error('This layer has no Web Coverage Service.');
  }

  const spatialDomain = coverageOffering.domainSet?.spatialDomain;
  const rectifiedGrid = spatialDomain?.['gml:RectifiedGrid'];
  const gridHigh = rectifiedGrid?.['gml:limits']?.['gml:GridEnvelope']?.[
    'gml:high'
  ]?.value as string | undefined;
  const [gridWidth, gridHeight] = (gridHigh ?? '0 0')
    .split(' ')
    .map((value) => parseInt(value, 10));

  const offsetVectors = toArray(rectifiedGrid?.['gml:offsetVector']);
  const [cellsizeXStr] = ((offsetVectors[0]?.value as string) ?? '0 0').split(
    ' ',
  );
  const [, cellsizeYStr] = ((offsetVectors[1]?.value as string) ?? '0 0').split(
    ' ',
  );

  const originPos = rectifiedGrid?.['gml:origin']?.['gml:pos']?.value as
    string | undefined;
  const [originX, originY] = (originPos ?? '0 0').split(' ');

  const supportedProjections: WCSSupportedProjection[] = toArray(
    spatialDomain?.['gml:Envelope'],
  ).map((envelope) => ({
    srs: envelope.attr.srsName as string,
    bbox: parseBboxFromPositions(toArray(envelope['gml:pos']) as XmlJsonNode[]),
  }));

  const nativeCRS =
    (coverageOffering.supportedCRSs?.nativeCRSs?.value as string | undefined) ??
    'EPSG:4326';
  const nativeFormat = coverageOffering.supportedFormats?.attr?.nativeFormat as
    string | undefined;
  const formats = toArray(coverageOffering.supportedFormats?.formats).map(
    (format) => format.value as string,
  );

  return {
    name,
    service,
    title: coverageOffering.label?.value as string | undefined,
    abstract: coverageOffering.description?.value as string | undefined,
    supportedProjections,
    width: gridWidth + 1,
    height: gridHeight + 1,
    cellsizeX: parseFloat(cellsizeXStr),
    cellsizeY: parseFloat(cellsizeYStr),
    originX,
    originY,
    nativeCRS,
    nativeFormat,
    formats,
  };
};
