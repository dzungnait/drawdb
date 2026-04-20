import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { listDesigns, del as deleteDesign, verifyPin, updatePin } from "../api/gists";
import { db } from "../data/db";
import mysql_icon from "../assets/mysql.png";
import postgres_icon from "../assets/postgres.png";
import sqlite_icon from "../assets/sqlite.png";
import mariadb_icon from "../assets/mariadb.png";
import oraclesql_icon from "../assets/oraclesql.png";
import sql_server_icon from "../assets/sql-server.png";

const features = [
  {
    title: "Export",
    content: "Export the DDL script to run on your database or export the diagram as a JSON or an image.",
  },
  {
    title: "Reverse engineer",
    content: "Already have a schema? Import a DDL script to generate a diagram.",
  },
  {
    title: "Customizable workspace",
    content: "Customize the UI to fit your preferences. Select the components you want in your view.",
  },
  {
    title: "Keyboard shortcuts",
    content: "Speed up development with keyboard shortcuts. Access common editing functions instantly.",
  },
  {
    title: "Templates",
    content: "Start off with pre-built templates. Get a quick start or get inspiration for your design.",
  },
  {
    title: "Custom Templates",
    content: "Have boilerplate structures? Save time by saving them as templates and load them when needed.",
  },
  {
    title: "Robust editor",
    content: "Undo, redo, copy, paste, duplicate and more. Add tables, subject areas, and notes.",
  },
  {
    title: "Issue detection",
    content: "Detect and tackle errors in the diagram to make sure the scripts are correct.",
  },
  {
    title: "Relational databases",
    content: "We support 5 relational databases - MySQL, PostgreSQL, SQLite, MariaDB, SQL Server.",
  },
  {
    title: "Object-Relational databases",
    content: "Add custom types for object-relational databases, or create custom JSON schemes.",
  },
  {
    title: "Presentation mode",
    content: "Present your diagrams on a big screen during team meetings and discussions.",
  },
  {
    title: "Track todos",
    content: "Keep track of tasks and mark them done when finished.",
  },
];

const dbs = [
  { icon: mysql_icon, height: 80 },
  { icon: postgres_icon, height: 48 },
  { icon: sqlite_icon, height: 64 },
  { icon: mariadb_icon, height: 64 },
  { icon: sql_server_icon, height: 64 },
  { icon: oraclesql_icon, height: 172 },
];

