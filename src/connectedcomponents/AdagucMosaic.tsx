import * as React from 'react';
import { Mosaic, MosaicNode } from 'react-mosaic-component';

export interface AdagucMosaicProps {
  mosaicItems: { [viewId: string]: React.ReactElement };
  // Whether the layer panel (left) and the tool panel (right) are open, or
  // collapsed into a narrow strip with just their own expand button.
  layerPanelIsExpanded: boolean;
  toolsPanelIsExpanded: boolean;
}

// Wide enough that the footer icon row (now 8 icons, including the two
// move-up/move-down buttons) still leaves the opacity slider between
// them some real room, instead of squeezing it down to a sliver.
const LAYER_PANEL_WIDTH = 494; // 380 * 1.3
const RIGHT_PANEL_WIDTH = 500;
// Either side panel, collapsed: just wide enough for its expand button.
const COLLAPSED_PANEL_WIDTH = 30;

export const AdagucMosaic = ({
  mosaicItems,
  layerPanelIsExpanded,
  toolsPanelIsExpanded,
}: AdagucMosaicProps): React.ReactElement<AdagucMosaicProps> => {
  // Mosaic (used uncontrolled here) resets its whole layout - including
  // any panel the user resized by dragging - whenever initialValue is a
  // new object, so it's only rebuilt when a side panel is collapsed or
  // expanded. Only initialValue is memoized, not the Mosaic itself: that
  // used to also freeze renderTile, so the tiles kept showing whatever
  // mosaicItems were current at the last collapse/expand.
  const initialValue = React.useMemo((): MosaicNode<string> => {
    const screenWidth = Math.max(
      document.documentElement.clientWidth || 0,
      window.innerWidth || 0,
    );
    const leftWidth = layerPanelIsExpanded
      ? LAYER_PANEL_WIDTH
      : COLLAPSED_PANEL_WIDTH;
    const rightWidth = toolsPanelIsExpanded
      ? RIGHT_PANEL_WIDTH
      : COLLAPSED_PANEL_WIDTH;
    // The outer split is between the layer panel and the rest; the inner
    // one, within that rest, between the map and the tool panel.
    const leftPanelWidthPercentage = (leftWidth / screenWidth) * 100;
    const mapWidthPercentage =
      100 - (rightWidth / (screenWidth - leftWidth)) * 100;
    // Used to nest this under an extra, always-empty 'a' pane (0% height)
    // in a column split - react-mosaic-component still renders that
    // split's resize handle even at 0%, showing up as a thin gray bar
    // between the top bar and the map. With nothing ever shown there,
    // this is the mosaic's root directly instead.
    return {
      type: 'split',
      direction: 'row',
      splitPercentages: [
        leftPanelWidthPercentage,
        100 - leftPanelWidthPercentage,
      ],
      children: [
        'b',
        {
          type: 'split',
          direction: 'row',
          splitPercentages: [mapWidthPercentage, 100 - mapWidthPercentage],
          children: ['c', 'd'],
        },
      ],
    };
  }, [layerPanelIsExpanded, toolsPanelIsExpanded]);

  return (
    <Mosaic<string>
      renderTile={(id) => mosaicItems[id]}
      initialValue={initialValue}
    />
  );
};
