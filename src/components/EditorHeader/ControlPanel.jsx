import { useContext, useState } from "react";
import {
  IconCaretdown,
  IconChevronRight,
  IconChevronLeft,
  IconChevronUp,
  IconChevronDown,
  IconSaveStroked,
  IconUndo,
  IconRedo,
  IconEdit,
  IconShareStroked,
} from "@douyinfe/semi-icons";
import { Link, useNavigate } from "react-router-dom";
import icon from "../../assets/icon_dark_64.png";
import {
  Button,
  Divider,
  Dropdown,
  InputNumber,
  Tooltip,
  Spin,
  Tag,
  Toast,
  Popconfirm,
} from "@douyinfe/semi-ui";
// html-to-image removed — we now use manual SVG serialization + Canvas
import {
  jsonToMySQL,
  jsonToPostgreSQL,
  jsonToSQLite,
  jsonToMariaDB,
  jsonToSQLServer,
  jsonToOracleSQL,
} from "../../utils/exportSQL/generic";
import {
  ObjectType,
  Action,
  Tab,
  State,
  MODAL,
  SIDESHEET,
  DB,
  IMPORT_FROM,
  Cardinality,
  noteWidth,
  pngExportPixelRatio,
  noteFold,
  noteRadius,
} from "../../data/constants";
import jsPDF from "jspdf";
import { useHotkeys } from "react-hotkeys-hook";
import { Validator } from "jsonschema";
import { areaSchema, noteSchema, tableSchema } from "../../data/schemas";
import { db } from "../../data/db";
import {
  useLayout,
  useSettings,
  useTransform,
  useDiagram,
  useUndoRedo,
  useSelect,
  useSaveState,
  useEnums,
  useTypes,
  useNotes,
  useAreas,
  useFullscreen,
  useCanvas,
} from "../../hooks";
import { enterFullscreen, exitFullscreen } from "../../utils/fullscreen";
import { dataURItoBlob } from "../../utils/utils";
import { IconAddArea, IconAddNote, IconAddTable } from "../../icons";
import LayoutDropdown from "./LayoutDropdown";
import Sidesheet from "./SideSheet/Sidesheet";
import Modal from "./Modal/Modal";
import { useTranslation } from "react-i18next";
import { exportSQL } from "../../utils/exportSQL";
import { databases } from "../../data/databases";
import { jsonToMermaid } from "../../utils/exportAs/mermaid";
import { isRtl } from "../../i18n/utils/rtl";
import { jsonToDocumentation } from "../../utils/exportAs/documentation";
import { IdContext } from "../../context/IdContext";
import { socials } from "../../data/socials";
import { toDBML } from "../../utils/exportAs/dbml";
import { exportSavedData } from "../../utils/exportSavedData";
import { nanoid } from "nanoid";
import { getTableHeight, getCommentHeight } from "../../utils/utils";
import { calcPath } from "../../utils/calcPath";
import { dbToTypes } from "../../data/datatypes";
import { deleteFromCache, STORAGE_KEY } from "../../utils/cache";
import { useLiveQuery } from "dexie-react-hooks";
import { DateTime } from "luxon";

// ─── Pure-SVG export helpers (module-level, no React / DOM dependency) ────────

/**
 * Maps Tailwind text-colour classes (as used in dbToTypes) to plain hex values
 * so the pure-SVG export renderer can colour type names without any CSS.
 */
const TAILWIND_HEX = {
  "text-orange-500":  "#f97316",
  "text-yellow-500":  "#eab308",
  "text-lime-500":    "#84cc16",
  "text-violet-500":  "#8b5cf6",
  "text-emerald-500": "#10b981",
  "text-sky-500":     "#0ea5e9",
  "text-indigo-500":  "#6366f1",
  "text-rose-500":    "#f43f5e",
  "text-fuchsia-500": "#d946ef",
  "text-slate-500":   "#64748b",
  "text-zinc-500":    "#71717a",
  "text-cyan-500":    "#06b6d4",
};

/**
 * Given a calcPath "d" string, returns the (cx, cy) coords where the
 * cardinality badge circles should be rendered.
 * Parses only M/L commands (A arcs are ignored – they don't change the
 * start/end segment direction).
 */
function _cardinalityPoints(d, offset = 28) {
  const moves = [...d.matchAll(/[ML]\s*([\d.eE+-]+)\s+([\d.eE+-]+)/g)].map(
    (m) => ({ x: parseFloat(m[1]), y: parseFloat(m[2]) }),
  );
  if (moves.length < 2) return null;
  const start    = moves[0];
  const firstNext = moves[1];
  const end      = moves[moves.length - 1];
  const prevEnd  = moves[moves.length - 2];
  // Start cardinality: offset px along first horizontal segment
  const startRight = firstNext.x >= start.x;
  const csX = startRight ? start.x + offset : start.x - offset;
  // End cardinality: offset px back along last horizontal segment
  const endFromLeft = prevEnd.x <= end.x;
  const ceX = endFromLeft ? end.x - offset : end.x + offset;
  return { csX, csY: start.y, ceX, ceY: end.y };
}

/** Escape characters that are special in XML/SVG attribute values and text. */
function _escapeXml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build a fully self-contained SVG string from raw diagram data.
 *
 * Every element is expressed as plain SVG primitives (rect, path, text).
 * There is NO <foreignObject> and NO external CSS, so:
 *   • the SVG can be loaded as <img src="data:…"> without any CSS blocking,
 *   • drawing it onto a canvas never triggers a SecurityError (no taint), and
 *   • the result looks correct in every browser / export format.
 */
