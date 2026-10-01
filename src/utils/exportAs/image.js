import { toJpeg, toPng, toSvg } from "html-to-image";
import jsPDF from "jspdf";

const PADDING = 40;
// Browser canvas limits: Chrome/Firefox cap a side at ~32k px and the area at
// ~268M px, Safari at ~16.7M px. Stay under all of them.
const MAX_SIDE = 16384;
const MAX_AREA = 16_000_000;
// jsPDF rejects pages larger than 14400 user units
const MAX_PDF_SIDE = 14400;

// Rendered inside #diagram but not part of the drawing itself
const isDecoration = (el) =>
  el.tagName === "defs" ||
  el.getAttribute("fill") === "url(#pattern-grid)" ||
  el.hasAttribute("data-export-ignore");

/**
 * Bounding box of everything drawn on the diagram, in diagram coordinates.
 * Measured from the DOM so it includes what the data model can't tell:
 * relationship curves, labels, cardinality markers, self-references.
 */
function getContentBox(svg) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of svg.children) {
    if (isDecoration(el) || typeof el.getBBox !== "function") continue;
    let box;
    try {
      box = el.getBBox();
    } catch {
      continue;
    }
    if (box.width === 0 && box.height === 0) continue;

    let { x, y, width, height } = box;
    const matrix = el.transform?.baseVal?.consolidate()?.matrix;
    if (matrix) {
      const corners = [
        [x, y],
        [x + width, y],
        [x, y + height],
        [x + width, y + height],
      ].map(([px, py]) => [
        matrix.a * px + matrix.c * py + matrix.e,
        matrix.b * px + matrix.d * py + matrix.f,
      ]);
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      x = Math.min(...xs);
      y = Math.min(...ys);
      width = Math.max(...xs) - x;
      height = Math.max(...ys) - y;
    }

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  if (!Number.isFinite(minX)) return null;
  return {
    x: Math.floor(minX - PADDING),
    y: Math.floor(minY - PADDING),
    width: Math.ceil(maxX - minX + 2 * PADDING),
    height: Math.ceil(maxY - minY + 2 * PADDING),
  };
}

/** Largest pixel ratio (up to `wanted`) the browser can still rasterize. */
function safePixelRatio(box, wanted) {
  return Math.max(
    0.1,
    Math.min(
      wanted,
      MAX_SIDE / box.width,
      MAX_SIDE / box.height,
      Math.sqrt(MAX_AREA / (box.width * box.height)),
    ),
  );
}

/**
 * Copy of the live diagram framed on its content, independent of the current
 * pan and zoom. The copy is mounted (invisibly) so stylesheets still apply to
 * the HTML inside the tables, then removed by the returned cleanup.
 */
function mountFramedCopy(svg, box) {
  const copy = svg.cloneNode(true);
  copy.removeAttribute("id");
  copy.removeAttribute("class");
  copy.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
  copy.setAttribute("width", box.width);
  copy.setAttribute("height", box.height);
  copy.style.width = `${box.width}px`;
  copy.style.height = `${box.height}px`;
  copy.style.display = "block";
  // Interaction overlays: linking line, selection box, resize handles
  copy.querySelectorAll("[data-export-ignore]").forEach((el) => el.remove());

  // Stretch the dotted grid (sized to the old viewport) over the new frame
  const grid = copy.querySelector('rect[fill="url(#pattern-grid)"]');
  if (grid) {
    grid.setAttribute("x", box.x);
    grid.setAttribute("y", box.y);
    grid.setAttribute("width", box.width);
    grid.setAttribute("height", box.height);
  }

  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${box.width}px`,
    height: `${box.height}px`,
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
  });
  host.appendChild(copy);
  document.body.appendChild(host);

  return { node: copy, cleanup: () => host.remove() };
}

/**
 * Renders the whole diagram, regardless of what is currently on screen.
 *
 * @param {"png" | "jpeg" | "svg"} type
 * @returns {Promise<{ dataUrl: string, width: number, height: number }>}
 */
export async function captureDiagram(
  type,
  { backgroundColor, pixelRatio = 2 } = {},
) {
  const svg = document.getElementById("diagram");
  if (!svg) throw new Error("Diagram not found");

  const box = getContentBox(svg);
  if (!box) throw new Error("Diagram is empty");

  const { node, cleanup } = mountFramedCopy(svg, box);
  const options = {
    backgroundColor,
    width: box.width,
    height: box.height,
    pixelRatio: safePixelRatio(box, pixelRatio),
  };
  try {
    let dataUrl;
    if (type === "png") {
      dataUrl = await toPng(node, options);
    } else if (type === "jpeg") {
      dataUrl = await toJpeg(node, { ...options, quality: 0.95 });
    } else {
      // Icon fonts can't be embedded in a standalone SVG
      dataUrl = await toSvg(node, {
        ...options,
        filter: (n) => n.tagName?.toLowerCase() !== "i",
      });
    }
    return { dataUrl, width: box.width, height: box.height };
  } finally {
    cleanup();
  }
}

/** Saves the whole diagram as a single-page PDF sized to the content. */
export async function saveDiagramAsPdf(filename, options) {
  const { dataUrl, width, height } = await captureDiagram("jpeg", options);
  const scale = Math.min(1, MAX_PDF_SIDE / width, MAX_PDF_SIDE / height);
  const w = width * scale;
  const h = height * scale;
  const doc = new jsPDF(w > h ? "l" : "p", "px", [w, h]);
  doc.addImage(dataUrl, "jpeg", 0, 0, w, h);
  doc.save(`${filename}.pdf`);
}
