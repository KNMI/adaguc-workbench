import { toArray } from '@opengeoweb/webmap';
import { XmlJsonNode } from './xmlToJson';

export interface WCSCoverageSummary {
  name: string;
  label?: string;
  description?: string;
}

// Parses a WCS 1.0.0 GetCapabilities response down to the list of
// coverages it offers (WCS_Capabilities.ContentMetadata.CoverageOfferingBrief),
// so the panel can offer a "switch coverage" dropdown instead of being
// stuck on whichever one the layer itself happened to be added as.
export const parseWCSCapabilities = (
  json: XmlJsonNode,
): WCSCoverageSummary[] => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root = json as any;
  const briefs = toArray(
    root.WCS_Capabilities?.ContentMetadata?.CoverageOfferingBrief,
  );
  return briefs
    .filter((brief) => !!brief.name?.value)
    .map((brief) => ({
      name: brief.name.value as string,
      label: brief.label?.value as string | undefined,
      description: brief.description?.value as string | undefined,
    }));
};
