import { useParams } from "react-router-dom";
import { useDiagram, useTransform } from "../../hooks";
import { getTableWidth } from "../../utils/utils";
import { openComments, useThreads } from "../comments";
import { useCommentsAvailable } from "./CommentsPanel";

/**
 * Inside the diagram's SVG: a bubble on each table with open comment
 * threads, opening them when clicked.
 */
export default function CommentBadges() {
  const { id } = useParams();
  const available = useCommentsAvailable();
  const threads = useThreads(available ? id : null);
  const { tables } = useDiagram();
  const { transform } = useTransform();
  if (!available || !threads) return null;

  const counts = new Map();
  for (const th of threads) {
    if (!th.resolved) counts.set(th.tableId, (counts.get(th.tableId) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  // The same size on screen at any zoom
  const scale = 1 / transform.zoom;
  return (
    <g data-export-ignore>
      {tables.map((table) => {
        const count = counts.get(String(table.id));
        if (!count || table.hidden) return null;
        const x = table.x + getTableWidth(table);
        return (
          <g
            key={table.id}
            transform={`translate(${x} ${table.y}) scale(${scale})`}
            className="cursor-pointer"
            data-comment-badge={table.id}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openComments(table.id);
            }}
          >
            <circle r="12" fill="#f59e0b" stroke="white" strokeWidth="2" />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="11"
              fontWeight="700"
              fill="white"
              fontFamily="sans-serif"
            >
              {count}
            </text>
          </g>
        );
      })}
    </g>
  );
}
