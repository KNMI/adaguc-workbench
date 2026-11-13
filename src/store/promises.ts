import { getWMSServiceId, queryWMSLayers } from '@opengeoweb/webmap';
import { AdagucService } from './types';

export const fetchWMSServiceAsynced = async (
  wmsServiceURL: string,
): Promise<AdagucService> => {
  const availableLayersFromService = await queryWMSLayers(wmsServiceURL);
  return {
    layers: availableLayersFromService.map((layer) => {
      return {
        ...layer,
        serviceUrl: wmsServiceURL,
      };
    }),
    id: getWMSServiceId(wmsServiceURL),
    serviceUrl: wmsServiceURL,
  };
};
