/**
 * A soft shadow under a table or view. Drawn as plain rectangles: a CSS
 * drop-shadow filter on every table made panning a large diagram slow.
 */
export default function Shadow({ x, y, width, height }) {
  return (
    <g className="pointer-events-none">
      <rect
        x={x}
        y={y + 4}
        width={width}
        height={height + 2}
        rx={8}
        fill="rgb(0 0 0 / 0.04)"
      />
      <rect
        x={x}
        y={y + 2}
        width={width}
        height={height}
        rx={8}
        fill="rgb(0 0 0 / 0.08)"
      />
    </g>
  );
}
