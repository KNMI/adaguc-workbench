// The deployment's own default AutoWMS/WMS entry point (static/config.json's
// `autowmsurl`, e.g. KNMI's own https://geoservices.knmi.nl/autowms) -
// pinned as an always-available option in the "add service" inputs'
// suggestion list, not just loaded once on first visit.
export const fetchDefaultAutoWMSService = async (): Promise<
  string | undefined
> => {
  try {
    const response = await fetch('./config.json');
    const config = (await response.json()) as { autowmsurl?: string };
    return config?.autowmsurl || undefined;
  } catch {
    return undefined;
  }
};
