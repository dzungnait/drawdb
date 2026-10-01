import { createContext, useCallback, useState } from "react";
import { Action, DB, ObjectType, defaultBlue } from "../data/constants";
import { useTransform, useUndoRedo, useSelect, useCollab } from "../hooks";
import { Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { getRelationshipFields } from "../utils/utils";
import { cascadePosition } from "../utils/rect";

export const DiagramContext = createContext(null);

export default function DiagramContextProvider({ children }) {
  const { t } = useTranslation();
  const [database, setDatabaseRaw] = useState(DB.GENERIC);
  const [tables, setTables] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const { transform } = useTransform();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { selectedElement, setSelectedElement } = useSelect();
  const { emitDelta, isApplyingRemoteRef } = useCollab();

  const shouldEmit = () => !isApplyingRemoteRef?.current;

  const setDatabase = useCallback(
    (next) => {
      setDatabaseRaw(next);
      if (!isApplyingRemoteRef?.current) {
        emitDelta({
          target: "database",
          action: "update",
          entityId: "database",
          data: [next],
        });
      }
    },
    [emitDelta, isApplyingRemoteRef],
  );

  const addTable = (data, addToHistory = true) => {
    const id = nanoid();
    const newTable = {
      id,
      name: `table_${id}`,
      ...cascadePosition(transform.pan, tables),
      locked: false,
      fields: [
        {
          name: "id",
          type: database === DB.GENERIC ? "INT" : "INTEGER",
          default: "",
          check: "",
          primary: true,
          unique: false,
          unsigned: true,
          notNull: true,
          increment: true,
          comment: "",
          id: nanoid(),
        },
      ],
      comment: "",
      indices: [],
      uniqueConstraints: [],
      color: defaultBlue,
      collapsed: false,
    };
    if (data) {
      setTables((prev) => {
        const temp = prev.slice();
        temp.splice(data.index || tables.length, 0, data.table);
        return temp;
      });
    } else {
      setTables((prev) => [...prev, newTable]);
    }
    if (addToHistory) {
      setUndoStack((prev) => [
        ...prev,
        {
          data: data || { table: newTable, index: tables.length - 1 },
          action: Action.ADD,
          element: ObjectType.TABLE,
          message: t("add_table"),
        },
      ]);
      setRedoStack([]);
    }
    if (shouldEmit()) {
      const created = data?.table ?? newTable;
      emitDelta({
        target: "table",
        action: "create",
        entityId: created.id,
        data: [created],
      });
    }
  };

  const deleteTable = (id, addToHistory = true) => {
    if (addToHistory) {
      const rels = relationships.reduce((acc, r) => {
        if (r.startTableId === id || r.endTableId === id) {
          acc.push(r);
        }
        return acc;
      }, []);
      const deletedTable = tables.find((t) => t.id === id);
      const deletedTableIndex = tables.findIndex((t) => t.id === id);
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.DELETE,
          element: ObjectType.TABLE,
          data: {
            table: deletedTable,
            relationship: rels,
            index: deletedTableIndex,
          },
          message: t("delete_table", { tableName: deletedTable.name }),
        },
      ]);
      setRedoStack([]);
      Toast.success(t("table_deleted"));
    }
    setRelationships((prevR) =>
      prevR.filter((e) => !(e.startTableId === id || e.endTableId === id)),
    );
    setTables((prev) => prev.filter((e) => e.id !== id));
    if (id === selectedElement.id) {
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.NONE,
        id: null,
        open: false,
      }));
    }
    if (shouldEmit()) {
      emitDelta({
        target: "table",
        action: "delete",
        entityId: id,
        data: [id],
      });
    }
  };

  const updateTable = (id, updatedValues) => {
    setTables((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updatedValues } : t)),
    );
    if (shouldEmit()) {
      emitDelta({
        target: "table",
        action: "update",
        entityId: id,
        data: [id, updatedValues],
      });
    }
  };

  const updateField = (tid, fid, updatedValues) => {
    setTables((prev) =>
      prev.map((table) => {
        if (tid === table.id) {
          return {
            ...table,
            fields: table.fields.map((field) =>
              fid === field.id ? { ...field, ...updatedValues } : field,
            ),
          };
        }
        return table;
      }),
    );
    if (shouldEmit()) {
      emitDelta({
        target: "table",
        action: "update",
        entityId: tid,
        data: [tid, fid, updatedValues],
      });
    }
  };

  const deleteField = (field, tid, addToHistory = true) => {
    const { fields, name } = tables.find((t) => t.id === tid);
    const referencesField = (r) =>
      getRelationshipFields(r).some(
        (p) =>
          (r.startTableId === tid && p.startFieldId === field.id) ||
          (r.endTableId === tid && p.endFieldId === field.id),
      );
    if (addToHistory) {
      const rels = relationships.reduce((acc, r) => {
        if (referencesField(r)) {
          acc.push(r);
        }
        return acc;
      }, []);
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.EDIT,
          element: ObjectType.TABLE,
          component: "field_delete",
          tid: tid,
          data: {
            field: field,
            index: fields.findIndex((f) => f.id === field.id),
            relationship: rels,
          },
          message: t("edit_table", {
            tableName: name,
            extra: "[delete field]",
          }),
        },
      ]);
      setRedoStack([]);
    }
    setRelationships((prev) => prev.filter((e) => !referencesField(e)));
    updateTable(tid, {
      fields: fields.filter((e) => e.id !== field.id),
    });
  };

  // Inserts a copy of the field right after the original. Without `data`
  // a new copy is built; with `data` (redo) that exact field is re-inserted.
  const duplicateField = (tid, fid, addToHistory = true, data = null) => {
    const table = tables.find((t) => t.id === tid);
    if (!table) return;

    let field = data?.field;
    let index = data?.index;
    if (!field) {
      const sourceIndex = table.fields.findIndex((f) => f.id === fid);
      if (sourceIndex === -1) return;
      const source = table.fields[sourceIndex];
      const names = new Set(table.fields.map((f) => f.name));
      const base = `${source.name || "field"}_copy`;
      let name = base;
      for (let i = 2; names.has(name); i++) name = `${base}${i}`;
      field = {
        ...source,
        id: nanoid(),
        name,
        // A copy can't share the original's key role
        primary: false,
        increment: false,
      };
      index = sourceIndex + 1;
    }

    const fields = table.fields.slice();
    fields.splice(index, 0, field);
    updateTable(tid, { fields });

    if (addToHistory) {
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.EDIT,
          element: ObjectType.TABLE,
          component: "field_duplicate",
          tid,
          fid: field.id,
          data: { field, index },
          message: t("edit_table", {
            tableName: table.name,
            extra: "[duplicate field]",
          }),
        },
      ]);
      setRedoStack([]);
    }
  };

  const addRelationship = (data, addToHistory = true) => {
    if (addToHistory) {
      setRelationships((prev) => {
        setUndoStack((prevUndo) => [
          ...prevUndo,
          {
            action: Action.ADD,
            element: ObjectType.RELATIONSHIP,
            data: {
              relationship: data,
              index: prevUndo.length,
            },
            message: t("add_relationship"),
          },
        ]);
        setRedoStack([]);
        return [...prev, data];
      });
    } else {
      setRelationships((prev) => {
        const temp = prev.slice();
        temp.splice(data.index ?? temp.length, 0, data.relationship || data);
        return temp;
      });
    }
    if (shouldEmit()) {
      const created = data?.relationship ?? data;
      emitDelta({
        target: "relationship",
        action: "create",
        entityId: created.id,
        data: [created],
      });
    }
  };

  const deleteRelationship = (id, addToHistory = true) => {
    if (addToHistory) {
      const relationshipIndex = relationships.findIndex((r) => r.id === id);
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.DELETE,
          element: ObjectType.RELATIONSHIP,
          data: {
            relationship: relationships[relationshipIndex],
            index: relationshipIndex,
          },
          message: t("delete_relationship", {
            refName: relationships[relationshipIndex].name,
          }),
        },
      ]);
      setRedoStack([]);
    }
    setRelationships((prev) => prev.filter((e) => e.id !== id));
    if (shouldEmit()) {
      emitDelta({
        target: "relationship",
        action: "delete",
        entityId: id,
        data: [id],
      });
    }
    if (
      selectedElement.element === ObjectType.RELATIONSHIP &&
      selectedElement.id === id
    ) {
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.NONE,
        id: -1,
        open: false,
      }));
    }
  };

  const updateRelationship = (id, updatedValues) => {
    setRelationships((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updatedValues } : t)),
    );
    if (shouldEmit()) {
      emitDelta({
        target: "relationship",
        action: "update",
        entityId: id,
        data: [id, updatedValues],
      });
    }
  };

  return (
    <DiagramContext.Provider
      value={{
        tables,
        setTables,
        addTable,
        updateTable,
        updateField,
        deleteField,
        duplicateField,
        deleteTable,
        relationships,
        setRelationships,
        addRelationship,
        deleteRelationship,
        updateRelationship,
        database,
        setDatabase,
        tablesCount: tables.length,
        relationshipsCount: relationships.length,
      }}
    >
      {children}
    </DiagramContext.Provider>
  );
}
