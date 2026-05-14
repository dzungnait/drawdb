import { createContext, useState } from "react";
import { Action, DB, ObjectType, defaultBlue } from "../data/constants";
import { useTransform, useUndoRedo, useSelect } from "../hooks";
import { Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { emitOperation } from "../utils/operationEmitter";
import { calculateAutoArrangePositions, generateTableUpdates } from "../utils/autoArrange";

export const DiagramContext = createContext(null);

export default function DiagramContextProvider({ children }) {
  const { t } = useTranslation();
  const [database, setDatabase] = useState(DB.GENERIC);
  const [tables, setTables] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const { transform } = useTransform();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { selectedElement, setSelectedElement } = useSelect();

  const addTable = (data, addToHistory = true) => {
    const id = nanoid();
    const newTable = {
      id,
      name: `table_${id}`,
      x: transform.pan.x,
      y: transform.pan.y,
      locked: false,
      fields: [
        {
          name: "id",
          type: database === DB.GENERIC ? "INT" : "INTEGER",
          default: "",
          check: "",
          primary: true,
          unique: true,
          notNull: true,
          increment: true,
          comment: "",
          id: nanoid(),
        },
      ],
      comment: "",
      indices: [],
      color: defaultBlue,
    };
    const tableToAdd = data ? data.table : newTable;
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
    emitOperation({ type: "add", target: "table", data: { table: tableToAdd } });
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
    emitOperation({ type: "delete", target: "table", targetId: id });
  };

  const updateTable = (id, updatedValues) => {
    setTables((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updatedValues } : t)),
    );
    emitOperation({ type: "edit", target: "table", targetId: id, data: updatedValues });
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
    emitOperation({ type: "edit-field", target: "table", targetId: tid, data: { fieldId: fid, ...updatedValues } });
  };

  const deleteField = (field, tid, addToHistory = true) => {
    const { fields, name } = tables.find((t) => t.id === tid);
    if (addToHistory) {
      const rels = relationships.reduce((acc, r) => {
        if (
          (r.startTableId === tid && r.startFieldId === field.id) ||
          (r.endTableId === tid && r.endFieldId === field.id)
        ) {
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
    setRelationships((prev) =>
      prev.filter(
        (e) =>
          !(
            (e.startTableId === tid && e.startFieldId === field.id) ||
            (e.endTableId === tid && e.endFieldId === field.id)
          ),
      ),
    );
    setTables((prev) =>
      prev.map((t) =>
        t.id === tid ? { ...t, fields: fields.filter((e) => e.id !== field.id) } : t,
      ),
    );
    emitOperation({ type: "delete-field", target: "table", targetId: tid, data: { fieldId: field.id } });
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
      emitOperation({ type: "add", target: "relationship", data: { relationship: data } });
    } else {
      setRelationships((prev) => {
        const temp = prev.slice();
        temp.splice(data.index, 0, data.relationship || data);
        return temp;
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
    emitOperation({ type: "delete", target: "relationship", targetId: id });
  };

  const updateRelationship = (id, updatedValues) => {
    setRelationships((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updatedValues } : t)),
    );
    emitOperation({ type: "edit", target: "relationship", targetId: id, data: updatedValues });
  };

  const autoArrangeAllTables = (addToHistory = true) => {
    if (tables.length === 0) {
      Toast.info(t("no_tables"));
      return;
    }

    // Calculate new positions
    const positions = calculateAutoArrangePositions(tables, relationships);
    const updates = generateTableUpdates(tables, positions);

    if (updates.length === 0) {
      Toast.info(t("no_changes"));
      return;
    }

    // Save original positions for undo
    const originalPositions = updates.reduce((acc, update) => {
      const table = tables.find((t) => t.id === update.id);
      acc[update.id] = { x: table.x, y: table.y };
      return acc;
    }, {});

    // Apply updates
    updates.forEach(({ id, updates: tableUpdates }) => {
      updateTable(id, tableUpdates);
    });

    // Add to undo history
    if (addToHistory) {
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.EDIT,
          element: ObjectType.TABLE,
          component: "auto_arrange",
          data: {
            updates,
            originalPositions,
          },
          message: t("arrange_tables"),
        },
      ]);
      setRedoStack([]);
      Toast.success(t("tables_arranged"));
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
        deleteTable,
        autoArrangeAllTables,
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
