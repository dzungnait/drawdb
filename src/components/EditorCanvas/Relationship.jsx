import {
  memo,
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
} from "react";
import { Cardinality } from "../../data/constants";
import { calcPath, calcCompositePath } from "../../utils/calcPath";
import { useSettings } from "../../hooks";
import { useTranslation } from "react-i18next";
import { SideSheet } from "@douyinfe/semi-ui";
import RelationshipInfo from "../EditorSidePanel/RelationshipsTab/RelationshipInfo";
import {
  getVisibleFieldIndex,
  getVisibleFields,
  getRelationshipFields,
  getTableWidth,
} from "../../utils/utils";

const labelFontSize = 16;

// Everything that changes often comes in as props (rather than from the
// diagram/selection contexts) so that, memoized, a relationship re-renders
// only when one of its own tables changes.
function Relationship({
  data,
  startTable,
  endTable,
  relationships,
  sheetOpen,
  onEdit,
  onCloseSheet,
}) {
  const { settings } = useSettings();
  const { t } = useTranslation();

  const pathValues = useMemo(() => {
    if (!startTable || !endTable || startTable.hidden || endTable.hidden)
      return null;

    const startFields = getVisibleFields(startTable, relationships);
    const endFields = getVisibleFields(endTable, relationships);

    const pairs = getRelationshipFields(data);

    return {
      startFieldIndex: getVisibleFieldIndex(
        startTable,
        data.startFieldId,
        relationships,
      ),
      endFieldIndex: getVisibleFieldIndex(
        endTable,
        data.endFieldId,
        relationships,
      ),
      startFieldIndices: pairs.map((p) =>
        getVisibleFieldIndex(startTable, p.startFieldId, relationships),
      ),
      endFieldIndices: pairs.map((p) =>
        getVisibleFieldIndex(endTable, p.endFieldId, relationships),
      ),
      startTable: {
        x: startTable.x,
        y: startTable.y,
        width: getTableWidth(startTable),
        comment: startTable.comment,
        fields: startFields,
      },
      endTable: {
        x: endTable.x,
        y: endTable.y,
        width: getTableWidth(endTable),
        comment: endTable.comment,
        fields: endFields,
      },
    };
  }, [startTable, endTable, relationships, data]);

  const isComposite = (pathValues?.startFieldIndices?.length ?? 0) > 1;

  const composite = useMemo(() => {
    if (!pathValues || !isComposite) return null;
    return calcCompositePath(
      {
        startTable: pathValues.startTable,
        endTable: pathValues.endTable,
        startFieldIndices: pathValues.startFieldIndices,
        endFieldIndices: pathValues.endFieldIndices,
      },
      1,
      settings.showComments,
    );
  }, [pathValues, isComposite, settings.showComments]);

  const pathRef = useRef();
  const labelRef = useRef();
  const [hovered, setHovered] = useState(false);

  let cardinalityStart = "1";
  let cardinalityEnd = "1";

  switch (data.cardinality) {
    // the translated values are to ensure backwards compatibility
    case t(Cardinality.MANY_TO_ONE):
    case Cardinality.MANY_TO_ONE:
      cardinalityStart = data.manyLabel || "n";
      cardinalityEnd = "1";
      break;
    case t(Cardinality.ONE_TO_MANY):
    case Cardinality.ONE_TO_MANY:
      cardinalityStart = "1";
      cardinalityEnd = data.manyLabel || "n";
      break;
    case t(Cardinality.ONE_TO_ONE):
    case Cardinality.ONE_TO_ONE:
      cardinalityStart = "1";
      cardinalityEnd = "1";
      break;
    default:
      break;
  }

  const cardinalityOffset = 28;

  const path = !pathValues
    ? null
    : composite
      ? composite.path
      : calcPath(pathValues, 1, settings.showComments);

  // Label and cardinality positions come from the rendered path, so they are
  // measured after it is committed and before the browser paints.
  const [points, setPoints] = useState(null);
  useLayoutEffect(() => {
    if (!path) return;
    let mid;
    let start;
    let end;
    if (composite) {
      mid = composite.labelPoint;
      start = composite.startCardinality;
      end = composite.endCardinality;
    } else if (pathRef.current) {
      const length = pathRef.current.getTotalLength();
      mid = pathRef.current.getPointAtLength(length / 2);
      start = pathRef.current.getPointAtLength(cardinalityOffset);
      end = pathRef.current.getPointAtLength(length - cardinalityOffset);
    } else {
      return;
    }
    const label = labelRef.current?.getBBox();
    const next = {
      labelX: mid.x - (label?.width ?? 0) / 2,
      labelY: mid.y + (label?.height ?? 0) / 2,
      startX: start.x,
      startY: start.y,
      endX: end.x,
      endY: end.y,
    };
    setPoints((prev) =>
      prev && Object.keys(next).every((k) => prev[k] === next[k])
        ? prev
        : next,
    );
  }, [path, composite, data.name, settings.showRelationshipLabels]);

  const edit = () => onEdit(data.id);

  if (!pathValues) return null;

  return (
    <>
      <g
        className="select-none group"
        onDoubleClick={edit}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        {/* invisible wider path for better hover ux */}
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={12}
          cursor="pointer"
        />
        <path
          ref={pathRef}
          d={path}
          className="relationship-path"
          style={{ stroke: hovered ? undefined : data.color }}
          fill="none"
          cursor="pointer"
        />
        {settings.showRelationshipLabels && (
          <text
            x={points?.labelX ?? 0}
            y={points?.labelY ?? 0}
            fill={data.color ?? (settings.mode === "dark" ? "lightgrey" : "#333")}
            fontSize={labelFontSize}
            fontWeight={500}
            ref={labelRef}
            className="group-hover:fill-sky-600"
          >
            {data.name}
          </text>
        )}
        {points && settings.showCardinality && (
          <>
            <CardinalityLabel
              x={points.startX}
              y={points.startY}
              text={cardinalityStart}
              color={data.color}
            />
            <CardinalityLabel
              x={points.endX}
              y={points.endY}
              text={cardinalityEnd}
              color={data.color}
            />
          </>
        )}
      </g>
      <SideSheet
        title={t("edit")}
        size="small"
        visible={sheetOpen}
        onCancel={onCloseSheet}
        style={{ paddingBottom: "16px" }}
      >
        <div className="sidesheet-theme">
          <RelationshipInfo data={data} />
        </div>
      </SideSheet>
    </>
  );
}

export default memo(Relationship);

function CardinalityLabel({ x, y, text, color, r = 12, padding = 14 }) {
  const [textWidth, setTextWidth] = useState(0);
  const textRef = useRef(null);

  useEffect(() => {
    if (textRef.current) {
      const bbox = textRef.current.getBBox();
      setTextWidth(bbox.width);
    }
  }, [text]);

  return (
    <g>
      <rect
        x={x - textWidth / 2 - padding / 2}
        y={y - r}
        rx={r}
        ry={r}
        width={textWidth + padding}
        height={r * 2}
        fill={color ?? "grey"}
        className="group-hover:fill-sky-600"
      />
      <text
        ref={textRef}
        x={x}
        y={y}
        fill="white"
        strokeWidth="0.5"
        textAnchor="middle"
        alignmentBaseline="middle"
      >
        {text}
      </text>
    </g>
  );
}
