import { memo, useMemo, useRef, useState } from "react";
import {
  Action,
  Tab,
  ObjectType,
  tableHeaderHeight,
  tableColorStripHeight,
} from "../../data/constants";
import {
  IconChevronDown,
  IconChevronUp,
  IconMore,
  IconMinus,
  IconDeleteStroked,
  IconEditStroked,
  IconCopyStroked,
  IconKeyStroked,
  IconLock,
  IconUnlock,
} from "@douyinfe/semi-icons";
import { nanoid } from "nanoid";
import {
  Popover,
  Tag,
  Button,
  ButtonGroup,
  SideSheet,
  Divider,
} from "@douyinfe/semi-ui";
import {
  useLayout,
  useSettings,
  useDiagram,
  useSelect,
  useUndoRedo,
  useTransform,
} from "../../hooks";
import TableInfo from "../EditorSidePanel/TablesTab/TableInfo";
import { useTranslation } from "react-i18next";
import { resolveType } from "../../utils/customTypes";
import { isRtl } from "../../i18n/utils/rtl";
import i18n from "../../i18n/i18n";
import {
  getCommentHeight,
  getFieldOffsetY,
  getTableHeight,
  getTableWidth,
  getVisibleFieldEntries,
  getVisibleFields,
  getRelationshipFields,
} from "../../utils/utils";
import ResizeHandles from "./ResizeHandles";
import { Slot } from "../../context/ExtensionsContext";