function _buildExportSvg({
  tables, areas, notes, relationships, settings, bbox, database,
}) {
  const { tableWidth, mode, showComments, showDataTypes, showCardinality } = settings;
  const isDark = mode === "dark";

  // ── Tailwind-equivalent colour tokens ──────────────────────────────────────
  const tableBg        = isDark ? "#27272a" : "#f4f4f5"; // zinc-800 / zinc-100
  const tableHeaderBg  = isDark ? "#18181b" : "#e4e4e7"; // zinc-900 / zinc-200
  const tableBorderCol = isDark ? "#52525b" : "#d4d4d8"; // zinc-600 / zinc-300
  const tableTextCol   = isDark ? "#e4e4e7" : "#27272a"; // zinc-200 / zinc-800
  const headerDivider  = "#9ca3af";                       // gray-400
  const mutedTextCol   = isDark ? "#a1a1aa" : "#71717a"; // zinc-400 / zinc-500
  const fieldDivider   = "#9ca3af";                       // always gray-400 (border-gray-400 in Table.jsx)
  const canvasBg       = isDark ? "#16161a" : "#ffffff";
  const areaBorder     = "#94a3b8";                       // slate-400

  // ── Layout constants (must match Table.jsx / constants.js) ─────────────────
  const HEADER_H      = 50;  // tableHeaderHeight  = colorStrip(10) + title(40)
  const COLOR_STRIP_H = 10;  // h-[10px] in Table.jsx
  const TITLE_H       = 40;  // h-[40px] in Table.jsx
  const FIELD_H       = 36;  // tableFieldHeight
  const FONT          = "ui-sans-serif,system-ui,-apple-system,sans-serif";

  const parts = [];

  // ── Canvas background ───────────────────────────────────────────────────────
  parts.push(
    `<rect x="${bbox.left}" y="${bbox.top}" width="${bbox.width}" height="${bbox.height}" fill="${canvasBg}"/>`,
  );

  // ── Areas ───────────────────────────────────────────────────────────────────
  for (const a of areas) {
    const fill = `${a.color || "#94a3b8"}66`;
    parts.push(
      `<rect x="${a.x}" y="${a.y}" width="${Math.max(0, a.width)}" height="${Math.max(0, a.height)}"` +
      ` rx="4" fill="${fill}" stroke="${areaBorder}" stroke-width="2"/>`,
    );
    if (a.name) {
      parts.push(
        `<text x="${a.x + 8}" y="${a.y + 20}" font-family="${FONT}" font-size="14"` +
        ` fill="${tableTextCol}">${_escapeXml(a.name)}</text>`,
      );
    }
  }

  // ── Relationships ───────────────────────────────────────────────────────────
  const tableMap = new Map(tables.map((t) => [t.id, t]));
  for (const rel of relationships) {
    const startT = tableMap.get(rel.startTableId);
    const endT   = tableMap.get(rel.endTableId);
    if (!startT || !endT || startT.hidden || endT.hidden) continue;

    const startFi = startT.fields.findIndex((f) => f.id === rel.startFieldId);
    const endFi   = endT.fields.findIndex((f) => f.id === rel.endFieldId);
    if (startFi === -1 || endFi === -1) continue;

    const pathValues = {
      startFieldIndex: startFi,
      endFieldIndex:   endFi,
      startTable: { x: startT.x, y: startT.y, comment: startT.comment },
      endTable:   { x: endT.x,   y: endT.y,   comment: endT.comment },
    };

    const d = calcPath(pathValues, tableWidth, 1, showComments);
    if (!d) continue;

    parts.push(
      `<path d="${_escapeXml(d)}" fill="none"` +
      ` stroke="grey" stroke-width="2.5" stroke-linecap="butt"/>`,
    );

    // ── Cardinality badges (grey pill + white text, same as UI) ────────────
    if (showCardinality !== false) {
      let cardStart = "1";
      let cardEnd   = "1";
      switch (rel.cardinality) {
        case Cardinality.MANY_TO_ONE:
          cardStart = rel.manyLabel || "n";
          cardEnd   = "1";
          break;
        case Cardinality.ONE_TO_MANY:
          cardStart = "1";
          cardEnd   = rel.manyLabel || "n";
          break;
        default: // ONE_TO_ONE and unknown
          break;
      }

      const pts = _cardinalityPoints(d);
      if (pts) {
        const BADGE_H = 24; // r*2 where r=12
        const BADGE_R = 12;
        const renderBadge = (cx, cy, text) => {
          const halfW = Math.max(13, text.length * 6 + 7); // rough text-width estimate
          return (
            `<rect x="${(cx - halfW).toFixed(1)}" y="${(cy - BADGE_R).toFixed(1)}"` +
            ` width="${halfW * 2}" height="${BADGE_H}" rx="${BADGE_R}" ry="${BADGE_R}" fill="grey"/>` +
            `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" fill="white" font-size="14"` +
            ` text-anchor="middle" dominant-baseline="central">${_escapeXml(text)}</text>`
          );
        };
        parts.push(renderBadge(pts.csX, pts.csY, cardStart));
        parts.push(renderBadge(pts.ceX, pts.ceY, cardEnd));
      }
    }
  }

  // ── Tables ──────────────────────────────────────────────────────────────────
  for (const table of tables) {
    if (table.hidden) continue;

    const commentH = getCommentHeight(table.comment, tableWidth, showComments);
    const totalH   = getTableHeight(table, tableWidth, showComments);
    const tx = table.x;
    const ty = table.y;
    const tw = tableWidth;
    const color = table.color || "#5891db";

    parts.push(`<g>`);

    // background rect (rounded corners)
    parts.push(
      `<rect x="${tx}" y="${ty}" width="${tw}" height="${totalH}" rx="6"` +
      ` fill="${tableBg}" stroke="${tableBorderCol}" stroke-width="2"/>`,
    );

    // colour strip at the top (rx rounds all corners; main rect clips visually)
    parts.push(
      `<rect x="${tx}" y="${ty}" width="${tw}" height="${COLOR_STRIP_H}" rx="6"` +
      ` fill="${color}"/>`,
    );
    // square off the bottom corners of the strip so it blends into the header
    parts.push(
      `<rect x="${tx}" y="${ty + COLOR_STRIP_H / 2}" width="${tw}" height="${COLOR_STRIP_H / 2}"` +
      ` fill="${color}"/>`,
    );

    // header background
    parts.push(
      `<rect x="${tx}" y="${ty + COLOR_STRIP_H}" width="${tw}" height="${TITLE_H}"` +
      ` fill="${tableHeaderBg}"/>`,
    );

    // header bottom border
    parts.push(
      `<line x1="${tx}" y1="${ty + HEADER_H}" x2="${tx + tw}" y2="${ty + HEADER_H}"` +
      ` stroke="${headerDivider}" stroke-width="1"/>`,
    );

    // table name
    const nameY = ty + COLOR_STRIP_H + TITLE_H * 0.65;
    parts.push(
      `<text x="${tx + 12}" y="${nameY.toFixed(1)}" font-family="${FONT}" font-size="14"` +
      ` font-weight="bold" fill="${tableTextCol}">${_escapeXml(table.name)}</text>`,
    );

    // field rows
    const fieldsStartY = ty + HEADER_H + commentH;
    table.fields.forEach((field, i) => {
      const rowY  = fieldsStartY + i * FIELD_H;
      const midY  = (rowY + FIELD_H / 2).toFixed(1);
      const textY = (rowY + FIELD_H * 0.62).toFixed(1);

      // divider line above every row except the first
      // (equivalent to border-b border-gray-400 on all-but-last in Table.jsx)
      if (i > 0) {
        parts.push(
          `<line x1="${tx}" y1="${rowY}" x2="${tx + tw}" y2="${rowY}"` +
          ` stroke="${fieldDivider}" stroke-width="1"/>`,
        );
      }

      // blue bullet dot — matches w-[10px] h-[10px] bg-[#2f68adcc] rounded-full
      parts.push(`<circle cx="${tx + 10}" cy="${midY}" r="4.5" fill="#2f68ad" fill-opacity="0.8"/>`);

      // field name (shifted right to clear the dot)
      parts.push(
        `<text x="${tx + 22}" y="${textY}" font-family="${FONT}" font-size="13"` +
        ` fill="${tableTextCol}">${_escapeXml(field.name)}</text>`,
      );

      // right-side: [⚿?] [??] [TYPE(size)] — only when showDataTypes is on
      if (showDataTypes !== false) {
        const typeEntry    = dbToTypes[database]?.[field.type];
        const typeColorHex = TAILWIND_HEX[typeEntry?.color] ?? mutedTextCol;
        const isSized      = typeEntry?.isSized || typeEntry?.hasPrecision;
        const typeStr      = field.type +
          (isSized && field.size && field.size !== "" ? `(${field.size})` : "");

        let tspan = "";
        if (field.primary) {
          // small key indicator in amber/gold
          tspan += `<tspan fill="#ca8a04">⚿ </tspan>`;
        }
        if (!field.notNull) {
          tspan += `<tspan fill="${mutedTextCol}">? </tspan>`;
        }
        tspan += `<tspan fill="${typeColorHex}">${_escapeXml(typeStr)}</tspan>`;

        parts.push(
          `<text x="${(tx + tw - 10).toFixed(1)}" y="${textY}"` +
          ` font-family="monospace,${FONT}" font-size="11" text-anchor="end">${tspan}</text>`,
        );
      }
    });

    parts.push(`</g>`);
  }

  // ── Notes ───────────────────────────────────────────────────────────────────
  for (const note of notes) {
    const w  = note.width  ?? noteWidth;
    const h  = note.height ?? 100;
    const nx = note.x;
    const ny = note.y;
    const nc = note.color || "#fcf7ac";
    const ns = "rgb(168,162,158)";
    const FOLD = noteFold;
    const NR   = noteRadius;

    const mainD =
      `M${nx + FOLD} ${ny}` +
      ` L${nx + w - NR} ${ny} A${NR} ${NR} 0 0 1 ${nx + w} ${ny + NR}` +
      ` L${nx + w} ${ny + h - NR} A${NR} ${NR} 0 0 1 ${nx + w - NR} ${ny + h}` +
      ` L${nx + NR} ${ny + h} A${NR} ${NR} 0 0 1 ${nx} ${ny + h - NR}` +
      ` L${nx} ${ny + FOLD}`;

    const foldD =
      `M${nx} ${ny + FOLD}` +
      ` L${nx + FOLD - NR} ${ny + FOLD}` +
      ` A${NR} ${NR} 0 0 0 ${nx + FOLD} ${ny + FOLD - NR}` +
      ` L${nx + FOLD} ${ny} L${nx} ${ny + FOLD} Z`;

    parts.push(
      `<path d="${mainD}" fill="${nc}" stroke="${ns}" stroke-width="2"/>`,
      `<path d="${foldD}" fill="${nc}" stroke="${ns}" stroke-width="2"/>`,
    );

    if (note.title) {
      parts.push(
        `<text x="${nx + FOLD + 4}" y="${ny + 16}" font-family="${FONT}" font-size="13"` +
        ` font-weight="600" fill="#111827">${_escapeXml(note.title)}</text>`,
      );
    }

    if (note.content) {
      const contentY = ny + (note.title ? 36 : 20);
      const tspans = String(note.content)
        .split("\n")
        .map((ln, i) =>
          i === 0
            ? `<tspan x="${nx + 12}" dy="0">${_escapeXml(ln)}</tspan>`
            : `<tspan x="${nx + 12}" dy="18">${_escapeXml(ln)}</tspan>`,
        )
        .join("");
      parts.push(
        `<text x="${nx + 12}" y="${contentY}" font-family="${FONT}" font-size="13"` +
        ` fill="#1f2937">${tspans}</text>`,
      );
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `  viewBox="${bbox.left} ${bbox.top} ${bbox.width} ${bbox.height}"`,
    `  width="${bbox.width}" height="${bbox.height}">`,
    parts.join("\n"),
    `</svg>`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ControlPanel({
  diagramId,
  setDiagramId,
  title,
  setTitle,
  lastSaved,
}) {

      // --- Export full diagram as image (PNG, JPEG, SVG) ---
      function getDiagramBoundingBox() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        const all = [
          ...tables.map((t) => ({
            x: t.x ?? 0,
            y: t.y ?? 0,
            w: settings.tableWidth ?? 100,
            h: getTableHeight(t, settings.tableWidth, settings.showComments) ?? 50,
          })),
          ...areas.map((a) => ({ x: a.x ?? 0, y: a.y ?? 0, w: a.width ?? 100, h: a.height ?? 100 })),
          ...notes.map((n) => ({ x: n.x ?? 0, y: n.y ?? 0, w: n.width ?? noteWidth, h: n.height ?? 50 })),
        ];

        if (all.length > 0) {
          all.forEach(({ x, y, w, h }) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
          });
        } else {
          minX = 0; minY = 0; maxX = 1920; maxY = 1080;
        }

        if (!isFinite(minX) || !isFinite(maxX) || minX >= maxX || minY >= maxY) {
          return { left: 0, top: 0, width: 1920, height: 1080 };
        }

        const pad = 40;
        return {
          left:   Math.floor(minX - pad),
          top:    Math.floor(minY - pad),
          width:  Math.ceil(maxX - minX + 2 * pad),
          height: Math.ceil(maxY - minY + 2 * pad),
        };
      }

      function exportFullDiagram(type) {
        if (tables.length === 0 && areas.length === 0 && notes.length === 0) {
          Toast.error("No diagram content to export");
          return;
        }

        const bbox = getDiagramBoundingBox();

        // Build a pure-SVG string from data — no DOM cloning, no foreignObject,
        // no CSS-inlining required. Works in all browsers without canvas taint.
        const svgString = _buildExportSvg({
          tables, areas, notes, relationships, settings, bbox, database,
        });

        if (type === "svg") {
          const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
          const reader = new FileReader();
          reader.onload = () => {
            setExportData((prev) => ({ ...prev, data: reader.result, extension: "svg" }));
            setModal(MODAL.IMG);
          };
          reader.onerror = () => Toast.error("Export failed");
          reader.readAsDataURL(blob);
          return;
        }
        // Open the modal immediately; the spinner renders while we do the
        // (async) canvas conversion.  We use canvas.toBlob() → blob URL rather
        // than toDataURL() because toDataURL() can produce a multi-MB string
        // that some browsers refuse to use as <img src>.
        setExportData((prev) => ({ ...prev, data: null, extension: type }));
        setModal(MODAL.IMG);

        // Give React one tick to commit the "spinner" state before the
        // synchronous SVG-encoding / canvas work starts.
        setTimeout(() => {
          try {
            const svgDataUrl =
              "data:image/svg+xml;charset=utf-8," +
              encodeURIComponent(svgString);

            const pixelRatio = type === "png" ? pngExportPixelRatio : 1;

            // Cap canvas dimensions so we never exceed Chrome's 8 192 px limit.
            const MAX_DIM = 8192;
            const rawW = Math.round(bbox.width  * pixelRatio);
            const rawH = Math.round(bbox.height * pixelRatio);
            const dimScale = Math.min(1, MAX_DIM / Math.max(rawW, rawH, 1));
            const canvasEl = document.createElement("canvas");
            canvasEl.width  = Math.round(rawW * dimScale);
            canvasEl.height = Math.round(rawH * dimScale);

            const ctx = canvasEl.getContext("2d");
            if (!ctx) {
              Toast.error("Canvas unavailable — diagram may be too large");
              setModal(MODAL.NONE);
              return;
            }

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);

            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
              const mime = type === "jpeg" ? "image/jpeg" : "image/png";
              canvasEl.toBlob(
                (blob) => {
                  if (!blob) {
                    Toast.error("Export failed: image encoding returned empty");
                    setModal(MODAL.NONE);
                    return;
                  }
                  // Blob URL has no size constraints — safe for any diagram.
                  const blobUrl = URL.createObjectURL(blob);
                  setExportData((prev) => ({ ...prev, data: blobUrl }));
                },
                mime,
                type === "jpeg" ? 0.95 : undefined,
              );
            };
            img.onerror = () => {
              Toast.error("Export failed: SVG could not be rendered");
              setModal(MODAL.NONE);
            };
            img.src = svgDataUrl;
          } catch (e) {
            console.error("Export error:", e);
            Toast.error("Export failed: " + (e?.message ?? "unknown error"));
            setModal(MODAL.NONE);
          }
        }, 50);
      }

  // --- State for export data ---
  const [exportData, setExportData] = useState({
    data: null,
    filename: `${title}_${new Date().toISOString()}`,
    extension: "",
  });
  const [modal, setModal] = useState(MODAL.NONE);
  const [showEditName, setShowEditName] = useState(false);
  const [sidesheet, setSidesheet] = useState(SIDESHEET.NONE);
  const [importFrom, setImportFrom] = useState(IMPORT_FROM.JSON);
  const [importDb, setImportDb] = useState(DB.GENERIC);
  const { saveState, setSaveState } = useSaveState();
  const { setIsExporting } = useCanvas();
  const { layout, setLayout } = useLayout();
  const { settings, setSettings } = useSettings();
  const {
    relationships,
    tables,
    setTables,
    addTable,
    updateTable,
    deleteField,
    deleteTable,
    updateField,
    setRelationships,
    addRelationship,
    deleteRelationship,
    updateRelationship,
    database,
    setDatabase,
    autoArrangeAllTables,
  } = useDiagram();
  const { enums, setEnums, deleteEnum, addEnum, updateEnum } = useEnums();
  const { types, addType, deleteType, updateType, setTypes } = useTypes();
  const { notes, setNotes, updateNote, addNote, deleteNote } = useNotes();
  const { areas, setAreas, updateArea, addArea, deleteArea } = useAreas();
  const { undoStack, redoStack, setUndoStack, setRedoStack } = useUndoRedo();
  const { selectedElement, setSelectedElement, bulkSelectedElements, setBulkSelectedElements } = useSelect();
  const { transform, setTransform } = useTransform();
  const { t, i18n } = useTranslation();
  const { version, gistId, setGistId, syncToServer, createManualSnapshot, manualSave } = useContext(IdContext);
  const navigate = useNavigate();

  const invertLayout = (component) =>
    setLayout((prev) => ({ ...prev, [component]: !prev[component] }));

  const undo = () => {
    if (undoStack.length === 0) return;
    const a = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.filter((_, i) => i !== prev.length - 1));

    if (a.bulk) {
      for (const element of a.elements) {
        if (element.type === ObjectType.TABLE) {
          updateTable(element.id, element.undo);
        } else if (element.type === ObjectType.AREA) {
          updateArea(element.id, element.undo);
        } else if (element.type === ObjectType.NOTE) {
          updateNote(element.id, element.undo);
        }
      }
      setRedoStack((prev) => [...prev, a]);
      return;
    }

    if (a.action === Action.ADD) {
      if (a.element === ObjectType.TABLE) {
        deleteTable(a.data.table.id, false);
      } else if (a.element === ObjectType.AREA) {
        deleteArea(areas[areas.length - 1].id, false);
      } else if (a.element === ObjectType.NOTE) {
        deleteNote(notes[notes.length - 1].id, false);
      } else if (a.element === ObjectType.RELATIONSHIP) {
        deleteRelationship(a.data.relationship.id, false);
      } else if (a.element === ObjectType.TYPE) {
        deleteType(a.data.type.id, false);
      } else if (a.element === ObjectType.ENUM) {
        deleteEnum(a.data.enum.id, false);
      }
      setRedoStack((prev) => [...prev, a]);
    } else if (a.action === Action.MOVE) {
      if (a.element === ObjectType.TABLE) {
        const { x, y } = tables.find((t) => t.id === a.id);
        setRedoStack((prev) => [...prev, { ...a, x, y }]);
        updateTable(a.id, { x: a.x, y: a.y });
      } else if (a.element === ObjectType.AREA) {
        setRedoStack((prev) => [
          ...prev,
          { ...a, x: areas[a.id].x, y: areas[a.id].y },
        ]);
        updateArea(a.id, { x: a.x, y: a.y });
      } else if (a.element === ObjectType.NOTE) {
        setRedoStack((prev) => [
          ...prev,
          { ...a, x: notes[a.id].x, y: notes[a.id].y },
        ]);
        updateNote(a.id, { x: a.x, y: a.y });
      }
    } else if (a.action === Action.DELETE) {
      if (a.element === ObjectType.TABLE) {
        a.data.relationship.forEach((x) => addRelationship(x, false));
        addTable(a.data, false);
      } else if (a.element === ObjectType.RELATIONSHIP) {
        addRelationship(a.data, false);
      } else if (a.element === ObjectType.NOTE) {
        addNote(a.data, false);
      } else if (a.element === ObjectType.AREA) {
        addArea(a.data, false);
      } else if (a.element === ObjectType.TYPE) {
        addType(a.data, false);
      } else if (a.element === ObjectType.ENUM) {
        addEnum(a.data, false);
      }
      setRedoStack((prev) => [...prev, a]);
    } else if (a.action === Action.EDIT) {
      if (a.element === ObjectType.AREA) {
        updateArea(a.aid, a.undo);
      } else if (a.element === ObjectType.NOTE) {
        updateNote(a.nid, a.undo);
      } else if (a.element === ObjectType.TABLE) {
        const table = tables.find((t) => t.id === a.tid);
        if (a.component === "field") {
          updateField(a.tid, a.fid, a.undo);
        } else if (a.component === "field_delete") {
          setRelationships((prev) => {
            let temp = [...prev];
            a.data.relationship.forEach((r) => {
              temp.splice(r.id, 0, r);
            });
            return temp;
          });
          const updatedFields = table.fields.slice();
          updatedFields.splice(a.data.index, 0, a.data.field);
          updateTable(a.tid, { fields: updatedFields });
        } else if (a.component === "field_add") {
          updateTable(a.tid, {
            fields: table.fields.filter((e) => e.id !== a.fid),
          });
        } else if (a.component === "index_add") {
          updateTable(a.tid, {
            indices: table.indices
              .filter((e) => e.id !== table.indices.length - 1)
              .map((t, i) => ({ ...t, id: i })),
          });
        } else if (a.component === "index") {
          updateTable(a.tid, {
            indices: table.indices.map((index) =>
              index.id === a.iid
                ? {
                    ...index,
                    ...a.undo,
                  }
                : index,
            ),
          });
        } else if (a.component === "index_delete") {
          const updatedIndices = table.indices.slice();
          updatedIndices.splice(a.data.id, 0, a.data);
          updateTable(a.tid, {
            indices: updatedIndices.map((t, i) => ({ ...t, id: i })),
          });
        } else if (a.component === "self") {
          updateTable(a.tid, a.undo);
        }
      } else if (a.element === ObjectType.RELATIONSHIP) {
        updateRelationship(a.rid, a.undo);
      } else if (a.element === ObjectType.TYPE) {
        if (a.component === "field_add") {
          const type = types.find((t, i) =>
            typeof a.tid === "number" ? i === a.tid : t.id === a.tid,
          );
          updateType(a.tid, {
            fields: type.fields.filter((f, i) =>
              f.id ? f.id !== a.data.field.id : i !== type.fields.length - 1,
            ),
          });
        }
        if (a.component === "field") {
          updateType(a.tid, {
            fields: types[a.tid].fields.map((e, i) =>
              i === a.fid ? { ...e, ...a.undo } : e,
            ),
          });
        } else if (a.component === "field_delete") {
          setTypes((prev) =>
            prev.map((t, i) => {
              if (i === a.tid) {
                const temp = t.fields.slice();
                temp.splice(a.fid, 0, a.data);
                return { ...t, fields: temp };
              }
              return t;
            }),
          );
        } else if (a.component === "self") {
          updateType(a.tid, a.undo);
          if (a.updatedFields) {
            if (a.undo.name) {
              a.updatedFields.forEach((x) =>
                updateField(x.tid, x.fid, { type: a.undo.name.toUpperCase() }),
              );
            }
          }
        }
      } else if (a.element === ObjectType.ENUM) {
        updateEnum(a.id, a.undo);
        if (a.updatedFields) {
          if (a.undo.name) {
            a.updatedFields.forEach((x) =>
              updateField(x.tid, x.fid, { type: a.undo.name.toUpperCase() }),
            );
          }
        }
      }
      setRedoStack((prev) => [...prev, a]);
    }
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const a = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.filter((e, i) => i !== prev.length - 1));

    if (a.bulk) {
      for (const element of a.elements) {
        if (element.type === ObjectType.TABLE) {
          updateTable(element.id, element.redo);
        } else if (element.type === ObjectType.AREA) {
          updateArea(element.id, element.redo);
        } else if (element.type === ObjectType.NOTE) {
          updateNote(element.id, element.redo);
        }
      }
      setUndoStack((prev) => [...prev, a]);
      return;
    }

    if (a.action === Action.ADD) {
      if (a.element === ObjectType.TABLE) {
        addTable(a.data, false);
      } else if (a.element === ObjectType.AREA) {
        addArea(null, false);
      } else if (a.element === ObjectType.NOTE) {
        addNote(null, false);
      } else if (a.element === ObjectType.RELATIONSHIP) {
        addRelationship(a.data, false);
      } else if (a.element === ObjectType.TYPE) {
        addType(a.data, false);
      } else if (a.element === ObjectType.ENUM) {
        addEnum(a.data, false);
      }
      setUndoStack((prev) => [...prev, a]);
    } else if (a.action === Action.MOVE) {
      if (a.element === ObjectType.TABLE) {
        const { x, y } = tables.find((t) => t.id == a.id);
        setUndoStack((prev) => [...prev, { ...a, x, y }]);
        updateTable(a.id, { x: a.x, y: a.y });
      } else if (a.element === ObjectType.AREA) {
        setUndoStack((prev) => [
          ...prev,
          { ...a, x: areas[a.id].x, y: areas[a.id].y },
        ]);
        updateArea(a.id, { x: a.x, y: a.y });
      } else if (a.element === ObjectType.NOTE) {
        setUndoStack((prev) => [
          ...prev,
          { ...a, x: notes[a.id].x, y: notes[a.id].y },
        ]);
        updateNote(a.id, { x: a.x, y: a.y });
      }
    } else if (a.action === Action.DELETE) {
      if (a.element === ObjectType.TABLE) {
        deleteTable(a.data.table.id, false);
      } else if (a.element === ObjectType.RELATIONSHIP) {
        deleteRelationship(a.data.relationship.id, false);
      } else if (a.element === ObjectType.NOTE) {
        deleteNote(a.data.id, false);
      } else if (a.element === ObjectType.AREA) {
        deleteArea(a.data.id, false);
      } else if (a.element === ObjectType.TYPE) {
        deleteType(a.data.type.id, false);
      } else if (a.element === ObjectType.ENUM) {
        deleteEnum(a.data.enum.id, false);
      }
      setUndoStack((prev) => [...prev, a]);
    } else if (a.action === Action.EDIT) {
      if (a.element === ObjectType.AREA) {
        updateArea(a.aid, a.redo);
      } else if (a.element === ObjectType.NOTE) {
        updateNote(a.nid, a.redo);
      } else if (a.element === ObjectType.TABLE) {
        const table = tables.find((t) => t.id === a.tid);
        if (a.component === "field") {
          updateField(a.tid, a.fid, a.redo);
        } else if (a.component === "field_delete") {
          deleteField(a.data.field, a.tid, false);
        } else if (a.component === "field_add") {
          updateTable(a.tid, {
            fields: [
              ...table.fields,
              {
                name: "",
                type: "",
                default: "",
                check: "",
                primary: false,
                unique: false,
                notNull: false,
                increment: false,
                comment: "",
                id: nanoid(),
              },
            ],
          });
        } else if (a.component === "index_add") {
          updateTable(a.tid, {
            indices: [
              ...table.indices,
              {
                id: table.indices.length,
                name: `index_${table.indices.length}`,
                fields: [],
              },
            ],
          });
        } else if (a.component === "index") {
          updateTable(a.tid, {
            indices: table.indices.map((index) =>
              index.id === a.iid
                ? {
                    ...index,
                    ...a.redo,
                  }
                : index,
            ),
          });
        } else if (a.component === "index_delete") {
          updateTable(a.tid, {
            indices: table.indices
              .filter((e) => e.id !== a.data.id)
              .map((t, i) => ({ ...t, id: i })),
          });
        } else if (a.component === "self") {
          updateTable(a.tid, a.redo, false);
        }
      } else if (a.element === ObjectType.RELATIONSHIP) {
        updateRelationship(a.rid, a.redo);
      } else if (a.element === ObjectType.TYPE) {
        if (a.component === "field_add") {
          const type = types.find((t, i) =>
            typeof a.tid === "number" ? i === a.tid : t.id === a.tid,
          );
          updateType(a.tid, {
            fields: [...type.fields, a.data.field],
          });
        } else if (a.component === "field") {
          updateType(a.tid, {
            fields: types[a.tid].fields.map((e, i) =>
              i === a.fid ? { ...e, ...a.redo } : e,
            ),
          });
        } else if (a.component === "field_delete") {
          updateType(a.tid, {
            fields: types[a.tid].fields.filter((field, i) => i !== a.fid),
          });
        } else if (a.component === "self") {
          updateType(a.tid, a.redo);
          if (a.updatedFields) {
            if (a.redo.name) {
              a.updatedFields.forEach((x) =>
                updateField(x.tid, x.fid, { type: a.redo.name.toUpperCase() }),
              );
            }
          }
        }
      } else if (a.element === ObjectType.ENUM) {
        updateEnum(a.id, a.redo);
        if (a.updatedFields) {
          if (a.redo.name) {
            a.updatedFields.forEach((x) =>
              updateField(x.tid, x.fid, { type: a.redo.name.toUpperCase() }),
            );
          }
        }
      }
      setUndoStack((prev) => [...prev, a]);
    }
  };

  const fileImport = () => setModal(MODAL.IMPORT);
  const viewGrid = () =>
    setSettings((prev) => ({ ...prev, showGrid: !prev.showGrid }));
  const snapToGrid = () =>
    setSettings((prev) => ({ ...prev, snapToGrid: !prev.snapToGrid }));
  const zoomIn = () =>
    setTransform((prev) => ({ ...prev, zoom: prev.zoom * 1.2 }));
  const zoomOut = () =>
    setTransform((prev) => ({ ...prev, zoom: prev.zoom / 1.2 }));
  const viewStrictMode = () => {
    setSettings((prev) => ({ ...prev, strictMode: !prev.strictMode }));
  };
  const viewFieldSummary = () => {
    setSettings((prev) => ({
      ...prev,
      showFieldSummary: !prev.showFieldSummary,
    }));
  };
  const copyAsImage = () => {
    toPng(document.getElementById("canvas"), {
      pixelRatio: pngExportPixelRatio,
    }).then(function (dataUrl) {
      const blob = dataURItoBlob(dataUrl);
      navigator.clipboard
        .write([new ClipboardItem({ "image/png": blob })])
        .then(() => {
          Toast.success(t("copied_to_clipboard"));
        })
        .catch(() => {
          Toast.error(t("oops_smth_went_wrong"));
        });
    });
  };
  const resetView = () =>
    setTransform((prev) => ({ ...prev, zoom: 1, pan: { x: 0, y: 0 } }));
  const fitWindow = () => {
    const canvas = document.getElementById("canvas").getBoundingClientRect();

    const minMaxXY = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };

    tables.forEach((table) => {
      minMaxXY.minX = Math.min(minMaxXY.minX, table.x);
      minMaxXY.minY = Math.min(minMaxXY.minY, table.y);
      minMaxXY.maxX = Math.max(minMaxXY.maxX, table.x + settings.tableWidth);
      minMaxXY.maxY = Math.max(minMaxXY.maxY, table.y + getTableHeight(table, settings.tableWidth, settings.showComments));
    });

    areas.forEach((area) => {
      minMaxXY.minX = Math.min(minMaxXY.minX, area.x);
      minMaxXY.minY = Math.min(minMaxXY.minY, area.y);
      minMaxXY.maxX = Math.max(minMaxXY.maxX, area.x + area.width);
      minMaxXY.maxY = Math.max(minMaxXY.maxY, area.y + area.height);
    });

    notes.forEach((note) => {
      minMaxXY.minX = Math.min(minMaxXY.minX, note.x);
      minMaxXY.minY = Math.min(minMaxXY.minY, note.y);
      minMaxXY.maxX = Math.max(
        minMaxXY.maxX,
        note.x + (note.width ?? noteWidth),
      );
      minMaxXY.maxY = Math.max(minMaxXY.maxY, note.y + note.height);
    });

    const padding = 10;
    const width = minMaxXY.maxX - minMaxXY.minX + padding;
    const height = minMaxXY.maxY - minMaxXY.minY + padding;

    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    // Making sure the scale is a multiple of 0.05
    const scale = Math.floor(Math.min(scaleX, scaleY) * 20) / 20;

    const centerX = (minMaxXY.minX + minMaxXY.maxX) / 2;
    const centerY = (minMaxXY.minY + minMaxXY.maxY) / 2;

    setTransform((prev) => ({
      ...prev,
      zoom: scale,
      pan: { x: centerX, y: centerY },
    }));
  };
  const edit = () => {
    if (selectedElement.element === ObjectType.TABLE) {
      if (!layout.sidebar) {
        setSelectedElement((prev) => ({
          ...prev,
          open: true,
        }));
      } else {
        setSelectedElement((prev) => ({
          ...prev,
          open: true,
          currentTab: Tab.TABLES,
        }));
        if (selectedElement.currentTab !== Tab.TABLES) return;
        document
          .getElementById(`scroll_table_${selectedElement.id}`)
          .scrollIntoView({ behavior: "smooth" });
      }
    } else if (selectedElement.element === ObjectType.AREA) {
      if (layout.sidebar) {
        setSelectedElement((prev) => ({
          ...prev,
          currentTab: Tab.AREAS,
        }));
        if (selectedElement.currentTab !== Tab.AREAS) return;
        document
          .getElementById(`scroll_area_${selectedElement.id}`)
          .scrollIntoView({ behavior: "smooth" });
      } else {
        setSelectedElement((prev) => ({
          ...prev,
          open: true,
          editFromToolbar: true,
        }));
      }
    } else if (selectedElement.element === ObjectType.NOTE) {
      if (layout.sidebar) {
        setSelectedElement((prev) => ({
          ...prev,
          currentTab: Tab.NOTES,
          open: false,
        }));
        if (selectedElement.currentTab !== Tab.NOTES) return;
        document
          .getElementById(`scroll_note_${selectedElement.id}`)
          .scrollIntoView({ behavior: "smooth" });
      } else {
        setSelectedElement((prev) => ({
          ...prev,
          open: true,
          editFromToolbar: true,
        }));
      }
    }
  };
  const del = () => {
    if (layout.readOnly) {
      return;
    }
    if (bulkSelectedElements.length > 1) {
      bulkSelectedElements.forEach((el) => {
        if (el.type === ObjectType.TABLE) deleteTable(el.id, true);
        else if (el.type === ObjectType.NOTE) deleteNote(el.id, true);
        else if (el.type === ObjectType.AREA) deleteArea(el.id, true);
      });
      setBulkSelectedElements([]);
      return;
    }
    switch (selectedElement.element) {
      case ObjectType.TABLE:
        deleteTable(selectedElement.id);
        break;
      case ObjectType.NOTE:
        deleteNote(selectedElement.id);
        break;
      case ObjectType.AREA:
        deleteArea(selectedElement.id);
        break;
      default:
        break;
    }
  };
  const duplicate = () => {
    if (layout.readOnly) {
      return;
    }
    switch (selectedElement.element) {
      case ObjectType.TABLE: {
        const copiedTable = tables.find((t) => t.id === selectedElement.id);
        addTable({
          table: {
            ...copiedTable,
            x: copiedTable.x + 20,
            y: copiedTable.y + 20,
            id: nanoid(),
          },
        });
        break;
      }
      case ObjectType.NOTE:
        addNote({
          ...notes[selectedElement.id],
          x: notes[selectedElement.id].x + 20,
          y: notes[selectedElement.id].y + 20,
          id: notes.length,
        });
        break;
      case ObjectType.AREA:
        addArea({
          ...areas[selectedElement.id],
          x: areas[selectedElement.id].x + 20,
          y: areas[selectedElement.id].y + 20,
          id: areas.length,
        });
        break;
      default:
        break;
    }
  };
  const copy = () => {
    // Multi-select: copy all bulk selected elements + relationships between selected tables
    if (bulkSelectedElements.length > 1) {
      const selectedTableIds = new Set(
        bulkSelectedElements
          .filter((el) => el.type === ObjectType.TABLE)
          .map((el) => el.id),
      );
      const items = bulkSelectedElements
        .map((el) => {
          if (el.type === ObjectType.TABLE) {
            const table = tables.find((t) => t.id === el.id);
            return table ? { _type: ObjectType.TABLE, ...table } : null;
          } else if (el.type === ObjectType.NOTE) {
            const note = notes.find((n) => n.id === el.id);
            return note ? { _type: ObjectType.NOTE, ...note } : null;
          } else if (el.type === ObjectType.AREA) {
            const area = areas.find((a) => a.id === el.id);
            return area ? { _type: ObjectType.AREA, ...area } : null;
          }
          return null;
        })
        .filter(Boolean);
      // Include relationships where BOTH endpoints are within the selection
      const selectedRelationships = relationships.filter(
        (r) =>
          selectedTableIds.has(r.startTableId) &&
          selectedTableIds.has(r.endTableId),
      );
      navigator.clipboard
        .writeText(
          JSON.stringify({ _bulk: true, items, relationships: selectedRelationships }),
        )
        .catch(() => Toast.error(t("oops_smth_went_wrong")));
      return;
    }
    // Single element copy
    switch (selectedElement.element) {
      case ObjectType.TABLE:
        navigator.clipboard
          .writeText(
            JSON.stringify(tables.find((t) => t.id === selectedElement.id)),
          )
          .catch(() => Toast.error(t("oops_smth_went_wrong")));
        break;
      case ObjectType.NOTE:
        navigator.clipboard
          .writeText(JSON.stringify({ ...notes.find((n) => n.id === selectedElement.id) }))
          .catch(() => Toast.error(t("oops_smth_went_wrong")));
        break;
      case ObjectType.AREA:
        navigator.clipboard
          .writeText(JSON.stringify({ ...areas.find((a) => a.id === selectedElement.id) }))
          .catch(() => Toast.error(t("oops_smth_went_wrong")));
        break;
      default:
        break;
    }
  };
  const paste = () => {
    if (layout.readOnly) {
      return;
    }
    navigator.clipboard.readText().then((text) => {
      let obj = null;
      try {
        obj = JSON.parse(text);
      } catch (error) {
        return;
      }
      // Bulk paste: array of mixed elements
      if (obj._bulk && Array.isArray(obj.items)) {
        let noteOffset = notes.length;
        let areaOffset = areas.length;
        // Map old table id → new table id for relationship remapping
        const tableIdMap = {};
        // Track all newly created element ids for post-paste selection
        const newlyPasted = [];
        obj.items.forEach((item) => {
          const { _type, ...data } = item;
          if (_type === ObjectType.TABLE) {
            const newId = nanoid();
            tableIdMap[data.id] = newId;
            addTable({
              table: { ...data, x: data.x + 20, y: data.y + 20, id: newId },
            });
            newlyPasted.push({ id: newId, type: ObjectType.TABLE, currentCoords: { x: data.x + 20, y: data.y + 20 }, initialCoords: { x: data.x + 20, y: data.y + 20 } });
          } else if (_type === ObjectType.NOTE) {
            const newId = noteOffset++;
            addNote({ ...data, x: data.x + 20, y: data.y + 20, id: newId });
            newlyPasted.push({ id: newId, type: ObjectType.NOTE, currentCoords: { x: data.x + 20, y: data.y + 20 }, initialCoords: { x: data.x + 20, y: data.y + 20 } });
          } else if (_type === ObjectType.AREA) {
            const newId = areaOffset++;
            addArea({ ...data, x: data.x + 20, y: data.y + 20, id: newId });
            newlyPasted.push({ id: newId, type: ObjectType.AREA, currentCoords: { x: data.x + 20, y: data.y + 20 }, initialCoords: { x: data.x + 20, y: data.y + 20 } });
          }
        });
        // Re-create relationships with remapped table ids
        if (Array.isArray(obj.relationships)) {
          obj.relationships.forEach((r) => {
            const newStartTableId = tableIdMap[r.startTableId];
            const newEndTableId = tableIdMap[r.endTableId];
            if (newStartTableId && newEndTableId) {
              addRelationship({
                ...r,
                id: nanoid(),
                startTableId: newStartTableId,
                endTableId: newEndTableId,
              });
            }
          });
        }
        // Auto-select all pasted elements so user can drag them immediately
        if (newlyPasted.length > 0) {
          setSelectedElement((prev) => ({ ...prev, element: ObjectType.NONE, id: -1, open: false }));
          setBulkSelectedElements(newlyPasted);
        }
        return;
      }
      // Single element paste
      const v = new Validator();
      if (v.validate(obj, tableSchema).valid) {
        const newId = nanoid();
        addTable({
          table: {
            ...obj,
            x: obj.x + 20,
            y: obj.y + 20,
            id: newId,
          },
        });
        setSelectedElement((prev) => ({ ...prev, element: ObjectType.TABLE, id: newId, open: false }));
        setBulkSelectedElements([]);
      } else if (v.validate(obj, areaSchema).valid) {
        const newId = areas.length;
        addArea({
          ...obj,
          x: obj.x + 20,
          y: obj.y + 20,
          id: newId,
        });
        setSelectedElement((prev) => ({ ...prev, element: ObjectType.AREA, id: newId, open: false }));
        setBulkSelectedElements([]);
      } else if (v.validate(obj, noteSchema)) {
        const newId = notes.length;
        addNote({
          ...obj,
          x: obj.x + 20,
          y: obj.y + 20,
          id: newId,
        });
        setSelectedElement((prev) => ({ ...prev, element: ObjectType.NOTE, id: newId, open: false }));
        setBulkSelectedElements([]);
      }
    });
  };
  const cut = () => {
    if (layout.readOnly) {
      return;
    }
    copy();
    del();
  };
  const toggleDBMLEditor = () => {
    setLayout((prev) => ({ ...prev, dbmlEditor: !prev.dbmlEditor }));
  };
  const save = () => {
    // Sử dụng manualSave để save ngay lập tức khi user bấm save button
    if (manualSave) {
      manualSave();
    } else {
      // Fallback cho trường hợp chưa có manualSave
      setSaveState(State.SAVING);
    }
    // Sync server khi manual save (save button hoặc Ctrl+S)
    syncToServer();
  };
  const recentlyOpenedDiagrams = useLiveQuery(() =>
    db.diagrams.orderBy("lastModified").reverse().limit(10).toArray(),
  );

  const open = () => setModal(MODAL.OPEN);
  const saveDiagramAs = () => setModal(MODAL.SAVEAS);
  const fullscreen = useFullscreen();
  const loadDiagram = async (id) => {
    await db.diagrams
      .get(id)
      .then((diagram) => {
        if (diagram) {
          if (diagram.database) {
            setDatabase(diagram.database);
          } else {
            setDatabase(DB.GENERIC);
          }
          setDiagramId(diagram.id);
          setTitle(diagram.name);
          setTables(diagram.tables);
          setRelationships(diagram.references);
          setAreas(diagram.areas);
          setGistId(diagram.gistId ?? "");
          setNotes(diagram.notes);
          setTransform({
            pan: diagram.pan,
            zoom: diagram.zoom,
          });
          setUndoStack([]);
          setRedoStack([]);
          if (databases[diagram.database].hasTypes) {
            setTypes(
              diagram.types.map((t) =>
                t.id
                  ? t
                  : {
                      ...t,
                      id: nanoid(),
                      fields: t.fields.map((f) =>
                        f.id ? f : { ...f, id: nanoid() },
                      ),
                    },
              ),
            );
          }
          if (databases[diagram.database].hasEnums) {
            setEnums(
              diagram.enums.map((e) => (!e.id ? { ...e, id: nanoid() } : e)) ??
                [],
            );
          }
          window.name = `d ${diagram.id}`;
        } else {
          window.name = "";
          Toast.error(t("didnt_find_diagram"));
        }
      })
      .catch((error) => {
        console.log(error);
        Toast.error(t("didnt_find_diagram"));
      });
  };
  const menu = {
    file: {
      new: {
        function: () => setModal(MODAL.NEW),
      },
      new_window: {
        function: () => {
          const newWindow = window.open("/editor", "_blank");
          newWindow.name = window.name;
        },
      },
      open: {
        function: open,
        shortcut: "Ctrl+O",
      },
      open_recent: {
        children: [
          ...(recentlyOpenedDiagrams && recentlyOpenedDiagrams.length > 0
            ? [
                ...recentlyOpenedDiagrams.map((diagram) => ({
                  name: diagram.name,
                  label: DateTime.fromJSDate(new Date(diagram.lastModified))
                    .setLocale(i18n.language)
                    .toRelative(),
                  function: async () => {
                    await loadDiagram(diagram.id);
                    save();
                  },
                })),
                { divider: true },
                {
                  name: t("see_all"),
                  function: () => open(),
                },
              ]
            : [
                {
                  name: t("no_saved_diagrams"),
                  disabled: true,
                },
              ]),
        ],

        function: () => {},
      },
      save: {
        function: save,
        shortcut: "Ctrl+S",
        disabled: layout.readOnly,
      },
      save_as: {
        function: saveDiagramAs,
        shortcut: "Ctrl+Shift+S",
        disabled: layout.readOnly,
      },
      save_as_template: {
        function: () => {
          db.templates
            .add({
              title: title,
              tables: tables,
              database: database,
              relationships: relationships,
              notes: notes,
              subjectAreas: areas,
              custom: 1,
              ...(databases[database].hasEnums && { enums: enums }),
              ...(databases[database].hasTypes && { types: types }),
            })
            .then(() => {
              Toast.success(t("template_saved"));
            });
        },
      },
      rename: {
        function: () => {
          setModal(MODAL.RENAME);
        },
        disabled: layout.readOnly,
      },
      delete_diagram: {
        warning: {
          title: t("delete_diagram"),
          message: t("are_you_sure_delete_diagram"),
        },
        function: async () => {
          await db.diagrams
            .delete(diagramId)
            .then(() => {
              setDiagramId(0);
              setTitle("Untitled diagram");
              setTables([]);
              setRelationships([]);
              setAreas([]);
              setNotes([]);
              setTypes([]);
              setEnums([]);
              setUndoStack([]);
              setRedoStack([]);
              setGistId("");
            })
            .catch(() => Toast.error(t("oops_smth_went_wrong")));
        },
      },
      import_from: {
        children: [
          {
            function: () => {
              setModal(MODAL.IMPORT);
              setImportFrom(IMPORT_FROM.JSON);
            },
            name: "JSON",
            disabled: layout.readOnly,
          },
          {
            function: () => {
              setModal(MODAL.IMPORT);
              setImportFrom(IMPORT_FROM.DBML);
            },
            name: "DBML",
            disabled: layout.readOnly,
          },
        ],
      },
      import_from_source: {
        ...(database === DB.GENERIC && {
          children: [
            {
              function: () => {
                setModal(MODAL.IMPORT_SRC);
                setImportDb(DB.MYSQL);
              },
              name: "MySQL",
              disabled: layout.readOnly,
            },
            {
              function: () => {
                setModal(MODAL.IMPORT_SRC);
                setImportDb(DB.POSTGRES);
              },
              name: "PostgreSQL",
              disabled: layout.readOnly,
            },
            {
              function: () => {
                setModal(MODAL.IMPORT_SRC);
                setImportDb(DB.SQLITE);
              },
              name: "SQLite",
              disabled: layout.readOnly,
            },
            {
              function: () => {
                setModal(MODAL.IMPORT_SRC);
                setImportDb(DB.MARIADB);
              },
              name: "MariaDB",
              disabled: layout.readOnly,
            },
            {
              function: () => {
                setModal(MODAL.IMPORT_SRC);
                setImportDb(DB.MSSQL);
              },
              name: "MSSQL",
              disabled: layout.readOnly,
            },
            {
              function: () => {
                setModal(MODAL.IMPORT_SRC);
                setImportDb(DB.ORACLESQL);
              },
              name: "Oracle",
              label: "Beta",
              disabled: layout.readOnly,
            },
          ],
        }),
        function: () => {
          if (database === DB.GENERIC) return;

          setModal(MODAL.IMPORT_SRC);
        },
        disabled: layout.readOnly,
      },
      export_source: {
        ...(database === DB.GENERIC && {
          children: [
            {
              name: "MySQL",
              function: () => {
                setModal(MODAL.CODE);
                const src = jsonToMySQL({
                  tables: tables,
                  references: relationships,
                  types: types,
                  database: database,
                });
                setExportData((prev) => ({
                  ...prev,
                  data: src,
                  extension: "sql",
                }));
              },
            },
            {
              name: "PostgreSQL",
              function: () => {
                setModal(MODAL.CODE);
                const src = jsonToPostgreSQL({
                  tables: tables,
                  references: relationships,
                  types: types,
                  database: database,
                });
                setExportData((prev) => ({
                  ...prev,
                  data: src,
                  extension: "sql",
                }));
              },
            },
            {
              name: "SQLite",
              function: () => {
                setModal(MODAL.CODE);
                const src = jsonToSQLite({
                  tables: tables,
                  references: relationships,
                  types: types,
                  database: database,
                });
                setExportData((prev) => ({
                  ...prev,
                  data: src,
                  extension: "sql",
                }));
              },
            },
            {
              name: "MariaDB",
              function: () => {
                setModal(MODAL.CODE);
                const src = jsonToMariaDB({
                  tables: tables,
                  references: relationships,
                  types: types,
                  database: database,
                });
                setExportData((prev) => ({
                  ...prev,
                  data: src,
                  extension: "sql",
                }));
              },
            },
            {
              name: "MSSQL",
              function: () => {
                setModal(MODAL.CODE);
                const src = jsonToSQLServer({
                  tables: tables,
                  references: relationships,
                  types: types,
                  database: database,
                });
                setExportData((prev) => ({
                  ...prev,
                  data: src,
                  extension: "sql",
                }));
              },
            },
            {
              label: "Beta",
              name: "Oracle",
              function: () => {
                setModal(MODAL.CODE);
                const src = jsonToOracleSQL({
                  tables: tables,
                  references: relationships,
                  types: types,
                  database: database,
                });
                setExportData((prev) => ({
                  ...prev,
                  data: src,
                  extension: "sql",
                }));
              },
            },
          ],
        }),
        function: () => {
          if (database === DB.GENERIC) return;
          setModal(MODAL.CODE);
          const src = exportSQL({
            tables: tables,
            references: relationships,
            types: types,
            database: database,
            enums: enums,
          });
          setExportData((prev) => ({
            ...prev,
            data: src,
            extension: "sql",
          }));
        },
      },
      export_as: {
        children: [
          {
            name: "PNG",
            function: () => {
              exportFullDiagram("png");
            },
          },
          {
            name: "JPEG",
            function: () => {
              exportFullDiagram("jpeg");
            },
          },
          {
            name: "SVG",
            function: () => {
              exportFullDiagram("svg");
            },
          },
          {
            name: "JSON",
            function: () => {
              setModal(MODAL.CODE);
              const result = JSON.stringify(
                {
                  tables: tables,
                  relationships: relationships,
                  notes: notes,
                  subjectAreas: areas,
                  database: database,
                  ...(databases[database].hasTypes && { types: types }),
                  ...(databases[database].hasEnums && { enums: enums }),
                  title: title,
                },
                null,
                2,
              );
              setExportData((prev) => ({
                ...prev,
                data: result,
                extension: "json",
              }));
            },
          },
          {
            name: "DBML",
            function: () => {
              setModal(MODAL.CODE);
              const result = toDBML({
                tables,
                relationships,
                enums,
                database,
              });
              setExportData((prev) => ({
                ...prev,
                data: result,
                extension: "dbml",
              }));
            },
          },
          {
            name: "PDF",
            function: () => {
              const canvas = document.getElementById("canvas");
              toJpeg(canvas).then(function (dataUrl) {
                const doc = new jsPDF("l", "px", [
                  canvas.offsetWidth,
                  canvas.offsetHeight,
                ]);
                doc.addImage(
                  dataUrl,
                  "jpeg",
                  0,
                  0,
                  canvas.offsetWidth,
                  canvas.offsetHeight,
                );
                doc.save(`${exportData.filename}.pdf`);
              });
            },
          },
          {
            name: "Mermaid",
            function: () => {
              setModal(MODAL.CODE);
              const result = jsonToMermaid({
                tables: tables,
                relationships: relationships,
                notes: notes,
                subjectAreas: areas,
                database: database,
                title: title,
              });
              setExportData((prev) => ({
                ...prev,
                data: result,
                extension: "md",
              }));
            },
          },
          {
            name: "Markdown",
            function: () => {
              setModal(MODAL.CODE);
              const result = jsonToDocumentation({
                tables: tables,
                relationships: relationships,
                notes: notes,
                subjectAreas: areas,
                database: database,
                title: title,
                ...(databases[database].hasTypes && { types: types }),
                ...(databases[database].hasEnums && { enums: enums }),
              });
              setExportData((prev) => ({
                ...prev,
                data: result,
                extension: "md",
              }));
            },
          },
        ],
        function: () => {},
      },
      exit: {
        function: () => {
          save();
          if (saveState === State.SAVED) navigate("/");
        },
      },
    },
    edit: {
      undo: {
        function: undo,
        shortcut: "Ctrl+Z",
        disabled: layout.readOnly || undoStack.length === 0,
      },
      redo: {
        function: redo,
        shortcut: "Ctrl+Y",
        disabled: layout.readOnly || redoStack.length === 0,
      },
      clear: {
        warning: {
          title: t("clear"),
          message: t("are_you_sure_clear"),
        },
        function: async () => {
          setTables([]);
          setRelationships([]);
          setAreas([]);
          setNotes([]);
          setEnums([]);
          setTypes([]);
          setUndoStack([]);
          setRedoStack([]);

          if (!diagramId) {
            Toast.error(t("oops_smth_went_wrong"));
            return;
          }

          db.table("diagrams")
            .delete(diagramId)
            .catch((error) => {
              Toast.error(t("oops_smth_went_wrong"));
              console.error(
                `Error deleting records with gistId '${diagramId}':`,
                error,
              );
            });
        },
        disabled: layout.readOnly,
      },
      edit: {
        function: edit,
        shortcut: "Ctrl+E",
        disabled: layout.readOnly,
      },
      cut: {
        function: cut,
        shortcut: "Ctrl+X",
        disabled: layout.readOnly,
      },
      copy: {
        function: copy,
        shortcut: "Ctrl+C",
      },
      paste: {
        function: paste,
        shortcut: "Ctrl+V",
        disabled: layout.readOnly,
      },
      duplicate: {
        function: duplicate,
        shortcut: "Ctrl+D",
        disabled: layout.readOnly,
      },
      delete: {
        function: del,
        shortcut: "Del",
        disabled: layout.readOnly,
      },
      copy_as_image: {
        function: copyAsImage,
        shortcut: "Ctrl+Alt+C",
      },
      arrange_tables: {
        function: () => autoArrangeAllTables(),
        disabled: layout.readOnly || tables.length < 2,
      },
    },
    view: {
      header: {
        state: layout.header ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: () =>
          setLayout((prev) => ({ ...prev, header: !prev.header })),
      },
      sidebar: {
        state: layout.sidebar ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: () =>
          setLayout((prev) => ({ ...prev, sidebar: !prev.sidebar })),
      },
      issues: {
        state: layout.issues ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: () =>
          setLayout((prev) => ({ ...prev, issues: !prev.issues })),
      },
      dbml_view: {
        state: layout.dbmlEditor ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: toggleDBMLEditor,
        shortcut: "Alt+E",
      },
      strict_mode: {
        state: settings.strictMode ? (
          <i className="bi bi-toggle-off" />
        ) : (
          <i className="bi bi-toggle-on" />
        ),
        function: viewStrictMode,
        shortcut: "Ctrl+Shift+M",
      },
      presentation_mode: {
        function: () => {
          setLayout((prev) => ({
            ...prev,
            header: false,
            sidebar: false,
            toolbar: false,
          }));
          enterFullscreen();
        },
      },
      field_details: {
        state: settings.showFieldSummary ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: viewFieldSummary,
        shortcut: "Ctrl+Shift+F",
      },
      reset_view: {
        function: resetView,
        shortcut: "Enter/Return",
      },
      show_comments: {
        state: settings.showComments ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: () =>
          setSettings((prev) => ({
            ...prev,
            showComments: !prev.showComments,
          })),
      },
      show_datatype: {
        state: settings.showDataTypes ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: () =>
          setSettings((prev) => ({
            ...prev,
            showDataTypes: !prev.showDataTypes,
          })),
      },
      show_grid: {
        state: settings.showGrid ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: viewGrid,
        shortcut: "Ctrl+Shift+G",
      },
      snap_to_grid: {
        state: settings.snapToGrid ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: snapToGrid,
      },
      show_cardinality: {
        state: settings.showCardinality ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: () =>
          setSettings((prev) => ({
            ...prev,
            showCardinality: !prev.showCardinality,
          })),
      },
      show_relationship_labels: {
        state: settings.showRelationshipLabels ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: () =>
          setSettings((prev) => ({
            ...prev,
            showRelationshipLabels: !prev.showRelationshipLabels,
          })),
      },
      show_debug_coordinates: {
        state: settings.showDebugCoordinates ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: () =>
          setSettings((prev) => ({
            ...prev,
            showDebugCoordinates: !prev.showDebugCoordinates,
          })),
      },
      theme: {
        children: [
          {
            name: t("light"),
            function: () => setSettings((prev) => ({ ...prev, mode: "light" })),
          },
          {
            name: t("dark"),
            function: () => setSettings((prev) => ({ ...prev, mode: "dark" })),
          },
        ],
        function: () => {},
      },
      zoom_in: {
        function: zoomIn,
        shortcut: "Ctrl+(Up/Wheel)",
      },
      zoom_out: {
        function: zoomOut,
        shortcut: "Ctrl+(Down/Wheel)",
      },
      fullscreen: {
        state: fullscreen ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: fullscreen ? exitFullscreen : enterFullscreen,
      },
    },
    settings: {
      show_timeline: {
        function: () => setSidesheet(SIDESHEET.TIMELINE),
      },
      autosave: {
        state: settings.autosave ? (
          <i className="bi bi-toggle-on" />
        ) : (
          <i className="bi bi-toggle-off" />
        ),
        function: () =>
          setSettings((prev) => ({ ...prev, autosave: !prev.autosave })),
      },
      table_width: {
        function: () => setModal(MODAL.TABLE_WIDTH),
        disabled: layout.readOnly,
      },
      language: {
        function: () => setModal(MODAL.LANGUAGE),
      },
      manage_pin: {
        function: () => setModal(MODAL.PIN),
        disabled: !gistId,
      },
      export_saved_data: {
        function: exportSavedData,
      },
      clear_cache: {
        function: () => {
          deleteFromCache(gistId);
          Toast.success(t("cache_cleared"));
        },
      },
      flush_storage: {
        warning: {
          title: t("flush_storage"),
          message: t("are_you_sure_flush_storage"),
        },
        function: async () => {
          localStorage.removeItem(STORAGE_KEY);
          db.delete()
            .then(() => {
              Toast.success(t("storage_flushed"));
              window.location.reload(false);
            })
            .catch(() => {
              Toast.error(t("oops_smth_went_wrong"));
            });
        },
      },
    },
    help: {
      docs: {
        function: () => window.open(`${socials.docs}`, "_blank"),
        shortcut: "Ctrl+H",
      },
      shortcuts: {
        function: () => window.open(`${socials.docs}/shortcuts`, "_blank"),
      },
      // ask_on_discord: {
      //   function: () => window.open(socials.discord, "_blank"),
      // },
      // report_bug: {
      //   function: () => window.open("/bug-report", "_blank"),
      // },
    },
  };

  useHotkeys("mod+i", fileImport, { preventDefault: true });
  useHotkeys("mod+z", undo, { preventDefault: true });
  useHotkeys("mod+y", redo, { preventDefault: true });
  useHotkeys("mod+s", save, { preventDefault: true });
  useHotkeys("mod+o", open, { preventDefault: true });
  useHotkeys("mod+e", edit, { preventDefault: true });
  useHotkeys("mod+d", duplicate, { preventDefault: true });
  useHotkeys("mod+c", copy, { preventDefault: true });
  useHotkeys("mod+v", paste, { preventDefault: true });
  useHotkeys("mod+x", cut, { preventDefault: true });
  useHotkeys("delete", del, { preventDefault: true });
  useHotkeys("mod+shift+g", viewGrid, { preventDefault: true });
  useHotkeys("mod+up", zoomIn, { preventDefault: true });
  useHotkeys("mod+down", zoomOut, { preventDefault: true });
  useHotkeys("mod+shift+m", viewStrictMode, {
    preventDefault: true,
  });
  useHotkeys("mod+shift+f", viewFieldSummary, {
    preventDefault: true,
  });
  useHotkeys("mod+shift+s", saveDiagramAs, {
    preventDefault: true,
  });
  useHotkeys("mod+alt+c", copyAsImage, { preventDefault: true });
  useHotkeys("enter", resetView, { preventDefault: true });
  useHotkeys("mod+h", () => window.open(socials.docs, "_blank"), {
    preventDefault: true,
  });
  useHotkeys("mod+alt+w", fitWindow, { preventDefault: true });
  useHotkeys("alt+e", toggleDBMLEditor, { preventDefault: true });

  return (
    <>
      <div>
        {layout.header && (
          <div
            className="flex justify-between items-center me-7"
            style={isRtl(i18n.language) ? { direction: "rtl" } : {}}
          >
            {header()}
            {window.name.split(" ")[0] !== "t" && (
              <Button
                type="primary"
                className="!text-base me-2 !pe-6 !ps-5 !py-[18px] !rounded-md"
                size="default"
                icon={<IconShareStroked />}
                onClick={() => setModal(MODAL.SHARE)}
              >
                {t("share")}
              </Button>
            )}
          </div>
        )}
        {layout.toolbar && toolbar()}
      </div>
      <Modal
        modal={modal}
        exportData={exportData}
        setExportData={setExportData}
        title={title}
        setTitle={setTitle}
        setDiagramId={setDiagramId}
        setModal={setModal}
        importFrom={importFrom}
        importDb={importDb}
      />
      <Sidesheet
        type={sidesheet}
        title={title}
        setTitle={setTitle}
        onClose={() => setSidesheet(SIDESHEET.NONE)}
      />
    </>
  );

  function toolbar() {
    return (
      <div
        className="py-1.5 px-5 flex justify-between items-center rounded-xl my-1 sm:mx-1 xl:mx-6 select-none overflow-hidden toolbar-theme"
        style={isRtl(i18n.language) ? { direction: "rtl" } : {}}
      >
        <div className="flex justify-start items-center">
          <LayoutDropdown />
          <Divider layout="vertical" margin="8px" />
          <Tooltip content={t("zoom_out")} position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded-sm text-lg"
              onClick={() =>
                setTransform((prev) => ({ ...prev, zoom: prev.zoom / 1.2 }))
              }
            >
              <i className="fa-solid fa-magnifying-glass-minus" />
            </button>
          </Tooltip>
          <Dropdown
            style={{ width: "240px" }}
            position={isRtl(i18n.language) ? "bottomRight" : "bottomLeft"}
            render={
              <Dropdown.Menu
                style={isRtl(i18n.language) ? { direction: "rtl" } : {}}
              >
                <Dropdown.Item
                  onClick={fitWindow}
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div>{t("fit_window_reset")}</div>
                  <div className="text-gray-400">Ctrl+Alt+W</div>
                </Dropdown.Item>
                <Dropdown.Divider />
                {[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0].map((e, i) => (
                  <Dropdown.Item
                    key={i}
                    onClick={() => {
                      setTransform((prev) => ({ ...prev, zoom: e }));
                    }}
                  >
                    {Math.floor(e * 100)}%
                  </Dropdown.Item>
                ))}
                <Dropdown.Divider />
                <Dropdown.Item>
                  <InputNumber
                    field="zoom"
                    label={t("zoom")}
                    placeholder={t("zoom")}
                    suffix={<div className="p-1">%</div>}
                    onChange={(v) =>
                      setTransform((prev) => ({
                        ...prev,
                        zoom: parseFloat(v) * 0.01,
                      }))
                    }
                  />
                </Dropdown.Item>
              </Dropdown.Menu>
            }
            trigger="click"
          >
            <div className="py-1 px-2 hover-2 rounded-sm flex items-center justify-center">
              <div className="w-[40px]">
                {Math.floor(transform.zoom * 100)}%
              </div>
              <div>
                <IconCaretdown />
              </div>
            </div>
          </Dropdown>
          <Tooltip content={t("zoom_in")} position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded-sm text-lg"
              onClick={() =>
                setTransform((prev) => ({ ...prev, zoom: prev.zoom * 1.2 }))
              }
            >
              <i className="fa-solid fa-magnifying-glass-plus" />
            </button>
          </Tooltip>
          <Divider layout="vertical" margin="8px" />
          <Tooltip content={t("undo")} position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded-sm flex items-center disabled:opacity-50"
              disabled={undoStack.length === 0 || layout.readOnly}
              onClick={undo}
            >
              <IconUndo size="large" />
            </button>
          </Tooltip>
          <Tooltip content={t("redo")} position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded-sm flex items-center disabled:opacity-50"
              disabled={redoStack.length === 0 || layout.readOnly}
              onClick={redo}
            >
              <IconRedo size="large" />
            </button>
          </Tooltip>
          <Divider layout="vertical" margin="8px" />
          <Tooltip content={t("add_table")} position="bottom">
            <button
              className="flex items-center py-1 px-2 hover-2 rounded-sm disabled:opacity-50"
              onClick={() => addTable()}
              disabled={layout.readOnly}
            >
              <IconAddTable />
            </button>
          </Tooltip>
          <Tooltip content={t("add_area")} position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded-sm flex items-center disabled:opacity-50"
              onClick={() => addArea()}
              disabled={layout.readOnly}
            >
              <IconAddArea />
            </button>
          </Tooltip>
          <Tooltip content={t("add_note")} position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded-sm flex items-center disabled:opacity-50"
              onClick={() => addNote()}
              disabled={layout.readOnly}
            >
              <IconAddNote />
            </button>
          </Tooltip>
          <Tooltip content={t("arrange_tables")} position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded-sm flex items-center disabled:opacity-50 text-lg"
              onClick={() => autoArrangeAllTables()}
              disabled={layout.readOnly || tables.length < 2}
            >
              <i className="fa-solid fa-grip" />
            </button>
          </Tooltip>
          <Divider layout="vertical" margin="8px" />
          <Tooltip content={t("save")} position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded-sm flex items-center disabled:opacity-50"
              onClick={save}
              disabled={layout.readOnly}
            >
              <IconSaveStroked size="extra-large" />
            </button>
          </Tooltip>
          <Divider layout="vertical" margin="8px" />
          <Tooltip content={t("versions")} position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded-sm text-xl -mt-0.5"
              onClick={() => setSidesheet(SIDESHEET.VERSIONS)}
            >
              <i className="fa-solid fa-code-branch" />
            </button>
          </Tooltip>
          <Divider layout="vertical" margin="8px" />
          <Tooltip content={t("theme")} position="bottom">
            <button
              className="py-1 px-2 hover-2 rounded-sm text-xl -mt-0.5"
              onClick={() => {
                const body = document.body;
                if (body.hasAttribute("theme-mode")) {
                  if (body.getAttribute("theme-mode") === "light") {
                    menu["view"]["theme"].children[1].function();
                  } else {
                    menu["view"]["theme"].children[0].function();
                  }
                }
              }}
            >
              <i className="fa-solid fa-circle-half-stroke" />
            </button>
          </Tooltip>
          <Divider layout="vertical" margin="8px" />
          <Tooltip
            content={layout.readOnly ? t("exit_view_mode") : t("view_mode")}
            position="bottom"
          >
            <button
              className={`py-1 px-2 hover-2 rounded-sm text-xl -mt-0.5${layout.readOnly ? " text-blue-500" : ""}`}
              onClick={() => invertLayout("readOnly")}
            >
              <i className={layout.readOnly ? "fa-solid fa-eye-slash" : "fa-solid fa-eye"} />
            </button>
          </Tooltip>
        </div>
        <button
          onClick={() => invertLayout("header")}
          className="flex items-center"
        >
          {layout.header ? <IconChevronUp /> : <IconChevronDown />}
        </button>
      </div>
    );
  }

  function getState() {
    switch (saveState) {
      case State.NONE:
        return t("no_changes");
      case State.LOADING:
        return t("loading");
      case State.SAVED:
        return `${t("last_saved")} ${lastSaved}`;
      case State.SAVING:
        return t("saving");
      case State.ERROR:
        return t("failed_to_save");
      case State.FAILED_TO_LOAD:
        return t("failed_to_load");
      default:
        return "";
    }
  }

  function header() {
    return (
      <nav
        className="flex justify-between pt-1 items-center whitespace-nowrap"
        style={isRtl(i18n.language) ? { direction: "rtl" } : {}}
      >
        <div className="flex justify-start items-center">
          <Link to="/">
            <img
              width={54}
              src={icon}
              alt="logo"
              className="ms-7 min-w-[54px]"
            />
          </Link>
          <div className="ms-1 mt-1">
            <div className="flex items-center ms-3 gap-2">
              {databases[database].image && (
                <img
                  src={databases[database].image}
                  className="h-5"
                  style={{
                    filter:
                      "opacity(0.4) drop-shadow(0 0 0 white) drop-shadow(0 0 0 white)",
                  }}
                  alt={databases[database].name + " icon"}
                  title={databases[database].name + " diagram"}
                />
              )}
              <div
                className="text-xl flex items-center gap-1 me-1"
                onPointerEnter={(e) => e.isPrimary && setShowEditName(true)}
                onPointerLeave={(e) => e.isPrimary && setShowEditName(false)}
                onPointerDown={(e) => {
                  // Required for onPointerLeave to trigger when a touch pointer leaves
                  // https://stackoverflow.com/a/70976017/1137077
                  e.target.releasePointerCapture(e.pointerId);
                }}
                onClick={!layout.readOnly && (() => setModal(MODAL.RENAME))}
              >
                <span>
                  {(window.name.split(" ")[0] === "t"
                    ? "Templates: "
                    : "Diagrams: ") + title}
                </span>
                {version && (
                  <Tag className="mt-1" color="blue" size="small">
                    {typeof version === 'string' ? version.substring(0, 7) : version}
                  </Tag>
                )}
              </div>
              {(showEditName || modal === MODAL.RENAME) && !layout.readOnly && (
                <IconEdit />
              )}
            </div>
            <div className="flex items-center">
              <div className="flex justify-start text-md select-none me-2">
                {Object.keys(menu).map((category) => (
                  <Dropdown
                    key={category}
                    position="bottomLeft"
                    style={{
                      width: "240px",
                      direction: isRtl(i18n.language) ? "rtl" : "ltr",
                    }}
                    render={
                      <Dropdown.Menu className="menu max-h-[calc(100vh-80px)] overflow-auto">
                        {Object.keys(menu[category]).map((item, index) => {
                          if (menu[category][item].children) {
                            return (
                              <Dropdown
                                className="min-w-36 max-w-72"
                                key={item}
                                position="rightTop"
                                render={
                                  <Dropdown.Menu>
                                    {menu[category][item].children.map(
                                      (e, i) => {
                                        if (e.divider) {
                                          return (
                                            <Dropdown.Divider
                                              key={`divider-${i}`}
                                            />
                                          );
                                        }
                                        return (
                                          <Dropdown.Item
                                            key={i}
                                            onClick={e.function}
                                            className="flex w-full items-center justify-between gap-1"
                                            disabled={e.disabled}
                                          >
                                            <span className="truncate flex-1 min-w-0">
                                              {e.name}
                                            </span>
                                            {e.label && (
                                              <Tag
                                                size="small"
                                                className="flex-shrink-0"
                                              >
                                                {e.label}
                                              </Tag>
                                            )}
                                          </Dropdown.Item>
                                        );
                                      },
                                    )}
                                  </Dropdown.Menu>
                                }
                              >
                                <Dropdown.Item
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                  onClick={menu[category][item].function}
                                >
                                  {t(item)}

                                  {isRtl(i18n.language) ? (
                                    <IconChevronLeft />
                                  ) : (
                                    <IconChevronRight />
                                  )}
                                </Dropdown.Item>
                              </Dropdown>
                            );
                          }
                          if (
                            menu[category][item].warning &&
                            !menu[category][item].disabled
                          ) {
                            return (
                              <Popconfirm
                                key={index}
                                title={menu[category][item].warning.title}
                                content={menu[category][item].warning.message}
                                onConfirm={menu[category][item].function}
                                position="right"
                                okText={t("confirm")}
                                cancelText={t("cancel")}
                              >
                                <Dropdown.Item>{t(item)}</Dropdown.Item>
                              </Popconfirm>
                            );
                          }
                          return (
                            <Dropdown.Item
                              key={index}
                              disabled={menu[category][item].disabled}
                              onClick={menu[category][item].function}
                              style={
                                menu[category][item].shortcut && {
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }
                              }
                            >
                              <div className="w-full flex items-center justify-between">
                                <div>{t(item)}</div>
                                <div className="flex items-center gap-1">
                                  {menu[category][item].shortcut && (
                                    <div className="text-gray-400">
                                      {menu[category][item].shortcut}
                                    </div>
                                  )}
                                  {menu[category][item].state &&
                                    menu[category][item].state}
                                </div>
                              </div>
                            </Dropdown.Item>
                          );
                        })}
                      </Dropdown.Menu>
                    }
                  >
                    <div className="px-3 py-1 hover-2 rounded-sm">
                      {t(category)}
                    </div>
                  </Dropdown>
                ))}
              </div>
              {layout.readOnly && <Tag size="small">{t("read_only")}</Tag>}
              {!layout.readOnly && (
                <Tag
                  size="small"
                  type="light"
                  prefixIcon={
                    saveState === State.LOADING ||
                    saveState === State.SAVING ? (
                      <Spin size="small" />
                    ) : null
                  }
                >
                  {getState()}
                </Tag>
              )}
            </div>
          </div>
        </div>
      </nav>
    );
  }
}
