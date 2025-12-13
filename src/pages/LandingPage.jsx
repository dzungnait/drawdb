import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { listDesigns, del as deleteDesign } from "../api/gists";
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

  const handleDeleteDesign = async (e, id) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this design?")) {
      try {
        await deleteDesign(id);
        console.log('🗑️ Deleted design from server:', id);
        loadDesigns(); // Reload list after delete
      } catch (error) {
        console.error("Error deleting design:", error);
        alert("Failed to delete design. Please try again.");
      }
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
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900 group-hover:text-sky-600 truncate">
                      {design.name || "Untitled Diagram"}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {design.database || "Generic"}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteDesign(e, design.id)}
                    className="ml-2 px-2 py-1 text-red-600 hover:bg-red-50 rounded transition-colors text-sm"
                  >
                    ✕
                  </button>
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
    </div>
  );
}