// The heavy part of a table. It takes everything that changes while any
// table is dragged (diagram and selection state) as plain props, so when
// memoized only the tables that actually changed re-render.
// Diagram/selection actions are read from `actions` at call time: they close
// over the latest diagram, which this component may not have rendered with.
const TableView = memo(function TableView({
  tableData,
  onPointerDown,
  setHoveredTable,
  handleGripField,
  setLinkingLine,
  isSelected,
  sheetOpen,
  database,
  relationships,
  fieldReferences,
  actions,
}) {
  const [hoveredField, setHoveredField] = useState(null);
  const [hovered, setHovered] = useState(false);
  const [resizeEngaged, setResizeEngaged] = useState(false);
  const { layout } = useLayout();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { settings } = useSettings();
  const { transform } = useTransform();
  const { t } = useTranslation();
  const { setSelectedElement, setBulkSelectedElements } = actions.current;

  const borderColor = useMemo(
    () => (settings.mode === "light" ? "border-zinc-300" : "border-zinc-600"),
    [settings.mode],
  );

  const width = getTableWidth(tableData);

  const height = getTableHeight(
    tableData,
    settings.showComments,
    relationships,
  );

  const visibleFieldEntries = useMemo(
    () => getVisibleFieldEntries(tableData, relationships),
    [tableData, relationships],
  );

  const visibleFields = useMemo(
    () => getVisibleFields(tableData, relationships),
    [tableData, relationships],
  );


  const toggleTableCollapse = (e) => {
    e.stopPropagation();
    if (layout.readOnly) return;

    const collapsed = !tableData.collapsed;
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.EDIT,
        element: ObjectType.TABLE,
        component: "self",
        tid: tableData.id,
        undo: { collapsed: tableData.collapsed },
        redo: { collapsed },
        message: t("edit_table", {
          tableName: tableData.name,
          extra: "[collapse fields]",
        }),
      },
    ]);
    setRedoStack([]);
    actions.current.updateTable(tableData.id, { collapsed });
  };

  const lockUnlockTable = (e) => {
    const locking = !tableData.locked;
    actions.current.updateTable(tableData.id, { locked: locking });

    const lockTable = () => {
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.NONE,
        id: -1,
        open: false,
      }));
      setBulkSelectedElements((prev) =>
        prev.filter(
          (el) => el.id !== tableData.id || el.type !== ObjectType.TABLE,
        ),
      );
    };

    const unlockTable = () => {
      const elementInBulk = {
        id: tableData.id,
        type: ObjectType.TABLE,
        initialCoords: { x: tableData.x, y: tableData.y },
        currentCoords: { x: tableData.x, y: tableData.y },
      };
      if (e.ctrlKey || e.metaKey) {
        setBulkSelectedElements((prev) => [...prev, elementInBulk]);
      } else {
        setBulkSelectedElements([elementInBulk]);
      }
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.TABLE,
        id: tableData.id,
        open: false,
      }));
    };

    if (locking) {
      lockTable();
    } else {
      unlockTable();
    }
  };

  const duplicateTable = () => {
    if (layout.readOnly) return;
    const duplicated = {
      ...tableData,
      id: nanoid(),
      name: `${tableData.name}_copy`,
      x: tableData.x + 24,
      y: tableData.y + 24,
      fields: tableData.fields.map((f) => ({ ...f, id: nanoid() })),
      indices: tableData.indices.map((idx) => ({ ...idx, id: nanoid() })),
    };
    actions.current.addTable({ table: duplicated });
  };

  const openEditor = () => {
    const previousTab = actions.current.selectedElement.currentTab;
    if (!layout.sidebar) {
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.TABLE,
        id: tableData.id,
        open: true,
      }));
    } else {
      setSelectedElement((prev) => ({
        ...prev,
        currentTab: Tab.TABLES,
        element: ObjectType.TABLE,
        id: tableData.id,
        open: true,
      }));
      if (previousTab !== Tab.TABLES) return;
      document
        .getElementById(`scroll_table_${tableData.id}`)
        .scrollIntoView({ behavior: "smooth" });
    }
  };

  const resizeTable = ({ width: nextWidth, x: nextX }) => {
    actions.current.updateTable(
      tableData.id,
      nextX === undefined
        ? { width: nextWidth }
        : { width: nextWidth, x: nextX },
    );
    if (nextX === undefined) return;
    setBulkSelectedElements((prev) =>
      prev.map((el) =>
        el.type === ObjectType.TABLE && el.id === tableData.id
          ? {
              ...el,
              initialCoords: { ...el.initialCoords, x: nextX },
              currentCoords: { ...el.currentCoords, x: nextX },
            }
          : el,
      ),
    );
  };

  const commitResize = (initial, final) => {
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.EDIT,
        element: ObjectType.TABLE,
        component: "self",
        tid: tableData.id,
        undo: initial,
        redo: final,
        message: t("edit_table", {
          tableName: tableData.name,
          extra: "[width]",
        }),
      },
    ]);
    setRedoStack([]);
  };

  if (tableData.hidden) return null;

  return (
    <>
      <foreignObject
        key={tableData.id}
        x={tableData.x}
        y={tableData.y}
        width={width}
        height={height}
        className="group drop-shadow-lg rounded-md cursor-move"
        onPointerDown={() => onPointerDown(tableData)}
        onPointerEnter={(e) => e.isPrimary && setHovered(true)}
        onPointerLeave={(e) => e.isPrimary && setHovered(false)}
      >
        <div
          onDoubleClick={openEditor}
          className={`border-2 hover:border-dashed hover:border-blue-500
               select-none rounded-lg w-full ${
                 settings.mode === "light"
                   ? "bg-zinc-100 text-zinc-800"
                   : "bg-zinc-800 text-zinc-200"
               } ${
                 resizeEngaged
                   ? "border-dashed border-blue-500"
                   : isSelected
                     ? "border-solid border-blue-500"
                     : borderColor
               }`}
          style={{ direction: "ltr" }}
        >
          <div
            className="h-[10px] w-full rounded-t-md"
            style={{ backgroundColor: tableData.color }}
          />
          <div
            className={`${
              visibleFieldEntries.length === 0
                ? "rounded-b-md"
                : "border-b border-gray-400"
            } ${
              settings.mode === "light" ? "bg-zinc-100" : "bg-zinc-900"
            } ${tableData.comment && settings.showComments ? "pb-3" : ""}`}
          >
            <div
              className={`overflow-hidden font-bold h-[40px] flex justify-between items-center gap-2`}
            >
              <div className="px-3 overflow-hidden text-ellipsis whitespace-nowrap min-w-0 flex-1">
                {tableData.name}
              </div>
              <div className="hidden group-hover:flex items-center shrink-0 pe-2">
                <Slot name="table-actions" props={{ tableId: tableData.id }} />
                <ButtonGroup
                  type="tertiary"
                  size="small"
                  aria-label={t("table_actions")}
                >
                  <Button
                    size="small"
                    type="tertiary"
                    title={tableData.locked ? t("unlock_table") : t("lock_table")}
                    icon={
                      tableData.locked ? (
                        <IconLock size="small" />
                      ) : (
                        <IconUnlock size="small" />
                      )
                    }
                    disabled={layout.readOnly}
                    onClick={lockUnlockTable}
                  />
                  <Button
                    size="small"
                    type="tertiary"
                    icon={
                      tableData.collapsed ? (
                        <IconChevronDown size="small" />
                      ) : (
                        <IconChevronUp size="small" />
                      )
                    }
                    disabled={layout.readOnly}
                    aria-label={
                      tableData.collapsed
                        ? t("expand_unlinked_columns")
                        : t("collapse_unlinked_columns")
                    }
                    title={
                      tableData.collapsed
                        ? t("expand_unlinked_columns")
                        : t("collapse_unlinked_columns")
                    }
                    onClick={toggleTableCollapse}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                  <Popover
                    key={tableData.id}
                    content={
                      <div className="popover-theme flex flex-col py-1 min-w-[160px]">
                        <Button
                          icon={<IconEditStroked />}
                          type="tertiary"
                          theme="borderless"
                          block
                          style={{ justifyContent: "flex-start" }}
                          onClick={openEditor}
                        >
                          {t("edit")}
                        </Button>
                        <Button
                          icon={<IconCopyStroked />}
                          type="tertiary"
                          theme="borderless"
                          block
                          style={{ justifyContent: "flex-start" }}
                          onClick={duplicateTable}
                          disabled={layout.readOnly}
                        >
                          {t("duplicate")}
                        </Button>
                        <Divider className="!my-1" />
                        <Button
                          icon={<IconDeleteStroked />}
                          type="danger"
                          theme="borderless"
                          block
                          style={{ justifyContent: "flex-start" }}
                          onClick={() => actions.current.deleteTable(tableData.id)}
                          disabled={layout.readOnly}
                        >
                          {t("delete")}
                        </Button>
                      </div>
                    }
                    position="rightTop"
                    style={{ padding: 8 }}
                    showArrow
                    trigger="click"
                  >
                    <Button
                      size="small"
                      type="tertiary"
                      icon={<IconMore size="small" />}
                      title={t("see_more")}
                    />
                  </Popover>
                </ButtonGroup>
              </div>
            </div>
            {tableData.comment && settings.showComments && (
              <div className="text-xs px-3 line-clamp-5">
                {tableData.comment}
              </div>
            )}
          </div>

          {visibleFieldEntries.map(({ field: e }, i) => {
            const resolved = resolveType(database, e.type);
            const reference = fieldReferences[e.id] ?? null;
            return settings.showFieldSummary ? (
              <Popover
                key={e.id ?? i}
                content={
                  <div className="popover-theme">
                    <div
                      className="flex justify-between items-center pb-2"
                      style={{ direction: "ltr" }}
                    >
                      <p className="me-4 font-bold">{e.name}</p>
                      <p
                        className={
                          "ms-4 font-mono " +
                          (resolved.isCustom ? "" : resolved.color)
                        }
                        style={
                          resolved.isCustom ? { color: resolved.color } : {}
                        }
                      >
                        {e.type +
                          ((resolved.isSized || resolved.hasPrecision) &&
                          e.size &&
                          e.size !== ""
                            ? "(" + e.size + ")"
                            : "")}
                      </p>
                    </div>
                    <hr />
                    {e.primary && (
                      <Tag color="blue" className="me-2 my-2">
                        {t("primary_key")}
                      </Tag>
                    )}
                    {e.unique && (
                      <Tag color="amber" className="me-2 my-2">
                        {t("unique")}
                      </Tag>
                    )}
                    {e.notNull && (
                      <Tag color="purple" className="me-2 my-2">
                        {t("not_null")}
                      </Tag>
                    )}
                    {e.increment && (
                      <Tag color="green" className="me-2 my-2">
                        {t("autoincrement")}
                      </Tag>
                    )}
                    {reference && (
                      <Tag color="light-blue" className="me-2 my-2">
                        {t("foreign_key")}
                      </Tag>
                    )}
                    {reference && (
                      <p>
                        <strong>{t("references")}: </strong>
                        {reference.tableName}({reference.fieldName})
                      </p>
                    )}
                    <p>
                      <strong>{t("default_value")}: </strong>
                      {e.default === "" ? t("not_set") : e.default}
                    </p>
                    <p className="max-w-80">
                      <strong>{t("comment")}: </strong>
                      {e.comment === "" ? t("not_set") : e.comment}
                    </p>
                  </div>
                }
                position="right"
                showArrow
                style={
                  isRtl(i18n.language)
                    ? { direction: "rtl" }
                    : { direction: "ltr" }
                }
              >
                {field(e, i)}
              </Popover>
            ) : (
              field(e, i)
            );
          })}
        </div>
      </foreignObject>
      {!layout.readOnly && !tableData.locked && (
        <ResizeHandles
          x={tableData.x}
          y={tableData.y}
          width={width}
          height={height}
          zoom={transform.zoom}
          visible={hovered}
          onResize={resizeTable}
          onResizeEnd={commitResize}
          onEngagedChange={setResizeEngaged}
        />
      )}
      <SideSheet
        title={t("edit")}
        size="small"
        visible={sheetOpen}
        onCancel={() =>
          setSelectedElement((prev) => ({
            ...prev,
            open: !prev.open,
          }))
        }
        style={{ paddingBottom: "16px" }}
      >
        <div className="sidesheet-theme">
          <TableInfo data={tableData} />
        </div>
      </SideSheet>
    </>
  );

  function field(fieldData, index) {
    const fieldResolved = resolveType(database, fieldData.type);
    const showFieldComment = fieldData.comment && settings.showComments;
    return (
      <div
        className={`${
          index === visibleFields.length - 1 ? "" : "border-b border-gray-400"
        } group w-full overflow-hidden`}
        onPointerEnter={(e) => {
          if (!e.isPrimary) return;

          setHoveredField(index);
          setHoveredTable({
            tableId: tableData.id,
            fieldId: fieldData.id,
          });
        }}
        onPointerLeave={(e) => {
          if (!e.isPrimary) return;

          setHoveredField(null);
          setHoveredTable({
            tableId: null,
            fieldId: null,
          });
        }}
        onPointerDown={(e) => {
          // Required for onPointerLeave to trigger when a touch pointer leaves
          // https://stackoverflow.com/a/70976017/1137077
          e.target.releasePointerCapture(e.pointerId);
        }}
      >
        <div className="h-[36px] px-2 py-1 flex justify-between items-center gap-1">
          <div
            className={`${
              hoveredField === index ? "text-zinc-400" : ""
            } flex items-center gap-2 overflow-hidden`}
          >
            <button
              className="shrink-0 w-[10px] h-[10px] bg-[#2f68adcc] rounded-full"
              onPointerDown={(e) => {
                if (!e.isPrimary) return;

                handleGripField();
                const fieldY =
                  tableData.y +
                  getFieldOffsetY(
                    visibleFields,
                    index,
                    width,
                    settings.showComments,
                  ) +
                  tableHeaderHeight +
                  tableColorStripHeight +
                  getCommentHeight(
                    tableData.comment,
                    width,
                    settings.showComments,
                  ) +
                  14;
                setLinkingLine((prev) => ({
                  ...prev,
                  startFieldId: fieldData.id,
                  startTableId: tableData.id,
                  startX: tableData.x + 15,
                  startY: fieldY,
                  endX: tableData.x + 15,
                  endY: fieldY,
                }));
              }}
            />
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {fieldData.name}
            </span>
            <Slot
              name="field-marker"
              props={{ tableId: tableData.id, fieldId: fieldData.id }}
            />
          </div>
          <div className="text-zinc-400">
            {hoveredField === index ? (
              <div className="flex gap-1">
                <Slot
                  name="field-actions"
                  props={{ tableId: tableData.id, fieldId: fieldData.id }}
                />
                <Button
                  theme="solid"
                  size="small"
                  title={t("duplicate")}
                  icon={<IconCopyStroked />}
                  disabled={layout.readOnly}
                  onClick={() => {
                    if (layout.readOnly) return;
                    actions.current.duplicateField(tableData.id, fieldData.id);
                  }}
                />
                <Button
                  theme="solid"
                  size="small"
                  title={t("delete")}
                  style={{
                    backgroundColor: "#d42020b3",
                  }}
                  icon={<IconMinus />}
                  disabled={layout.readOnly}
                  onClick={() => {
                    if (layout.readOnly) return;
                    actions.current.deleteField(fieldData, tableData.id);
                  }}
                />
              </div>
            ) : settings.showDataTypes ? (
              <div className="flex gap-1 items-center">
                {fieldData.primary && <IconKeyStroked />}
                {!fieldData.notNull && <span className="font-mono">?</span>}
                <span
                  className={
                    "font-mono " +
                    (fieldResolved.isCustom ? "" : fieldResolved.color)
                  }
                  style={
                    fieldResolved.isCustom ? { color: fieldResolved.color } : {}
                  }
                >
                  {fieldData.type +
                    ((fieldResolved.isSized || fieldResolved.hasPrecision) &&
                    fieldData.size &&
                    fieldData.size !== ""
                      ? `(${fieldData.size})`
                      : "")}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        {showFieldComment && (
          <div className="ms-3 px-3 pb-3">
            <div
              className={`text-xs line-clamp-2 ${settings.mode === "light" ? "text-zinc-600" : "text-zinc-200"}`}
            >
              {fieldData.comment}
            </div>
          </div>
        )}
      </div>
    );
  }
});

