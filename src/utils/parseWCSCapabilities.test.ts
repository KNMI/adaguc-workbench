import { xmlToJson } from './xmlToJson';
import { parseWCSCapabilities } from './parseWCSCapabilities';

vi.mock('@opengeoweb/webmap', () => ({
  toArray: (value: unknown): unknown[] => {
    if (value === null || value === undefined) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  },
}));

const parseXml = (xml: string): Document =>
  new DOMParser().parseFromString(xml, 'text/xml');

describe('parseWCSCapabilities', () => {
  it('parses a single coverage offering brief', () => {
    const xml = `<?xml version='1.0' encoding="ISO-8859-1" ?>
<WCS_Capabilities version="1.0.0" xmlns="http://www.opengis.net/wcs">
<ContentMetadata><CoverageOfferingBrief>
<description>testdata</description>
<name>testdata</name>
<label>Testdata (testdata)</label>
</CoverageOfferingBrief>
</ContentMetadata>
</WCS_Capabilities>`;

    expect(parseWCSCapabilities(xmlToJson(parseXml(xml)))).toEqual([
      {
        name: 'testdata',
        label: 'Testdata (testdata)',
        description: 'testdata',
      },
    ]);
  });

  it('parses multiple coverage offering briefs', () => {
    const xml = `<?xml version='1.0' encoding="ISO-8859-1" ?>
<WCS_Capabilities version="1.0.0" xmlns="http://www.opengis.net/wcs">
<ContentMetadata>
<CoverageOfferingBrief>
<name>air_pressure_msl</name>
<label>Air pressure at mean sea level</label>
</CoverageOfferingBrief>
<CoverageOfferingBrief>
<name>air_temperature</name>
<label>Air temperature</label>
</CoverageOfferingBrief>
</ContentMetadata>
</WCS_Capabilities>`;

    expect(parseWCSCapabilities(xmlToJson(parseXml(xml)))).toEqual([
      {
        name: 'air_pressure_msl',
        label: 'Air pressure at mean sea level',
        description: undefined,
      },
      {
        name: 'air_temperature',
        label: 'Air temperature',
        description: undefined,
      },
    ]);
  });

  it('returns an empty list when there is no ContentMetadata', () => {
    const xml = `<?xml version='1.0' encoding="ISO-8859-1" ?>
<WCS_Capabilities version="1.0.0" xmlns="http://www.opengis.net/wcs">
<ServiceExceptionReport/>
</WCS_Capabilities>`;

    expect(parseWCSCapabilities(xmlToJson(parseXml(xml)))).toEqual([]);
  });
});
