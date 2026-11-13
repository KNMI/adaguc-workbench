import type { Mock } from 'vitest';
import * as React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import type { WMLayer } from '@opengeoweb/webmap';
import { emptyMap, renderWithStore } from '../../testUtils/renderWithStore';
import WCSPanel from './WCSPanel';

const DESCRIBE_COVERAGE_XML = `<?xml version='1.0' encoding="ISO-8859-1" ?>
<CoverageDescription
   version="1.0.0"
   xmlns="http://www.opengis.net/wcs"
   xmlns:gml="http://www.opengis.net/gml">
  <CoverageOffering>
  <description>Air pressure data</description>
  <name>air_pressure_msl</name>
  <label>Air pressure at mean sea level</label>
  <domainSet>
    <spatialDomain>
        <gml:Envelope srsName="EPSG:4326">
          <gml:pos>-180 -90</gml:pos>
          <gml:pos>180 90</gml:pos>
        </gml:Envelope>
        <gml:RectifiedGrid dimension="2">
          <gml:limits>
            <gml:GridEnvelope>
              <gml:low>0 0</gml:low>
              <gml:high>359 179</gml:high>
            </gml:GridEnvelope>
          </gml:limits>
          <gml:origin>
            <gml:pos>-180 90</gml:pos>
          </gml:origin>
          <gml:offsetVector>1.0 0</gml:offsetVector>
          <gml:offsetVector>0 -1.0</gml:offsetVector>
        </gml:RectifiedGrid>
      </spatialDomain>
    </domainSet>
    <supportedCRSs>
      <requestResponseCRSs>EPSG:4326</requestResponseCRSs>
      <nativeCRSs>EPSG:4326</nativeCRSs>
    </supportedCRSs>
    <supportedFormats nativeFormat="NetCDF4">
      <formats>GeoTIFF</formats>
      <formats>AAIGRID</formats>
    </supportedFormats>
</CoverageOffering>
</CoverageDescription>
`;

const WCS_CAPABILITIES_XML = `<?xml version='1.0' encoding="ISO-8859-1" ?>
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
</WCS_Capabilities>
`;

const AIR_TEMPERATURE_DESCRIBE_COVERAGE_XML = DESCRIBE_COVERAGE_XML.replace(
  '<name>air_pressure_msl</name>',
  '<name>air_temperature</name>',
).replace(
  '<label>Air pressure at mean sea level</label>',
  '<label>Air temperature</label>',
);

const makeFetchMock = (): Mock =>
  vi.fn((url: string) => {
    if (url.includes('REQUEST=GetCapabilities')) {
      return Promise.resolve({
        text: () => Promise.resolve(WCS_CAPABILITIES_XML),
      });
    }
    if (url.includes('COVERAGE=air_temperature')) {
      return Promise.resolve({
        text: () => Promise.resolve(AIR_TEMPERATURE_DESCRIBE_COVERAGE_XML),
      });
    }
    return Promise.resolve({
      text: () => Promise.resolve(DESCRIBE_COVERAGE_XML),
    });
  });

const makeWMLayer = (overrides: Partial<WMLayer> = {}): WMLayer =>
  ({
    id: 'layer-1',
    name: 'air_pressure_msl',
    title: 'Air pressure at mean sea level',
    service: 'https://geoservices.knmi.nl/adagucserver?dataset=test&',
    dimensions: [{ name: 'time', currentValue: '2024-01-01T00:00:00Z' }],
    ...overrides,
  }) as WMLayer;

const mapId = 'map1';

// The panel reads only the map's current view from the store (offered as
// an extra projection option) - its layer comes in as a prop.
const renderPanel = (wmLayer: WMLayer): ReturnType<typeof renderWithStore> =>
  renderWithStore(<WCSPanel mapId={mapId} wmLayer={wmLayer} />, {
    [mapId]: emptyMap({
      view: {
        srs: 'EPSG:3857',
        bbox: { left: -1, bottom: -1, right: 1, top: 1 },
      },
    }),
  });

describe('WCSPanel', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(DESCRIBE_COVERAGE_XML),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).fetch;
  });

  it('fetches DescribeCoverage for this layer and shows its title/abstract', async () => {
    renderPanel(makeWMLayer());

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://geoservices.knmi.nl/adagucserver?dataset=test&SERVICE=WCS&REQUEST=DescribeCoverage&COVERAGE=air_pressure_msl',
      ),
    );

    expect(
      await screen.findByText('Air pressure at mean sea level'),
    ).toBeInTheDocument();
    expect(screen.getByText('Air pressure data')).toBeInTheDocument();
  });

  it('shows a GetCoverage request url using the native projection, falling back to AAIGRID when NetCDF is not offered', async () => {
    renderPanel(makeWMLayer());

    const link = await screen.findByRole('link');
    expect(link.getAttribute('href')).toContain('CRS=EPSG%3A4326');
    expect(link.getAttribute('href')).toContain('FORMAT=AAIGRID');
    expect(link.getAttribute('href')).toContain('COVERAGE=air_pressure_msl');
  });

  it('defaults to NetCDF when the service offers it, even alongside AAIGRID', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: () =>
        Promise.resolve(
          DESCRIBE_COVERAGE_XML.replace(
            '<formats>GeoTIFF</formats>\n      <formats>AAIGRID</formats>',
            '<formats>GeoTIFF</formats>\n      <formats>AAIGRID</formats>\n      <formats>NetCDF4</formats>',
          ),
        ),
    });

    renderPanel(makeWMLayer());

    const link = await screen.findByRole('link');
    expect(link.getAttribute('href')).toContain('FORMAT=NetCDF4');
  });

  it("includes this layer's current dimension values in the GetCoverage url", async () => {
    renderPanel(makeWMLayer());

    const link = await screen.findByRole('link');
    expect(link.getAttribute('href')).toContain('TIME=2024-01-01T00:00:00Z');
  });

  it('offers the current map view as an extra projection option', async () => {
    renderPanel(makeWMLayer());
    await screen.findByRole('link');

    // The CRS select is the first of the two Selects on the page (the
    // other being Format) - MUI's Select doesn't expose a query-friendly
    // accessible name of its own here, so it's targeted positionally.
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);

    const listbox = within(screen.getByRole('listbox'));
    expect(
      listbox.getByText('EPSG:3857 (current map view)'),
    ).toBeInTheDocument();
  });

  it('shows an error message when the layer has no coverage', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: () =>
        Promise.resolve(
          '<CoverageDescription><ServiceExceptionReport/></CoverageDescription>',
        ),
    });

    renderPanel(makeWMLayer());

    expect(
      await screen.findByText('This layer has no Web Coverage Service.'),
    ).toBeInTheDocument();
  });

  it('lists the coverages offered by the service and switches to the one picked', async () => {
    globalThis.fetch = makeFetchMock();

    renderPanel(makeWMLayer());

    await screen.findByRole('link');

    // The Coverage select is the first of the three Selects on the page
    // (the others being CRS and Format) once coverages have loaded - MUI's
    // Select doesn't expose a query-friendly accessible name here, so it's
    // targeted positionally, same as the CRS select in the test above.
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    const listbox = within(screen.getByRole('listbox'));
    expect(
      listbox.getByText('Air pressure at mean sea level'),
    ).toBeInTheDocument();
    fireEvent.click(listbox.getByText('Air temperature'));

    await screen.findByRole('link');
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toContain('COVERAGE=air_temperature');
  });
});