/** Reference target per field id, e.g. { f1: { tableName, fieldName } } */
function getFieldReferences(tableData, tables, relationships) {
  const refs = {};
  for (const r of relationships) {
    if (r.startTableId !== tableData.id) continue;
    const refTable = tables.find((tbl) => tbl.id === r.endTableId);
    if (!refTable) continue;
    for (const pair of getRelationshipFields(r)) {
      if (refs[pair.startFieldId]) continue;
      const refField = refTable.fields.find((f) => f.id === pair.endFieldId);
      if (refField) {
        refs[pair.startFieldId] = {
          tableName: refTable.name,
          fieldName: refField.name,
        };
      }
    }
  }
  return refs;
}

// Cheap wrapper: re-renders with the diagram/selection contexts (every frame
// of a drag) but hands TableView props that stay equal unless this table, its
// selection state or what its fields reference actually changed.
function Table(props) {
  const { tableData } = props;
  const diagram = useDiagram();
  const select = useSelect();
  const { layout } = useLayout();
  const { selectedElement, bulkSelectedElements } = select;

  const actions = useRef(null);
  actions.current = {
    addTable: diagram.addTable,
    deleteTable: diagram.deleteTable,
    deleteField: diagram.deleteField,
    duplicateField: diagram.duplicateField,
    updateTable: diagram.updateTable,
    selectedElement,
    setSelectedElement: select.setSelectedElement,
    setBulkSelectedElements: select.setBulkSelectedElements,
  };

  const isSelected =
    (selectedElement.id == tableData.id &&
      selectedElement.element === ObjectType.TABLE) ||
    bulkSelectedElements.some(
      (e) => e.type === ObjectType.TABLE && e.id === tableData.id,
    );
  const sheetOpen =
    selectedElement.element === ObjectType.TABLE &&
    selectedElement.id === tableData.id &&
    selectedElement.open &&
    !layout.sidebar;

  // Recomputed when any table moves; only replaced when its content changes
  const references = getFieldReferences(
    tableData,
    diagram.tables,
    diagram.relationships,
  );
  const referencesRef = useRef({ key: null, value: null });
  const referencesKey = JSON.stringify(references);
  if (referencesRef.current.key !== referencesKey) {
    referencesRef.current = { key: referencesKey, value: references };
  }

  return (
    <TableView
      {...props}
      isSelected={isSelected}
      sheetOpen={sheetOpen}
      database={diagram.database}
      relationships={diagram.relationships}
      fieldReferences={referencesRef.current.value}
      actions={actions}
    />
  );
}

// Memoized: the canvas re-renders on every pointer move
export default memo(Table);