export default function LandingPage() {
  const [designs, setDesigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  // Delete-with-PIN states
  const [showDeletePinModal, setShowDeletePinModal] = useState(false);
  const [deletePinTarget, setDeletePinTarget] = useState(null); // { id, name }
  const [deletePinInput, setDeletePinInput] = useState("");
  const [deletePinError, setDeletePinError] = useState("");
  const [deletePinLoading, setDeletePinLoading] = useState(false);

  // PIN management modal states
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinModalTarget, setPinModalTarget] = useState(null); // design object
  const [pinCurrentInput, setPinCurrentInput] = useState("");
  const [pinNewInput, setPinNewInput] = useState("");
  const [pinConfirmInput, setPinConfirmInput] = useState("");
  const [pinModalError, setPinModalError] = useState("");
  const [pinModalLoading, setPinModalLoading] = useState(false);
  const [pinModalMode, setPinModalMode] = useState("set"); // "set" | "change" | "remove"

  useEffect(() => {
    document.body.setAttribute("theme-mode", "light");
    document.title = "drawDB | Online database diagram editor and SQL generator";

    // Auto-clear IndexedDB data on mount for clean API data display
    const clearIndexedDB = async () => {
      try {
        // Only clear table data, keep database structure intact
        await Promise.all([
          db.diagrams.clear(),
          db.templates?.clear().catch(() => {}), // May not exist
        ]);
        console.log('🧹 Auto-cleared IndexedDB data for clean API data display');
      } catch (err) {
        console.warn('Failed to clear IndexedDB:', err);
      }
    };

    clearIndexedDB();
  }, []); // Only run once on mount

  useEffect(() => {
    loadDesigns();
  }, [page, search]); // Load designs when page/search changes

  const loadDesigns = async () => {
    try {
      setLoading(true);
      
      // Load from API (IndexedDB already cleared)
      const response = await listDesigns(page, 12, search);
      console.log('📡 Loaded from API:', response.data.length, 'designs');
      setDesigns(response.data);
      setTotal(response.pagination.total);
    } catch (error) {
      console.warn('❌ API failed:', error.message);
      // Show empty state when API fails
      setDesigns([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    navigate("/editor");
  };

  const handleOpenDesign = (id) => {
    navigate(`/editor?designId=${id}`);
  };

  const handleDeleteDesign = async (e, design) => {
    e.stopPropagation();

    // PIN-protected: luôn yêu cầu nhập PIN trước khi xoá
    if (design.pin_protected) {
      setDeletePinTarget({ id: design.id, name: design.name });
      setDeletePinInput("");
      setDeletePinError("");
      setShowDeletePinModal(true);
      return;
    }

    if (!window.confirm(`Delete "${design.name || "Untitled Diagram"}"? This cannot be undone.`)) return;
    try {
      await deleteDesign(design.id);
      loadDesigns();
    } catch (error) {
      console.error("Error deleting design:", error);
      alert("Failed to delete design. Please try again.");
    }
  };

  const confirmDeleteWithPin = async () => {
    if (!deletePinInput || !deletePinTarget) return;
    setDeletePinLoading(true);
    setDeletePinError("");
    try {
      await verifyPin(deletePinTarget.id, deletePinInput);
      setShowDeletePinModal(false);
      setDeletePinInput("");
      // Sau khi verify thành công, thực hiện xoá
      await deleteDesign(deletePinTarget.id);
      loadDesigns();
    } catch (err) {
      const msg = err.response?.data?.message || "Incorrect PIN. Please try again.";
      setDeletePinError(msg);
    } finally {
      setDeletePinLoading(false);
    }
  };

  const handleOpenPinModal = (e, design) => {
    e.stopPropagation();
    setPinModalTarget(design);
    setPinCurrentInput("");
    setPinNewInput("");
    setPinConfirmInput("");
    setPinModalError("");
    setPinModalMode(design.pin_protected ? "change" : "set");
    setShowPinModal(true);
  };

  const handlePinModalSubmit = async () => {
    if (!pinModalTarget) return;
    if (pinModalMode !== "remove" && !pinNewInput) {
      setPinModalError("New PIN is required.");
      return;
    }
    if (pinModalMode !== "remove" && pinNewInput !== pinConfirmInput) {
      setPinModalError("PINs do not match.");
      return;
    }
    if (pinModalMode !== "set" && !pinCurrentInput) {
      setPinModalError("Current PIN is required.");
      return;
    }
    setPinModalLoading(true);
    setPinModalError("");
    try {
      await updatePin(
        pinModalTarget.id,
        pinModalMode !== "set" ? pinCurrentInput : null,
        pinModalMode !== "remove" ? pinNewInput : null,
      );
      setShowPinModal(false);
      loadDesigns();
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to update PIN. Please try again.";
      setPinModalError(msg);
    } finally {
      setPinModalLoading(false);
    }
  };

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1); // Reset to first page on search
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-4xl font-bold text-slate-900">My Designs</h1>
            <button
              onClick={handleCreateNew}
              className="px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors font-semibold"
            >
              + New Design
            </button>
          </div>
          <div className="flex gap-4 items-center">
            <p className="text-slate-600 flex-1">Create, edit, and manage your database diagrams</p>
            <input
              type="text"
              placeholder="Search designs..."
              value={search}
              onChange={handleSearch}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 w-64"
            />
          </div>
        </div>

        {/* Designs Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="text-slate-600">Loading designs...</div>
          </div>
        ) : designs.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-semibold text-slate-900 mb-2">No designs yet</h2>
            <p className="text-slate-600 mb-6">Create your first database diagram to get started</p>
            <button
              onClick={handleCreateNew}
              className="px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors font-semibold"
            >
              Create Your First Design
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {designs.map((design) => (
              <div
                key={design.id}
                onClick={() => handleOpenDesign(design.id)}
                className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 cursor-pointer hover:shadow-lg hover:border-sky-300 transition-all duration-300 group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {design.pin_protected && (
                        <span title="PIN protected" className="text-amber-500 shrink-0">🔒</span>
                      )}
                      <h3 className="text-lg font-semibold text-slate-900 group-hover:text-sky-600 truncate">
                        {design.name || "Untitled Diagram"}
                      </h3>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {design.database || "Generic"}
                    </p>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <button
                      title={design.pin_protected ? "Manage PIN" : "Set PIN"}
                      onClick={(e) => handleOpenPinModal(e, design)}
                      className="px-2 py-1 text-amber-500 hover:bg-amber-50 rounded transition-colors text-sm"
                    >
                      {design.pin_protected ? "🔒" : "🔓"}
                    </button>
                    {/* <button
                      onClick={(e) => handleDeleteDesign(e, design)}
                      className="px-2 py-1 text-red-600 hover:bg-red-50 rounded transition-colors text-sm"
                    >
                      ✕
                    </button> */}
                  </div>
                </div>
                
                <div className="space-y-2 text-sm text-slate-600">
                  <div>📊 {design.tables?.length || 0} tables</div>
                  <div>🔗 {(design.relationships || design.references)?.length || 0} relationships</div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-500">
                    Last modified: {new Date(design.lastModified || design.updated_at || design.last_modified).toLocaleDateString()} {new Date(design.lastModified || design.updated_at || design.last_modified).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {total > 12 && (
          <div className="mt-8 flex justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-slate-600">
              Page {page} of {Math.ceil(total / 12)}
            </span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= Math.ceil(total / 12)}
              className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Supported Databases */}
      <div className="bg-white mt-16">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">Design for your database</h2>
          <p className="text-slate-600 text-center mb-10">Support for multiple relational and object-relational databases</p>
          <div className="grid grid-cols-3 place-items-center sm:grid-cols-1 sm:gap-10 gap-8">
            {dbs.map((s, i) => (
              <img
                key={"icon-" + i}
                src={s.icon}
                style={{ height: s.height }}
                className="opacity-70 hover:opacity-100 transition-opacity duration-300"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-base font-medium text-center text-sky-900 mb-2">
          More than just an editor
        </div>
        <h2 className="text-2xl font-bold text-center text-slate-900 mb-12">
          What drawDB has to offer
        </h2>
        <div className="grid grid-cols-3 gap-8 md:grid-cols-2 sm:grid-cols-1">
          {features.map((f, i) => (
            <div
              key={"feature" + i}
              className="flex rounded-xl hover:bg-slate-50 border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300"
            >
              <div className="bg-sky-600 w-1 rounded-l-xl" />
              <div className="px-6 py-4 flex-1">
                <div className="text-lg font-semibold text-slate-900 mb-2">{f.title}</div>
                <div className="text-slate-600 text-sm">{f.content}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PIN management modal (set / change / remove) */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">{pinModalMode === "remove" ? "🔓" : "🔒"}</span>
              <h2 className="text-lg font-semibold text-slate-900">
                {pinModalMode === "set" ? "Set PIN" : pinModalMode === "change" ? "Change PIN" : "Remove PIN"}
              </h2>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              <span className="font-medium">"{pinModalTarget?.name || "Untitled Diagram"}"</span>
            </p>

            {/* Current PIN (for change / remove) */}
            {pinModalMode !== "set" && (
              <>
                <label className="block text-xs font-medium text-slate-600 mb-1">Current PIN</label>
                <input
                  type="password"
                  maxLength={20}
                  autoFocus
                  placeholder="Current PIN..."
                  value={pinCurrentInput}
                  onChange={(e) => { setPinCurrentInput(e.target.value); setPinModalError(""); }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 mb-3"
                />
              </>
            )}

            {/* New PIN (for set / change) */}
            {pinModalMode !== "remove" && (
              <>
                <label className="block text-xs font-medium text-slate-600 mb-1">New PIN</label>
                <input
                  type="password"
                  maxLength={20}
                  autoFocus={pinModalMode === "set"}
                  placeholder="New PIN..."
                  value={pinNewInput}
                  onChange={(e) => { setPinNewInput(e.target.value); setPinModalError(""); }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 mb-3"
                />
                <label className="block text-xs font-medium text-slate-600 mb-1">Confirm new PIN</label>
                <input
                  type="password"
                  maxLength={20}
                  placeholder="Confirm PIN..."
                  value={pinConfirmInput}
                  onChange={(e) => { setPinConfirmInput(e.target.value); setPinModalError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handlePinModalSubmit()}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 mb-2"
                />
              </>
            )}

            {pinModalError && <p className="text-red-500 text-xs mb-3">{pinModalError}</p>}

            {/* Mode switcher for already-protected designs */}
            {pinModalTarget?.pin_protected && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => { setPinModalMode("change"); setPinModalError(""); }}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    pinModalMode === "change"
                      ? "bg-sky-600 text-white border-sky-600"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Change PIN
                </button>
                <button
                  onClick={() => { setPinModalMode("remove"); setPinNewInput(""); setPinConfirmInput(""); setPinModalError(""); }}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    pinModalMode === "remove"
                      ? "bg-red-600 text-white border-red-600"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Remove PIN
                </button>
              </div>
            )}

            <div className="flex gap-2 justify-end mt-2">
              <button
                onClick={() => setShowPinModal(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={pinModalLoading}
                onClick={handlePinModalSubmit}
                className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pinModalLoading
                  ? "Saving..."
                  : pinModalMode === "set"
                  ? "Set PIN"
                  : pinModalMode === "change"
                  ? "Change PIN"
                  : "Remove PIN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete PIN verification modal */}
      {showDeletePinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">🔒</span>
              <h2 className="text-lg font-semibold text-slate-900">PIN required to delete</h2>
            </div>
            <p className="text-sm text-slate-600 mb-1">
              Enter the PIN for <span className="font-medium">"{deletePinTarget?.name || "Untitled Diagram"}"</span> to confirm deletion.
            </p>
            <p className="text-xs text-red-500 mb-4">This action cannot be undone.</p>
            <input
              type="password"
              maxLength={20}
              autoFocus
              placeholder="Enter PIN..."
              value={deletePinInput}
              onChange={(e) => { setDeletePinInput(e.target.value); setDeletePinError(""); }}
              onKeyDown={(e) => e.key === "Enter" && deletePinInput && confirmDeleteWithPin()}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-2"
            />
            {deletePinError && <p className="text-red-500 text-xs mb-3">{deletePinError}</p>}
            <div className="flex gap-2 justify-end mt-2">
              <button
                onClick={() => { setShowDeletePinModal(false); setDeletePinInput(""); setDeletePinError(""); }}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!deletePinInput || deletePinLoading}
                onClick={confirmDeleteWithPin}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletePinLoading ? "Verifying..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}