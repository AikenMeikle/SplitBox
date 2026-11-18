import React from 'react';

export interface SliceMeterProps {
  /** Total slices per wholesale box (e.g., 4, 6, 8, 10, 12) */
  totalSlices: number;
  /** Number of slices claimed in the current open box (0..totalSlices) */
  claimedInOpenBox: number;
  /** Slices in the current open box owned by the current student (or in basket) */
  userSlicesInOpenBox?: number;
  /** Pixel dimensions of the SVG (default 68) */
  size?: number;
}

const CX = 44;
const CY = 44;
const R = 32;

function wedgePath(index: number, total: number): string {
  // Wedge 0 is ALWAYS the iconic top-right sector [-pi/2, -pi/2 + 2*pi/total]
  // Subsequent wedges proceed counter-clockwise around the crate so funded wedges
  // fill smoothly while preserving the top-right popped slice motif.
  const step = (2 * Math.PI) / total;
  let startAngle: number;
  let endAngle: number;

  if (index === 0) {
    startAngle = -Math.PI / 2;
    endAngle = -Math.PI / 2 + step;
  } else {
    // Counter-clockwise sectors starting from -pi/2 going backwards
    endAngle = -Math.PI / 2 - (index - 1) * step;
    startAngle = -Math.PI / 2 - index * step;
  }

  const x1 = CX + R * Math.cos(startAngle);
  const y1 = CY + R * Math.sin(startAngle);
  const x2 = CX + R * Math.cos(endAngle);
  const y2 = CY + R * Math.sin(endAngle);
  const largeArc = step > Math.PI ? 1 : 0;

  return `M ${CX} ${CY} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

export const SliceMeter: React.FC<SliceMeterProps> = ({
  totalSlices,
  claimedInOpenBox,
  userSlicesInOpenBox = 0,
  size = 68,
}) => {
  const safeTotal = Math.max(2, totalSlices);
  const safeClaimed = Math.min(safeTotal, Math.max(0, claimedInOpenBox));
  const hasUserPop = userSlicesInOpenBox > 0;
  const remaining = safeTotal - safeClaimed;
  const isClosingSoon = remaining > 0 && remaining <= 2;

  // Assign statuses to wedges:
  // If the student owns/is claiming at least 1 slice in this box, Wedge 0 (top-right) pops in Tangerine!
  const strangerCount = Math.max(0, safeClaimed - (hasUserPop ? 1 : 0));
  const extraUserCount = Math.max(0, userSlicesInOpenBox - 1);

  const regularWedges: React.ReactNode[] = [];
  for (let i = 1; i < safeTotal; i++) {
    const slotOrder = i - 1; // 0 .. safeTotal - 2
    let fill = '#EDF7F2';
    let stroke = '#FFFFFF';
    let strokeDasharray: string | undefined;

    if (slotOrder < strangerCount) {
      fill = '#10D48E'; // Funded by campus strangers
    } else if (slotOrder < strangerCount + extraUserCount) {
      fill = '#FF6B1A'; // Additional slices claimed by current student
    } else if (isClosingSoon) {
      stroke = '#FF6B1A';
      strokeDasharray = '3 2';
    }

    regularWedges.push(
      <path
        key={i}
        d={wedgePath(i, safeTotal)}
        fill={fill}
        stroke={stroke}
        strokeWidth={2.2}
        strokeDasharray={strokeDasharray}
      />
    );
  }

  // Wedge 0 (Top-Right): either popped user slice, funded stranger slice (if full), or open slot
  const wedge0FilledByStranger = !hasUserPop && safeClaimed === safeTotal;

  return (
    <div
      className="sb-slice-meter shrink-0"
      aria-label={`${safeClaimed} of ${safeTotal} slices claimed`}
      title={`${safeClaimed} of ${safeTotal} slices claimed`}
    >
      <svg
        viewBox="0 0 88 88"
        width={size}
        height={size}
        role="img"
        aria-hidden="true"
      >
        <rect
          x="6"
          y="6"
          width="76"
          height="76"
          rx="18"
          fill="#FFFFFF"
          stroke="#0B241C"
          strokeWidth="3.5"
        />
        {regularWedges}
        <path
          d={wedgePath(0, safeTotal)}
          transform={hasUserPop ? 'translate(3, -3)' : undefined}
          fill={
            hasUserPop
              ? '#FF6B1A'
              : wedge0FilledByStranger
                ? '#10D48E'
                : '#EDF7F2'
          }
          stroke={hasUserPop ? '#0B241C' : isClosingSoon ? '#FF6B1A' : '#FFFFFF'}
          strokeWidth={hasUserPop ? 2 : 2.2}
          strokeDasharray={!hasUserPop && isClosingSoon ? '3 2' : undefined}
        />
        <circle
          cx={CX}
          cy={CY}
          r="13.5"
          fill="#FFFFFF"
          stroke="#0B241C"
          strokeWidth="2.5"
        />
        <text
          x={CX}
          y={CY + 3.5}
          textAnchor="middle"
          fontFamily="var(--sb-font-mono)"
          fontWeight="700"
          fontSize="9.5"
          fill="#0B241C"
        >
          {safeClaimed}/{safeTotal}
        </text>
      </svg>
    </div>
  );
};
