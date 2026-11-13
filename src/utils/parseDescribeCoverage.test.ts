import { xmlToJson } from './xmlToJson';
import { parseDescribeCoverage } from './parseDescribeCoverage';

vi.mock('@opengeoweb/webmap', () => ({
  toArray: (value: unknown): unknown[] => {
    if (value === null || value === undefined) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  },
}));

// A representative WCS 1.0.0 DescribeCoverage response (trimmed to the
// projections/formats that matter for the assertions below; structurally
// identical to what adaguc-server actually returns).
const DESCRIBE_COVERAGE_XML = `<?xml version='1.0' encoding="ISO-8859-1" ?>
<CoverageDescription
   version="1.0.0"
   xmlns="http://www.opengis.net/wcs"
   xmlns:gml="http://www.opengis.net/gml">
  <CoverageOffering>
  <description>data</description>
  <name>data</name>
  <label>data (data)</label>
  <lonLatEnvelope srsName="urn:ogc:def:crs:OGC:1.3:CRS84">
    <gml:pos>-180.494446 -90.488892</gml:pos>
    <gml:pos>179.505554 89.511108</gml:pos>
  </lonLatEnvelope>
  <domainSet>
    <spatialDomain>
        <gml:Envelope srsName="CRS:84">
          <gml:pos>-180.494446 -90.488892</gml:pos>
          <gml:pos>179.505554 89.511108</gml:pos>
        </gml:Envelope>
        <gml:Envelope srsName="EPSG:4326">
          <gml:pos>-180.494446 -90.488892</gml:pos>
          <gml:pos>179.505554 89.511108</gml:pos>
        </gml:Envelope>
        <gml:RectifiedGrid dimension="2">
          <gml:limits>
            <gml:GridEnvelope>
              <gml:low>0 0</gml:low>
              <gml:high>359 179</gml:high>
            </gml:GridEnvelope>
          </gml:limits>
          <gml:origin>
            <gml:pos>-180.494446 89.511108</gml:pos>
          </gml:origin>
          <gml:offsetVector>1.000000 0</gml:offsetVector>
          <gml:offsetVector>0 -1.000000</gml:offsetVector>
        </gml:RectifiedGrid>
      </spatialDomain>
    </domainSet>
    <supportedCRSs>
      <requestResponseCRSs>CRS:84</requestResponseCRSs>
      <requestResponseCRSs>EPSG:4326</requestResponseCRSs>
      <nativeCRSs>EPSG:4326</nativeCRSs>
    </supportedCRSs>
    <supportedFormats nativeFormat="NetCDF4">
      <formats>GeoTIFF</formats>
      <formats>AAIGRID</formats>
      <formats>NetCDF4</formats>
    </supportedFormats>
</CoverageOffering>
</CoverageDescription>
`;

const parse = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return xmlToJson(doc);
};

describe('parseDescribeCoverage', () => {
  it('parses title, abstract, grid size and native projection/format', () => {
    const coverage = parseDescribeCoverage(
      parse(DESCRIBE_COVERAGE_XML),
      'https://example.com/wcs?',
    );

    expect(coverage.name).toBe('data');
    expect(coverage.title).toBe('data (data)');
    expect(coverage.abstract).toBe('data');
    expect(coverage.service).toBe('https://example.com/wcs?');
    // gml:high is "359 179", grid size is that +1 in each direction.
    expect(coverage.width).toBe(360);
    expect(coverage.height).toBe(180);
    expect(coverage.cellsizeX).toBe(1);
    expect(coverage.cellsizeY).toBe(-1);
    expect(coverage.originX).toBe('-180.494446');
    expect(coverage.originY).toBe('89.511108');
    expect(coverage.nativeCRS).toBe('EPSG:4326');
    expect(coverage.nativeFormat).toBe('NetCDF4');
    expect(coverage.formats).toEqual(['GeoTIFF', 'AAIGRID', 'NetCDF4']);
  });

  it('parses every supported projection with its bounding box', () => {
    const coverage = parseDescribeCoverage(
      parse(DESCRIBE_COVERAGE_XML),
      'https://example.com/wcs?',
    );

    expect(coverage.supportedProjections).toEqual([
      {
        srs: 'CRS:84',
        bbox: {
          left: -180.494446,
          bottom: -90.488892,
          right: 179.505554,
          top: 89.511108,
        },
      },
      {
        srs: 'EPSG:4326',
        bbox: {
          left: -180.494446,
          bottom: -90.488892,
          right: 179.505554,
          top: 89.511108,
        },
      },
    ]);
  });

  it('throws when the response has no matching coverage (name missing)', () => {
    const emptyDoc = new DOMParser().parseFromString(
      '<CoverageDescription><ServiceExceptionReport/></CoverageDescription>',
      'text/xml',
    );

    expect(() =>
      parseDescribeCoverage(xmlToJson(emptyDoc), 'https://example.com/wcs?'),
    ).toThrow('This layer has no Web Coverage Service.');
  });
});
