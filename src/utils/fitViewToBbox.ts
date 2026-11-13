import { View } from 'ol';

interface BboxLike {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

// Zooms `view` to show `bbox` - the same as opengeoweb's own
// setViewFromExtent, without its bug: that one treats a bbox whose left
// edge is exactly 0 as no bbox at all (it checks `!Number(bbox.left)`), and
// falls back to zoom level 1 - e.g. the "Netherlands - RD NEW" predefined
// area (EPSG:28992, left: 0) showed the whole world instead.
export const fitViewToBbox = (
  view: View,
  bbox: BboxLike | null | undefined,
): void => {
  if (
    !bbox ||
    ![bbox.left, bbox.bottom, bbox.right, bbox.top].every(Number.isFinite)
  ) {
    view.setCenter([0, 0]);
    view.setZoom(1);
    return;
  }
  if (bbox.left === bbox.right || bbox.bottom === bbox.top) {
    view.setCenter([bbox.left, bbox.top]);
    view.setZoom(1);
    return;
  }
  view.fit([bbox.left, bbox.bottom, bbox.right, bbox.top]);
};
