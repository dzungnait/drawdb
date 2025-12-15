import { useState, useEffect, useCallback } from "react";
import ControlPanel from "./EditorHeader/ControlPanel";
import Canvas from "./EditorCanvas/Canvas";
import { CanvasContextProvider } from "../context/CanvasContext";
import { IdContext } from "../context/IdContext";
import SidePanel from "./EditorSidePanel/SidePanel";
import { DB, State } from "../data/constants";
import { db } from "../data/db";
import {
  useLayout,
  useSettings,
  useTransform,
  useDiagram,
  useUndoRedo,
  useAreas,
  useNotes,
  useTypes,
  useTasks,
  useSaveState,
  useEnums,
} from "../hooks";
import FloatingControls from "./FloatingControls";
import { Button, Modal, Tag, Toast } from "@douyinfe/semi-ui";
import { IconAlertTriangle } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { databases } from "../data/databases";
import { isRtl } from "../i18n/utils/rtl";
import { useSearchParams, useNavigate } from "react-router-dom";
import { get, patch, SHARE_FILENAME, create, createSnapshot, getCurrentVersion } from "../api/gists";
import { nanoid } from "nanoid";

const SIDEPANEL_MIN_WIDTH = 384;

export default function WorkSpace() {
  const [id, setId] = useState(0);
  const [gistId, setGistId] = useState("");
  const [version, setVersion] = useState("");
  const [loadedFromGistId, setLoadedFromGistId] = useState("");
  const [title, setTitle] = useState("Untitled Diagram");
  const [resize, setResize] = useState(false);
  const [width, setWidth] = useState(SIDEPANEL_MIN_WIDTH);
  const [lastSaved, setLastSaved] = useState("");
  const [showSelectDbModal, setShowSelectDbModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedDb, setSelectedDb] = useState("");
  const [failedToLoadDesign, setFailedToLoadDesign] = useState(false);
  const { layout, setLayout } = useLayout();
  const { settings } = useSettings();
  const { types, setTypes } = useTypes();
  const { areas, setAreas } = useAreas();
  const { tasks, setTasks } = useTasks();
  const { notes, setNotes } = useNotes();
  const { saveState, setSaveState, sessionId } = useSaveState();
  const { transform, setTransform } = useTransform();
  const { enums, setEnums } = useEnums();
  const {
    tables,
    relationships,
    setTables,
    setRelationships,
    database,
    setDatabase,
  } = useDiagram();
  const { undoStack, redoStack, setUndoStack, setRedoStack } = useUndoRedo();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  let [searchParams, setSearchParams] = useSearchParams();
  const handleResize = (e) => {
    if (!resize) return;
    const w = isRtl(i18n.language) ? window.innerWidth - e.clientX : e.clientX;
    if (w > SIDEPANEL_MIN_WIDTH) setWidth(w);
  };

  const save = useCallback(async () => {
    const name = window.name.split(" ");
    const op = name[0];
    const saveAsDiagram = window.name === "" || op === "d" || op === "lt";

    const diagramData = {
      database: database,
      name: title,
      lastModified: new Date(),
      tables: tables,
      references: relationships,
      notes: notes,
      areas: areas,
      todos: tasks,
      gistId: gistId ?? "",
      pan: transform?.pan || { x: 0, y: 0 },
      zoom: transform?.zoom || 1,
      loadedFromGistId: loadedFromGistId,
      ...(databases[database].hasEnums && { enums: enums }),
      ...(databases[database].hasTypes && { types: types }),
    };

      if (saveAsDiagram) {
        // Không xoá shareId khỏi URL để maintain shared link
        // if (searchParams.has("shareId")) {
        //   searchParams.delete("shareId");
        //   setSearchParams(searchParams, { replace: true });
        // }

        if ((id === 0 && window.name === "") || op === "lt") {
          await db.diagrams
            .add(diagramData)
            .then((newId) => {
              setId(newId);
              window.name = `d ${newId}`;
              setSaveState(State.SAVED);
              setLastSaved(new Date().toLocaleString());
            });
        } else {
          await db.diagrams
            .update(id, diagramData)
            .then(() => {
              setSaveState(State.SAVED);
              setLastSaved(new Date().toLocaleString());
            });
        }
      } else {
        await db.templates
          .update(id, {
            database: database,
            title: title,
            tables: tables,
            relationships: relationships,
            notes: notes,
            subjectAreas: areas,
            todos: tasks,
            pan: transform?.pan || { x: 0, y: 0 },
            zoom: transform?.zoom || 1,
            ...(databases[database].hasEnums && { enums: enums }),
            ...(databases[database].hasTypes && { types: types }),
          })
          .then(() => {
            setSaveState(State.SAVED);
            setLastSaved(new Date().toLocaleString());
          })
          .catch(() => {
            setSaveState(State.ERROR);
          });
      }
  }, [
    searchParams,
    setSearchParams,
    tables,
    relationships,
    notes,
    areas,
    types,
    title,
    id,
    tasks,
      transform,
      setSaveState,
      database,
      enums,
      gistId,
      loadedFromGistId,
    ],
  );

  // Auto-create design on server when first saving
  const ensureDesignOnServer = useCallback(async () => {
    if (gistId && gistId !== "") {
      return gistId; // Already created
    }

    const initialData = {
      title: title || "Untitled Diagram",
      tables: tables || [],
      relationships: relationships || [],
      notes: notes || [],
      subjectAreas: areas || [],
      database: database,
      ...(databases[database].hasTypes && { types: types || [] }),
      ...(databases[database].hasEnums && { enums: enums || [] }),
      transform: transform,
    };

    const newDesignId = await create(SHARE_FILENAME, JSON.stringify(initialData));
    setGistId(newDesignId);
    
    // Only update URL with designId if it's not a local ID
    if (!newDesignId.startsWith('local_')) {
      const params = new URLSearchParams();
      params.set("designId", newDesignId);
      setSearchParams(params, { replace: true });
    }
    
    return newDesignId;
  }, [gistId, title, tables, relationships, notes, areas, database, types, enums, transform, setSearchParams, setGistId]);

  const syncToServer = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    try {
      // Ensure design exists on server
      const designId = await ensureDesignOnServer();
      
      // Handle local designs without version control
      if (designId.startsWith('local_')) {
        const shareData = {
          title,
          tables: tables,
          relationships: relationships,
          notes: notes,
          subjectAreas: areas,
          database: database,
          ...(databases[database].hasTypes && { types: types }),
          ...(databases[database].hasEnums && { enums: enums }),
          transform: transform,
        };
        await patch(designId, SHARE_FILENAME, JSON.stringify(shareData));
        setSaveState(State.SAVED);
        setLastSaved(new Date().toLocaleString());
        return;
      }
      
      // Get current version for server designs
      const { version: currentVersion } = await getCurrentVersion(designId);
      
      const shareData = {
        title,
        tables: tables,
        relationships: relationships,
        notes: notes,
        subjectAreas: areas,
        database: database,
        ...(databases[database].hasTypes && { types: types }),
        ...(databases[database].hasEnums && { enums: enums }),
        transform: transform,
      };
      
      try {
        // Save with version control
        await patch(
          designId, 
          SHARE_FILENAME, 
          JSON.stringify(shareData),
          currentVersion,
          sessionId // Use sessionId as lastModifiedBy
        );
        setSaveState(State.SAVED);
        setLastSaved(new Date().toLocaleString());
      } catch (error) {
        if (error.conflict) {
          // Handle version conflict
          Toast.error(
            "Conflict detected: Another user has modified this design. Please refresh and try again.",
            { duration: 5000 }
          );
          // TODO: Show conflict resolution UI
          console.log("Conflict data:", error.data);
        } else {
          throw error;
        }
      }
    } catch (e) {
      console.error("Failed to sync to server:", e);
      // Don't set error state for local designs
      if (!gistId || !gistId.startsWith('local_')) {
        setSaveState(State.ERROR);
      }
    }
  }, [
    gistId,
    title,
    tables,
    relationships,
    notes,
    areas,
    database,
    types,
    enums,
    transform,
    setSaveState,
    sessionId,
    ensureDesignOnServer,
  ]);

  // Create manual snapshot/version
  const createManualSnapshot = useCallback(async (comment = '') => {
    if (!gistId || gistId.startsWith('local_')) {
      Toast.info("Snapshots are only available for server-saved designs");
      return;
    }

    try {
      setSaveState(State.SAVING);
      const result = await createSnapshot(gistId, comment);
      if (result.success) {
        Toast.success(`Snapshot v${result.data.version_number} created successfully`);
      }
      setSaveState(State.SAVED);
    } catch (error) {
      console.error("Failed to create snapshot:", error);
      Toast.error("Failed to create snapshot");
      setSaveState(State.ERROR);
    }
  }, [gistId, setSaveState]);

  // Load design from server/local storage
  const loadFromGist = useCallback(async (shareId) => {
    try {
      console.log("Calling API to get design:", shareId);
      const { data } = await get(shareId);
      console.log("API response received:", data);
      const parsedDiagram = JSON.parse(data.files[SHARE_FILENAME].content);
      setUndoStack([]);
      setRedoStack([]);
      setGistId(shareId);
      setLoadedFromGistId(shareId);
      setDatabase(parsedDiagram.database);
      setTitle(parsedDiagram.title);
      setTables(parsedDiagram.tables);
      setRelationships(parsedDiagram.relationships);
      setNotes(parsedDiagram.notes);
      setAreas(parsedDiagram.subjectAreas);
      setTransform(parsedDiagram.transform || { pan: { x: 0, y: 0 }, zoom: 1 });
      if (databases[parsedDiagram.database].hasTypes) {
        if (parsedDiagram.types) {
          setTypes(
            parsedDiagram.types.map((t) =>
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
        } else {
          setTypes([]);
        }
      }
      if (databases[parsedDiagram.database].hasEnums) {
        setEnums(
          parsedDiagram.enums.map((e) =>
            !e.id ? { ...e, id: nanoid() } : e,
          ) ?? [],
        );
      }
      setSaveState(State.SAVED);
      setFailedToLoadDesign(false);
      
      // Update URL để persist shareId
      const currentShareId = new URLSearchParams(window.location.search).get("shareId");
      if (shareId && !currentShareId) {
        const params = new URLSearchParams();
        params.set("shareId", shareId);
        window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      }
    } catch (e) {
      console.error("Failed to load design from server:", e);
      setFailedToLoadDesign(true);
      Toast.error("Failed to load design. Design may have been deleted or link is invalid.");
      // Redirect to landing page after showing error
      setTimeout(() => {
        navigate("/");
      }, 1500);
    }
  }, [setUndoStack, setRedoStack, setGistId, setLoadedFromGistId, setDatabase, setTitle, setTables, setRelationships, setNotes, setAreas, setTransform, setTypes, setEnums, setSaveState, setFailedToLoadDesign, navigate]);

  const initializeEditor = useCallback(async () => {
    const shareId = searchParams.get("shareId");
    const designId = searchParams.get("designId");
    
    console.log("initializeEditor called with:", { shareId, designId });
    
    // If we already tried to load and failed, don't retry
    if (failedToLoadDesign) {
      return;
    }
    
    if (shareId) {
      const existingDiagram = await db.diagrams.get({
        loadedFromGistId: shareId,
      });

      if (existingDiagram) {
        window.name = "d " + existingDiagram.id;
        setId(existingDiagram.id);
      } else {
        window.name = "";
        setId(0);
      }
      await loadFromGist(shareId);
      return;
    }

    if (designId) {
      // Load design from server by designId
      console.log("Loading design with ID:", designId);
      setGistId(designId);
      await loadFromGist(designId);
      return;
    }

    // For new designs (no shareId or designId), don't load anything
    // Just initialize with empty state
    if (!shareId && !designId) {
      // Set default database if none selected
      if (selectedDb === "") {
        setShowSelectDbModal(true);
      }
      return;
    }

    // Handle other cases (existing local diagrams)
    if (window.name === "") {
      await loadLatestDiagram();
    } else {
      const name = window.name.split(" ");
      const op = name[0];
      const id = parseInt(name[1]);
      switch (op) {
        case "d": {
          await loadDiagram(id);
          break;
        }
        case "t":
        case "lt": {
          await loadTemplate(id);
          break;
        }
        default:
          break;
      }
    }
  }, [searchParams, failedToLoadDesign, selectedDb]);

  const load = useCallback(async () => {
    const loadLatestDiagram = async () => {
      await db.diagrams
        .orderBy("lastModified")
        .last()
        .then((d) => {
          if (d) {
            if (d.database) {
              setDatabase(d.database);
            } else {
              setDatabase(DB.GENERIC);
            }
            setId(d.id);
            setGistId(d.gistId);
            setLoadedFromGistId(d.loadedFromGistId);
            setTitle(d.name);
            setTables(d.tables);
            setRelationships(d.references);
            setNotes(d.notes);
            setAreas(d.areas);
            setTasks(d.todos ?? []);
            setTransform({ 
              pan: d.pan || { x: 0, y: 0 }, 
              zoom: d.zoom || 1 
            });
            
            // Update URL with designId if gistId exists
            if (d.gistId) {
              const params = new URLSearchParams();
              params.set("designId", d.gistId);
              setSearchParams(params, { replace: true });
            }
            
            if (databases[database].hasTypes) {
              if (d.types) {
                setTypes(
                  d.types.map((t) =>
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
              } else {
                setTypes([]);
              }
            }
            if (databases[database].hasEnums) {
              setEnums(
                d.enums.map((e) => (!e.id ? { ...e, id: nanoid() } : e)) ?? [],
              );
            }
            window.name = `d ${d.id}`;
          } else {
            window.name = "";
            // Chỉ hiện modal chọn DB nếu không có shareId hoặc designId
            const shareId = searchParams.get("shareId");
            const designId = searchParams.get("designId");
            if (selectedDb === "" && !shareId && !designId) {
              setShowSelectDbModal(true);
            }
          }
        })
        .catch((error) => {
          console.log(error);
        });
    };

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
            setId(diagram.id);
            setGistId(diagram.gistId);
            setLoadedFromGistId(diagram.loadedFromGistId);
            setTitle(diagram.name);
            setTables(diagram.tables);
            setRelationships(diagram.references);
            setAreas(diagram.areas);
            setNotes(diagram.notes);
            setTasks(diagram.todos ?? []);
            setTransform({
              pan: diagram.pan || { x: 0, y: 0 },
              zoom: diagram.zoom || 1,
            });
            setUndoStack([]);
            setRedoStack([]);
            
            // Update URL with designId if gistId exists
            if (diagram.gistId) {
              const params = new URLSearchParams();
              params.set("designId", diagram.gistId);
              setSearchParams(params, { replace: true });
            }
            
            if (databases[database].hasTypes) {
              if (diagram.types) {
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
              } else {
                setTypes([]);
              }
            }
            if (databases[database].hasEnums) {
              setEnums(
                diagram.enums.map((e) =>
                  !e.id ? { ...e, id: nanoid() } : e,
                ) ?? [],
              );
            }
            window.name = `d ${diagram.id}`;
          } else {
            window.name = "";
          }
        })
        .catch((error) => {
          console.log(error);
        });
    };

    const loadTemplate = async (id) => {
      await db.templates
        .get(id)
        .then((diagram) => {
          if (diagram) {
            if (diagram.database) {
              setDatabase(diagram.database);
            } else {
              setDatabase(DB.GENERIC);
            }
            setId(diagram.id);
            setTitle(diagram.title);
            setTables(diagram.tables);
            setRelationships(diagram.relationships);
            setAreas(diagram.subjectAreas);
            setTasks(diagram.todos ?? []);
            setNotes(diagram.notes);
            setTransform({
              zoom: 1,
              pan: { x: 0, y: 0 },
            });
            setUndoStack([]);
            setRedoStack([]);
            if (databases[database].hasTypes) {
              if (diagram.types) {
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
              } else {
                setTypes([]);
              }
            }
            if (databases[database].hasEnums) {
              setEnums(
                diagram.enums.map((e) =>
                  !e.id ? { ...e, id: nanoid() } : e,
                ) ?? [],
              );
            }
          } else {
            // Chỉ hiện modal chọn DB nếu không có shareId hoặc designId
            if (selectedDb === "" && !searchParams.get("shareId") && !searchParams.get("designId")) {
              setShowSelectDbModal(true);
            }
          }
        })
        .catch((error) => {
          console.log(error);
          // Chỉ hiện modal chọn DB nếu không có shareId hoặc designId
          if (selectedDb === "" && !searchParams.get("shareId") && !searchParams.get("designId")) {
            setShowSelectDbModal(true);
          }
        });
    };

    // This is only used for reloading existing diagrams, not for initial load
    const shareId = searchParams.get("shareId");
    const designId = searchParams.get("designId");
    
    if (shareId) {
      const existingDiagram = await db.diagrams.get({
        loadedFromGistId: shareId,
      });

      if (existingDiagram) {
        window.name = "d " + existingDiagram.id;
        setId(existingDiagram.id);
      } else {
        window.name = "";
        setId(0);
      }
      await loadFromGist(shareId);
      return;
    }

    if (designId) {
      // Load design from server by designId
      setGistId(designId);
      await loadFromGist(designId);
      return;
    }

    // For new designs (no shareId or designId), don't load anything
    // Just initialize with empty state
    if (!shareId && !designId && window.name === "") {
      // Set default database if none selected
      if (selectedDb === "") {
        setShowSelectDbModal(true);
      }
      return;
    }

    if (window.name === "") {
      await loadLatestDiagram();
    } else {
      const name = window.name.split(" ");
      const op = name[0];
      const id = parseInt(name[1]);
      switch (op) {
        case "d": {
          await loadDiagram(id);
          break;
        }
        case "t":
        case "lt": {
          await loadTemplate(id);
          break;
        }
        default:
          break;
      }
    }
  }, [
    setTransform,
    setRedoStack,
    setUndoStack,
    setRelationships,
    setTables,
    setAreas,
    setNotes,
    setTypes,
    setTasks,
    setDatabase,
    database,
    setEnums,
    selectedDb,
    setSaveState,
    searchParams,
  ]);

  const returnToCurrentDiagram = async () => {
    await load();
    setLayout((prev) => ({ ...prev, readOnly: false }));
    setVersion(null);
  };

  // Manual save function - chỉ save khi user action
  const manualSave = useCallback(async () => {
    setSaveState(State.SAVING);
  }, [setSaveState]);

  // Bỏ auto save - chỉ manual save
  // useEffect(() => {
  //   // Auto save logic removed
  // }, []);

  useEffect(() => {
    if (layout.readOnly) return;

    if (saveState !== State.SAVING) return;

    save();
  }, [saveState, layout, save]);

  // Bỏ auto-sync to server - chỉ manual sync
  // useEffect(() => {
  //   if (saveState !== State.SAVED) return;
  //   if (!gistId) return;
  //   const syncTimer = setTimeout(() => {
  //     syncToServer();
  //   }, 500);
  //   return () => clearTimeout(syncTimer);
  // }, [saveState, gistId, syncToServer]);

  useEffect(() => {
    document.title = "Editor | drawDB";
  }, []);

  // Initialize editor when URL changes or component mounts
  useEffect(() => {
    initializeEditor();
  }, [initializeEditor]); // Run when URL params change or component mounts

  // Heartbeat - keep lock alive every 5 minutes
  useEffect(() => {
    if (!gistId || !sessionId) return;

    const heartbeatInterval = setInterval(async () => {
      try {
        await heartbeat(gistId, sessionId);
      } catch (error) {
        console.warn("Heartbeat failed:", error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(heartbeatInterval);
  }, [gistId, sessionId]);

  return (
    <div className="h-full flex flex-col overflow-hidden theme">
      <IdContext.Provider value={{ gistId, setGistId, version, setVersion, syncToServer, createManualSnapshot, manualSave }}>
        <ControlPanel
          diagramId={id}
          setDiagramId={setId}
          title={title}
          setTitle={setTitle}
          lastSaved={lastSaved}
          setLastSaved={setLastSaved}
        />
      </IdContext.Provider>
      <div
        className="flex h-full overflow-y-auto"
        onPointerUp={(e) => e.isPrimary && setResize(false)}
        onPointerLeave={(e) => e.isPrimary && setResize(false)}
        onPointerMove={(e) => e.isPrimary && handleResize(e)}
        onPointerDown={(e) => {
          // Required for onPointerLeave to trigger when a touch pointer leaves
          // https://stackoverflow.com/a/70976017/1137077
          e.target.releasePointerCapture(e.pointerId);
        }}
        style={isRtl(i18n.language) ? { direction: "rtl" } : {}}
      >
        {layout.sidebar && (
          <SidePanel resize={resize} setResize={setResize} width={width} />
        )}
        <div className="relative w-full h-full overflow-hidden">
          <CanvasContextProvider className="h-full w-full">
            <Canvas saveState={saveState} setSaveState={setSaveState} />
          </CanvasContextProvider>
          {version && (
            <div className="absolute right-8 top-2 space-x-2">
              <Button
                size="large"
                style={{ backgroundColor: 'white', color: 'black' }}
                icon={<i className="fa-solid fa-rotate-right mt-0.5"></i>}
                onClick={() => setShowRestoreModal(true)}
              >
                {t("restore_version")}
              </Button>
              <Button
                size="large"
                style={{ backgroundColor: 'white', color: 'black' }}
                onClick={returnToCurrentDiagram}
                icon={<i className="bi bi-arrow-return-right mt-1"></i>}
              >
                {t("return_to_current")}
              </Button>
            </div>
          )}
          {!(layout.sidebar || layout.toolbar || layout.header) && (
            <div className="fixed right-5 bottom-4">
              <FloatingControls />
            </div>
          )}
        </div>
      </div>
      <Modal
        centered
        size="medium"
        closable={false}
        hasCancel={false}
        title={t("pick_db")}
        okText={t("confirm")}
        visible={showSelectDbModal}
        onOk={() => {
          if (selectedDb === "") return;
          setDatabase(selectedDb);
          setShowSelectDbModal(false);
        }}
        okButtonProps={{ disabled: selectedDb === "" }}
      >
        <div className="grid grid-cols-3 gap-4 place-content-center">
          {Object.values(databases).map((x) => (
            <div
              key={x.name}
              onClick={() => setSelectedDb(x.label)}
              className={`space-y-3 p-3 rounded-md border-2 select-none ${
                settings.mode === "dark"
                  ? "bg-zinc-700 hover:bg-zinc-600"
                  : "bg-zinc-100 hover:bg-zinc-200"
              } ${selectedDb === x.label ? "border-zinc-400" : "border-transparent"}`}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold">{x.name}</div>
                {x.beta && (
                  <Tag size="small" color="light-blue">
                    Beta
                  </Tag>
                )}
              </div>
              {x.image && (
                <img
                  src={x.image}
                  className="h-8"
                  style={{
                    filter:
                      "opacity(0.4) drop-shadow(0 0 0 white) drop-shadow(0 0 0 white)",
                  }}
                />
              )}
              <div className="text-xs">{x.description}</div>
            </div>
          ))}
        </div>
      </Modal>
      <Modal
        visible={showRestoreModal}
        centered
        closable
        onCancel={() => setShowRestoreModal(false)}
        title={
          <span className="flex items-center gap-2">
            <IconAlertTriangle className="text-amber-400" size="extra-large" />{" "}
            {t("restore_version")}
          </span>
        }
        okText={t("continue")}
        cancelText={t("cancel")}
        onOk={() => {
          setLayout((prev) => ({ ...prev, readOnly: false }));
          setShowRestoreModal(false);
          setVersion(null);
        }}
      >
        {t("restore_warning")}
      </Modal>
    </div>
  );
}
