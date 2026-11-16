import * as React from 'react';
import { Box } from '@mui/material';
import { keyframes } from '@emotion/react';
import { awbColors } from '../../application/appTheme';

// The wedge is drawn as a circle of half the pie's radius with a stroke as
// wide as that radius: its dash then covers exactly the pie slice, from the
// top, for the share of the circumference it's given.
const PIE_RADIUS = 13;
const WEDGE_RADIUS = PIE_RADIUS / 2;
const WEDGE_CIRCUMFERENCE = 2 * Math.PI * WEDGE_RADIUS;

// From nothing to the full circle, clockwise from the top.
const fill = keyframes`
  from { stroke-dashoffset: ${WEDGE_CIRCUMFERENCE}; }
  to { stroke-dashoffset: 0; }
`;

// A clock-like pie that fills up over `durationMs`, counting from
// `startedAt` (a Date.now() timestamp) - drawn behind an icon button's
// icon: a circle outline in the button's colour, and a wedge in the light
// accent colour. Runs as a CSS animation, so it costs no re-renders; give
// it a new key for each new countdown.
export const CountdownRing = ({
  startedAt,
  durationMs,
}: {
  startedAt: number;
  durationMs: number;
}): React.ReactElement => {
  const wedge = React.useRef<SVGCircleElement>(null);
  // Mounted part-way through a countdown (e.g. when the card itself is
  // re-created), it starts that far along instead of from empty.
  React.useLayoutEffect(() => {
    if (wedge.current) {
      wedge.current.style.animationDelay = `-${Math.max(0, Date.now() - startedAt)}ms`;
    }
  }, [startedAt]);

  return (
    <Box
      component="svg"
      viewBox="0 0 32 32"
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        transform: 'rotate(-90deg)',
        pointerEvents: 'none',
      }}
    >
      <Box
        component="circle"
        ref={wedge}
        data-testid="countdown-ring"
        cx={16}
        cy={16}
        r={WEDGE_RADIUS}
        fill="none"
        strokeWidth={PIE_RADIUS}
        strokeDasharray={WEDGE_CIRCUMFERENCE}
        sx={{
          stroke: awbColors.accentLight,
          strokeOpacity: 0.6,
          animation: `${fill} ${durationMs}ms linear forwards`,
        }}
      />
      <circle
        cx={16}
        cy={16}
        r={PIE_RADIUS + 1}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      />
    </Box>
  );
};
