import * as React from 'react';
import {
  Box,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { LayerTree, generateLayerId } from '@opengeoweb/webmap';
import {
  useQueryGetWMSLayers,
  useQueryGetWMSLayersTree,
} from '@opengeoweb/webmap-react';

interface WMSLayerSelectorProps {
  layerName: string;
  serviceUrl: string;
  onSelectLayer: (layerName: string) => void;
}

interface MakeTreeProps {
  tree: LayerTree;
}
const MakeTree = ({
  tree,
}: MakeTreeProps): React.ReactElement<MakeTreeProps> => {
  if (!tree) return null;
  const { children, name: layerName, title } = tree;
  if (children && children.length > 0) {
    return (
      <TreeItem
        itemId={tree.name || tree.title || generateLayerId()}
        label={tree.title}
        aria-expanded
      >
        {children.map((child) => {
          return (
            <MakeTree
              key={child.name || child.title || generateLayerId()}
              tree={child}
            />
          );
        })}
      </TreeItem>
    );
  }
  return (
    <TreeItem
      itemId={layerName || title || generateLayerId()}
      key={layerName}
      label={`${title}`}
    />
  );
};

const WMSLayerSelector = ({
  layerName,
  serviceUrl,
  onSelectLayer,
}: WMSLayerSelectorProps): React.ReactElement<WMSLayerSelectorProps> => {
  const tree = useQueryGetWMSLayersTree(serviceUrl);
  const layers = useQueryGetWMSLayers(serviceUrl);
  const [expandedItems, setExpandedItems] = React.useState<string[]>([]);
  const [menuOpen, setMenuOpen] = React.useState<boolean>(false);

  const handleSelectedItemsChange = (e, ids) => {
    const selected = ids as unknown as string;
    const selectedLayer = layers.find((lins) => lins.name === selected);
    if (selectedLayer && selectedLayer.name) {
      setMenuOpen(false);
      onSelectLayer(selectedLayer.name);
    }
  };

  const handleExpandedItemsChange = (
    event: React.SyntheticEvent,
    itemIds: string[],
  ) => {
    setExpandedItems(itemIds);
  };

  React.useEffect((): void => {
    if (tree?.title) {
      setExpandedItems([tree.title]);
    }
  }, [tree?.title]);

  if (!serviceUrl) {
    return null;
  }

  const selectedLayer = layers.find((lins) => lins.name === layerName);
  const currentIndex = layers.findIndex((lins) => lins.name === layerName);
  const canCycle = layers.length > 1;

  // Cycles through the flat layer list (not the tree structure shown when
  // the dropdown is open), wrapping around at either end.
  const goToLayerAtOffset = (offset: number): void => {
    if (!canCycle) {
      return;
    }
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (baseIndex + offset + layers.length) % layers.length;
    const nextLayer = layers[nextIndex];
    if (nextLayer?.name) {
      onSelectLayer(nextLayer.name);
    }
  };

  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
      }}
    >
      <FormControl size="small" sx={{ flexGrow: 1, minWidth: 0 }}>
        <InputLabel size="small">Layer</InputLabel>
        <Select
          size="small"
          value={layerName}
          label="Layer"
          onChange={() => {}}
          open={menuOpen}
          onOpen={() => {
            setMenuOpen(true);
          }}
          onClose={() => {
            setMenuOpen(false);
          }}
          renderValue={() =>
            currentIndex !== -1
              ? `(${currentIndex + 1}/${layers.length}) ${selectedLayer?.title ?? layerName}`
              : (selectedLayer?.title ?? layerName)
          }
        >
          <MenuItem
            style={{ display: 'none' }}
            key={layerName}
            value={layerName}
          >
            {selectedLayer?.title}
          </MenuItem>
          <SimpleTreeView
            selectedItems={[layerName]}
            expandedItems={expandedItems}
            onSelectedItemsChange={handleSelectedItemsChange}
            onExpandedItemsChange={handleExpandedItemsChange}
          >
            <MakeTree tree={tree} />
          </SimpleTreeView>
        </Select>
      </FormControl>
      <Tooltip title="Previous layer">
        <span>
          <IconButton
            size="small"
            aria-label="Previous layer"
            disabled={!canCycle}
            onClick={() => {
              goToLayerAtOffset(-1);
            }}
          >
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Next layer">
        <span>
          <IconButton
            size="small"
            aria-label="Next layer"
            disabled={!canCycle}
            onClick={() => {
              goToLayerAtOffset(1);
            }}
          >
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
};

export default WMSLayerSelector;
