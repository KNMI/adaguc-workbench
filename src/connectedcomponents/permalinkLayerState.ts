import {
  AdagucAnimation,
  AdagucBaseLayer,
  AdagucLayer,
  AdagucMap,
} from '../store/types';

// Permalink parameters on top of the original `layer`/`dims` ones, for
// state those can't hold. They're separate parameters on purpose: an older
// version of the app ignores parameters it doesn't know, whereas adding
// fields to `layer` entries would make it drop those layers entirely
// (it only accepts entries with exactly six fields).
//
// layerdims=<layer>$<dimension>$<value>$<linked>,...
//   Every layer's own value for each of its dimensions, and whether that
//   dimension is linked (the checkbox in front of its slider: 1 or 0).
//   <layer> is the layer's position in the `layer` parameter.
// baselayers=<id>,<id>,...
//   The base maps and overlays (the Baselayers tab) that are switched on,
//   by their fixed ids (see utils/baseLayerPresets.ts). Present but empty
//   means all of them are off.
// animate=<layer>$<scope>
//   A running animation: the layer whose time values it steps through, and
//   'group' (that layer's own Play, taking along its linked layers) or
//   'all' (the TIME panel's Play, animating every layer).

export interface PermalinkLayerDimension {
  layerIndex: number;
  name: string;
  value: string;
  linked: boolean;
}

export interface PermalinkAnimation {
  layerIndex: number;
  scope: AdagucAnimation['scope'];
}

// Escapes just the characters that separate fields ($) and entries (,),
// and % itself - so a value containing either can't break the parsing.
const escapeField = (value: string): string =>
  value.replace(/%/g, '%25').replace(/\$/g, '%24').replace(/,/g, '%2C');

const unescapeField = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseIndex = (value: string | undefined): number | undefined => {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }
  return Number(value);
};

export const formatLayerDimensions = (layers: AdagucLayer[]): string =>
  layers
    .flatMap((layer, layerIndex) =>
      layer.dimensions.map((dimension) =>
        [
          String(layerIndex),
          escapeField(dimension.name),
          escapeField(dimension.currentValue),
          dimension.linked ? '1' : '0',
        ].join('$'),
      ),
    )
    .join(',');

// Skips any entry it can't make sense of, rather than giving up on all.
export const parseLayerDimensions = (
  param: string | null,
): PermalinkLayerDimension[] =>
  (param ?? '').split(',').flatMap((entry) => {
    const fields = entry.split('$');
    const layerIndex = parseIndex(fields[0]);
    if (fields.length !== 4 || layerIndex === undefined || !fields[1]) {
      return [];
    }
    return [
      {
        layerIndex,
        name: unescapeField(fields[1]),
        value: unescapeField(fields[2]),
        linked: fields[3] === '1',
      },
    ];
  });

export const formatAnimation = (map: AdagucMap): string | undefined => {
  const { animation } = map;
  if (!map.isAnimating || !animation) {
    return undefined;
  }
  const layerIndex = map.layers.findIndex(
    (layer) => layer.id === animation.layerId,
  );
  return layerIndex === -1 ? undefined : `${layerIndex}$${animation.scope}`;
};

export const parseAnimation = (
  param: string | null,
): PermalinkAnimation | undefined => {
  const [index, scope] = (param ?? '').split('$');
  const layerIndex = parseIndex(index);
  if (layerIndex === undefined) {
    return undefined;
  }
  return { layerIndex, scope: scope === 'all' ? 'all' : 'group' };
};

export const formatBaseLayers = (baseLayers: AdagucBaseLayer[]): string =>
  baseLayers
    .filter((baseLayer) => baseLayer.enabled)
    .map((baseLayer) => baseLayer.id)
    .join(',');

// The ids of the base maps/overlays to switch on - or undefined to leave
// the defaults alone: when the parameter is missing (an older permalink),
// or names only ids this version doesn't know (rather than switching
// everything off over, say, a renamed preset).
export const parseBaseLayers = (
  param: string | null,
  knownIds: string[],
): string[] | undefined => {
  if (param === null) {
    return undefined;
  }
  const ids = param.split(',').filter(Boolean);
  const known = ids.filter((id) => knownIds.includes(id));
  if (ids.length > 0 && known.length === 0) {
    return undefined;
  }
  return known;
};
