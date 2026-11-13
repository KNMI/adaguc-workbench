import * as React from 'react';
import { Mosaic, MosaicNode } from 'react-mosaic-component';

export interface AdagucMosaicProps {
  mosaicItems: { [viewId: string]: React.ReactElement };
  collapseAutoWMS: boolean;
}

// Wide enough that the footer icon row (now 8 icons, including the two
// move-up/move-down buttons) still leaves the opacity slider between
// them some real room, instead of squeezing it down to a sliver.
const LAYER_PANEL_WIDTH = 494; // 380 * 1.3
const RIGHT_PANEL_WIDTH = 500;
const RIGHT_PANEL_COLLAPSED_WIDTH = 30;

export const AdagucMosaic = ({
  mosaicItems,
  collapseAutoWMS,
}: AdagucMosaicProps): React.ReactElement<AdagucMosaicProps> => {
  // Mosaic (used uncontrolled here) resets its whole layout - including
  // any panel the user resized by dragging - whenever initialValue is a
  // new object, so it's only rebuilt when the tool panel is collapsed or
  // expanded. Only initialValue is memoized, not the Mosaic itself: that
  // used to also freeze renderTile, so the tiles kept showing whatever
  // mosaicItems were current at the last collapse/expand.
  const initialValue = React.useMemo((): MosaicNode<string> => {
    const screenWidth = Math.max(
      document.documentElement.clientWidth || 0,
      window.innerWidth || 0,
    );
    const leftPanelWidthPercentage = (LAYER_PANEL_WIDTH / screenWidth) * 100;
    const autoWMSPanelWidthPercentage =
      100 - (RIGHT_PANEL_WIDTH / (screenWidth - LAYER_PANEL_WIDTH)) * 100;
    const autoWMSPanelWidthPercentageCollapsed =
      100 -
      (RIGHT_PANEL_COLLAPSED_WIDTH / (screenWidth - LAYER_PANEL_WIDTH)) * 100;
    const autoWMSSplitPercentage = collapseAutoWMS
      ? autoWMSPanelWidthPercentage
      : autoWMSPanelWidthPercentageCollapsed;
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
          splitPercentages: [
            autoWMSSplitPercentage,
            100 - autoWMSSplitPercentage,
          ],
          children: ['c', 'd'],
        },
      ],
    };
  }, [collapseAutoWMS]);

  return (
    <Mosaic<string>
      renderTile={(id) => mosaicItems[id]}
      initialValue={initialValue}
    />
  );
};
