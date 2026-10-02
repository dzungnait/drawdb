import { memo, useMemo, useRef } from "react";
import { Collapse, Button } from "@douyinfe/semi-ui";
import { IconEyeOpened, IconEyeClosed } from "@douyinfe/semi-icons";
import { IconPlus } from "@douyinfe/semi-icons";
import {
  useSelect,
  useDiagram,
  useSaveState,
  useLayout,
  useUndoRedo,
} from "../../../hooks";
import { Action, ObjectType, State } from "../../../data/constants";
import { useTranslation } from "react-i18next";
import { DragHandle } from "../../SortableList/DragHandle";
import { SortableList } from "../../SortableList/SortableList";
import SearchBar from "./SearchBar";
import Empty from "../Empty";
import TableInfo from "./TableInfo";

export default function TablesTab() {
  const { tables, addTable, setTables, updateTable } = useDiagram();
  const { selectedElement, setSelectedElement } = useSelect();
  const { t } = useTranslation();
  const { layout } = useLayout();
  const { setSaveState } = useSaveState();
  // Read when used, so list items don't re-render on every diagram change
  // (moving one table would otherwise re-render the whole list)
  const updateTableRef = useRef(updateTable);
  updateTableRef.current = updateTable;
  const tablesRef = useRef(tables);
  tablesRef.current = tables;
  const listed = useListedTables(tables);
  const activeKey =
    selectedElement.open && selectedElement.element === ObjectType.TABLE
      ? `${selectedElement.id}`
      : "";

  // Built again only when what the list shows changes, not on every move of
  // a table on the canvas: re-rendering every panel and sortable item made
  // dragging slow in a large diagram
  const list = useMemo(
    () => (
      <Collapse
        activeKey={activeKey}
        keepDOM={false}
        lazyRender
        onChange={(k) =>
          setSelectedElement((prev) => ({
            ...prev,
            open: true,
            id: k[0],
            element: ObjectType.TABLE,
          }))
        }
        accordion
      >
        <SortableList
          keyPrefix="tables-tab"
          items={listed}
          // The listed tables may have old positions, so the current ones
          // are put in the new order
          onChange={(newTables) => {
            const byId = new Map(tablesRef.current.map((t) => [t.id, t]));
            setTables(newTables.map((t) => byId.get(t.id) ?? t));
          }}
          afterChange={() => setSaveState(State.SAVING)}
          renderItem={(item) => (
            <TableListItem
              table={item}
              readOnly={layout.readOnly}
              updateTable={updateTableRef}
            />
          )}
        />
      </Collapse>
    ),
    [
      activeKey,
      listed,
      layout.readOnly,
      setSelectedElement,
      setTables,
      setSaveState,
    ],
  );

  return (
    <>
      <div className="flex gap-2">
        <SearchBar tables={listed} />
        <div>
          <Button
            block
            icon={<IconPlus />}
            onClick={() => addTable()}
            disabled={layout.readOnly}
          >
            {t("add_table")}
          </Button>
        </div>
      </div>
      {tables.length === 0 ? (
        <Empty title={t("no_tables")} text={t("no_tables_text")} />
      ) : (
        list
      )}
    </>
  );
}

/**
 * The tables, keeping the same object for a table whose only change is its
 * position, which the list doesn't show.
 */
function useListedTables(tables) {
  const cache = useRef({ byId: new Map(), list: [] });
  const { byId, list } = cache.current;
  const next = new Map();
  const listed = tables.map((table) => {
    const prev = byId.get(table.id);
    const kept =
      prev && sameButPosition(prev.source, table) ? prev.listed : table;
    next.set(table.id, { source: table, listed: kept });
    return kept;
  });
  const same =
    listed.length === list.length && listed.every((t, i) => t === list[i]);
  cache.current = { byId: next, list: same ? list : listed };
  return cache.current.list;
}

function sameButPosition(a, b) {
  if (a === b) return true;
  const keys = Object.keys(b);
  if (keys.length !== Object.keys(a).length) return false;
  return keys.every((k) => k === "x" || k === "y" || a[k] === b[k]);
}

const TableListItem = memo(function TableListItem({
  table,
  readOnly,
  updateTable,
}) {
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { t } = useTranslation();

  const toggleTableVisibility = (e) => {
    e.stopPropagation();
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.EDIT,
        element: ObjectType.TABLE,
        component: "self",
        tid: table.id,
        undo: { hidden: table.hidden },
        redo: { hidden: !table.hidden },
        message: t("edit_table", {
          tableName: table.name,
          extra: "[hidden]",
        }),
      },
    ]);
    setRedoStack([]);
    updateTable.current(table.id, { hidden: !table.hidden });
  };

  return (
    <div id={`scroll_table_${table.id}`}>
      <Collapse.Panel
        className="relative"
        header={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 flex-1">
              <DragHandle readOnly={readOnly} id={table.id} />
              <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                {table.name}
              </div>
            </div>
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={toggleTableVisibility}
              icon={table.hidden ? <IconEyeClosed /> : <IconEyeOpened />}
              className="me-2"
            />
            <div
              className="w-1 h-full absolute top-0 left-0 bottom-0"
              style={{ backgroundColor: table.color }}
            />
          </div>
        }
        itemKey={`${table.id}`}
      >
        <TableInfo data={table} />
      </Collapse.Panel>
    </div>
  );
});
