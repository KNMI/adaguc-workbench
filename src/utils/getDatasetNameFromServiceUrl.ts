// ADAGUC services identify which dataset they serve via a `DATASET=<name>`
// query parameter (case-insensitive, like all WMS query keys) - pulling it
// out lets the layer panel show which dataset a layer actually comes from,
// which the service url itself doesn't make obvious at a glance.
export const getDatasetNameFromServiceUrl = (
  serviceUrl: string,
): string | undefined => {
  if (!serviceUrl) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(serviceUrl);
  } catch {
    return undefined;
  }
  const datasetEntry = Array.from(url.searchParams.entries()).find(
    ([key, value]) => key.toLowerCase() === 'dataset' && value,
  );
  return datasetEntry?.[1];
};
