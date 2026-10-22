import {
  truckMixCenterLabelClass,
  truckMixCenterValueClass,
  truckMixLabelClass,
  truckMixLeaderClass,
  truckMixOuterRingClass,
  truckMixSvgClass,
  truckMixTickClass,
  truckMixTrackClass,
  truckMixValueClass,
} from "../../lib/uiClasses";

export type TruckMixSegment = {
  label: string;
  value: number;
  color: string;
};

type TruckMixArc = TruckMixSegment & {
  fraction: number;
  percent: number;
  start: number;
  mid: number;
  side: 1 | -1;
  labelY: number;
};

const WIDTH = 360;
const HEIGHT = 240;
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const OUTER_RADIUS = 72;
const RING_WIDTH = 22;
const RING_RADIUS = OUTER_RADIUS - RING_WIDTH / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const SEGMENT_GAP = 1.6;
const TICK_COUNT = 72;
const TICK_INNER_RADIUS = 38;
const TICK_OUTER_RADIUS = 44;
const LABEL_SPACING = 34;
const LABEL_MIN_Y = 12;
const LABEL_MAX_Y = 216;
const LABEL_OFFSET = 36;

// Angles are radians clockwise from 12 o'clock, matching the SVG rotation.
function pointAt(angle: number, radius: number) {
  return {
    x: CX + radius * Math.sin(angle),
    y: CY - radius * Math.cos(angle),
  };
}

function layoutArcs(segments: TruckMixSegment[], total: number) {
  let cursor = 0;
  const arcs: TruckMixArc[] = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const fraction = segment.value / total;
      const start = cursor;
      cursor += fraction;
      const mid = (start + fraction / 2) * 2 * Math.PI;
      return {
        ...segment,
        fraction,
        percent: Math.round(fraction * 100),
        start,
        mid,
        side: Math.sin(mid) >= 0 ? 1 : -1,
        labelY: pointAt(mid, OUTER_RADIUS + 10).y,
      };
    });

  // Push labels apart on each side so neighbouring small slices stay readable.
  for (const side of [1, -1] as const) {
    const group = arcs
      .filter((arc) => arc.side === side)
      .sort((left, right) => left.labelY - right.labelY);
    group.forEach((arc, index) => {
      const previous = group[index - 1];
      const minY = previous ? previous.labelY + LABEL_SPACING : LABEL_MIN_Y;
      arc.labelY = Math.max(arc.labelY, minY);
    });
    const last = group[group.length - 1];
    const overflow = last ? last.labelY - LABEL_MAX_Y : 0;
    if (overflow > 0) group.forEach((arc) => (arc.labelY -= overflow));
  }

  return arcs;
}

export function TruckMixDonut({ segments }: { segments: TruckMixSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const arcs = total ? layoutArcs(segments, total) : [];
  const summary = total
    ? `Truck mix: ${arcs
        .map((arc) => `${arc.label} ${arc.value} (${arc.percent}%)`)
        .join(", ")}`
    : "Truck mix: no trucks in the selected date range";

  return (
    <svg
      className={truckMixSvgClass}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={summary}
    >
      <circle
        className={truckMixOuterRingClass}
        cx={CX}
        cy={CY}
        r={OUTER_RADIUS + 8}
      />
      {total ? null : (
        <circle
          className={truckMixTrackClass}
          cx={CX}
          cy={CY}
          r={RING_RADIUS}
          strokeWidth={RING_WIDTH}
        />
      )}
      {Array.from({ length: TICK_COUNT }, (_, index) => {
        const angle = (index / TICK_COUNT) * 2 * Math.PI;
        const from = pointAt(angle, TICK_INNER_RADIUS);
        const to = pointAt(angle, TICK_OUTER_RADIUS);
        return (
          <line
            key={index}
            className={truckMixTickClass}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
          />
        );
      })}
      {arcs.map((arc) => (
        <circle
          key={arc.label}
          cx={CX}
          cy={CY}
          r={RING_RADIUS}
          fill="none"
          stroke={arc.color}
          strokeWidth={RING_WIDTH}
          strokeDasharray={`${Math.max(arc.fraction * RING_CIRCUMFERENCE - SEGMENT_GAP, 0)} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={-arc.start * RING_CIRCUMFERENCE}
          transform={`rotate(-90 ${CX} ${CY})`}
        />
      ))}
      {arcs.map((arc) => {
        const ring = pointAt(arc.mid, OUTER_RADIUS + 2);
        const elbow = pointAt(arc.mid, OUTER_RADIUS + 10);
        const edgeX = CX + arc.side * (OUTER_RADIUS + LABEL_OFFSET);
        const textX = edgeX + arc.side * 6;
        return (
          <g key={`${arc.label}-label`}>
            <path
              className={truckMixLeaderClass}
              d={`M ${ring.x} ${ring.y} L ${elbow.x} ${elbow.y} L ${edgeX} ${arc.labelY}`}
            />
            <text
              className={truckMixLabelClass}
              x={textX}
              y={arc.labelY + 4}
              textAnchor={arc.side > 0 ? "start" : "end"}
            >
              {arc.label} ({arc.value})
            </text>
            <text
              className={truckMixValueClass}
              x={textX}
              y={arc.labelY + 20}
              textAnchor={arc.side > 0 ? "start" : "end"}
            >
              {arc.percent}%
            </text>
          </g>
        );
      })}
      <text
        className={truckMixCenterValueClass}
        x={CX}
        y={CY + 4}
        textAnchor="middle"
      >
        {total.toLocaleString()}
      </text>
      <text
        className={truckMixCenterLabelClass}
        x={CX}
        y={CY + 20}
        textAnchor="middle"
      >
        Total
      </text>
    </svg>
  );
}
