import { useCallback, useContext, useEffect, useState, useMemo, useRef } from "react";
import { IdContext } from "../../../context/IdContext";
import { useTranslation } from "react-i18next";
import { Button, Spin, Steps, Tag, Toast } from "@douyinfe/semi-ui";
import { IconPlus } from "@douyinfe/semi-icons";
import {
  create,
  getCommitsWithFile,
  getVersion,
  patch,
  get,
  VERSION_FILENAME,
  getVersions,
} from "../../../api/gists";
import _ from "lodash";
import { DateTime } from "luxon";
import {
  useAreas,
  useDiagram,
  useEnums,
  useLayout,
  useNotes,
  useTransform,
  useTypes,
} from "../../../hooks";
import { databases } from "../../../data/databases";
import { loadCache, saveCache } from "../../../utils/cache";

const LIMIT = 10;

export default function Versions({ open, title, setTitle }) {
  const { gistId, setGistId, version, setVersion, createManualSnapshot } = useContext(IdContext);
  const { areas, setAreas } = useAreas();
  const { setLayout } = useLayout();
  const { database, tables, relationships, setTables, setRelationships } =
    useDiagram();
  const { notes, setNotes } = useNotes();
  const { types, setTypes } = useTypes();
  const { enums, setEnums } = useEnums();
  const { transform } = useTransform();
  const { t, i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [versions, setVersions] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [loadingVersion, setLoadingVersion] = useState(null);
  const isLoadingRef = useRef(false);

  const cacheRef = useMemo(() => loadCache(), []);

  const diagramToString = useCallback(() => {
    return JSON.stringify({
      title,
      tables,
      relationships: relationships,
      notes: notes,
      subjectAreas: areas,
      database: database,
      ...(databases[database].hasTypes && { types: types }),
      ...(databases[database].hasEnums && { enums: enums }),
      transform: transform,
    });
  }, [
    areas,
    notes,
    tables,
    relationships,
    database,
    title,
    enums,
    types,
    transform,
  ]);

  const currentStep = useMemo(() => {
    if (!version) return 0;
    return versions.findIndex((v) => v.version_number && v.version_number.toString() === version);
  }, [version, versions]);

  const loadVersion = useCallback(
    async (versionNumber) => {
      try {
        setLoadingVersion(versionNumber);
        
        console.log("Loading version:", versionNumber, "for gistId:", gistId);
        
        // Get version data from backend
        const versionData = await getVersion(gistId, versionNumber);
        console.log("Version data loaded:", versionData);
        console.log("VERSION_FILENAME:", VERSION_FILENAME);
        console.log("versionData.data:", versionData?.data);
        console.log("versionData.data.files:", versionData?.data?.files);
        console.log("Available file keys:", versionData?.data?.files ? Object.keys(versionData.data.files) : "No files");
        
        // Check for data in any available file (share.json or versionned.json)
        let fileContent = null;
        let fileName = null;
        
        if (versionData && versionData.data && versionData.data.files) {
          // Try VERSION_FILENAME first, then fallback to any available file
          if (versionData.data.files[VERSION_FILENAME]) {
            fileContent = versionData.data.files[VERSION_FILENAME].content;
            fileName = VERSION_FILENAME;
          } else if (versionData.data.files["share.json"]) {
            fileContent = versionData.data.files["share.json"].content;
            fileName = "share.json";
          } else {
            // Try any available file
            const availableKeys = Object.keys(versionData.data.files);
            if (availableKeys.length > 0) {
              fileName = availableKeys[0];
              fileContent = versionData.data.files[fileName].content;
            }
          }
        }
        
        if (fileContent) {
          // Parse the content from the files structure
          const data = JSON.parse(fileContent);
          
          console.log("Using file:", fileName);
          console.log("Parsed version data:", data);
          
          // Update all diagram states with version data
          if (data.title !== undefined) setTitle(data.title);
          if (data.tables) setTables(data.tables);
          if (data.relationships) setRelationships(data.relationships);
          if (data.notes) setNotes(data.notes);
          if (data.subjectAreas) setAreas(data.subjectAreas);
          if (data.types) setTypes(data.types);
          if (data.enums) setEnums(data.enums);
          
          setVersion(versionNumber.toString());
          setLayout((prev) => ({ ...prev, readOnly: true }));
          
          Toast.success("Version loaded successfully");
        } else {
          console.error("Invalid response structure:", versionData);
          Toast.error("No data found for this version");
        }
        
      } catch (e) {
        console.error("Failed to load version:", e);
        Toast.error(t("Failed to load version"));
      } finally {
        setLoadingVersion(null);
      }
    },
    [
      gistId,
      t,
      setTitle,
      setTables,
      setRelationships,
      setNotes,
      setAreas,
      setTypes,
      setEnums,
      setVersion,
      setLayout,
    ],
  );

  const getRevisions = useCallback(
    async (cursorParam) => {
      try {
        if (!gistId) return;

        // Prevent multiple simultaneous calls
        if (isLoadingRef.current) {
          console.log("Already loading versions, skipping...");
          return;
        }

        isLoadingRef.current = true;
        setIsLoading(true);

        // Skip cache for now, always fetch fresh data
        console.log("Fetching versions for gistId:", gistId);
        const res = await getVersions(gistId);
        console.log("Versions API response:", res);

        const newVersions = res.data || [];
        console.log("Setting versions:", newVersions);
        setVersions(newVersions);
        setHasMore(false); // No pagination for now
        setCursor(null);

      } catch (e) {
        console.error("Failed to get versions:", e);
        Toast.error(t("Failed to get versions"));
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
      }
    },
    [gistId, t],
  );

  const backToCurrent = useCallback(async () => {
    try {
      setLoadingVersion("current");
      
      // Get current version data from backend
      const currentData = await get(gistId);
      if (currentData && currentData.data && currentData.data.files && currentData.data.files[VERSION_FILENAME]) {
        const data = JSON.parse(currentData.data.files[VERSION_FILENAME].content);
        
        // Update all diagram states with current data
        if (data.title) setTitle(data.title);
        if (data.tables) setTables(data.tables);
        if (data.relationships) setRelationships(data.relationships);
        if (data.notes) setNotes(data.notes);
        if (data.subjectAreas) setAreas(data.subjectAreas);
        if (data.types) setTypes(data.types);
        if (data.enums) setEnums(data.enums);
        
        setVersion("");
        setLayout((prev) => ({ ...prev, readOnly: false }));
        
        Toast.success("Back to current version");
      }
    } catch (e) {
      console.error("Failed to load current version:", e);
      Toast.error("Failed to load current version");
    } finally {
      setLoadingVersion(null);
    }
  }, [
    gistId,
    t,
    setTitle,
    setTables,
    setRelationships,
    setNotes,
    setAreas,
    setTypes,
    setEnums,
    setVersion,
    setLayout,
  ]);

  const hasDiagramChanged = async () => {
    if (!gistId) return true;

    const previousVersion = await get(gistId);

    if (!previousVersion.data.files[VERSION_FILENAME]) {
      return true;
    }

    const previousDiagram = JSON.parse(
      previousVersion.data.files[VERSION_FILENAME]?.content,
    );
    const currentDiagram = {
      title,
      tables,
      relationships: relationships,
      notes: notes,
      subjectAreas: areas,
      database: database,
      ...(databases[database].hasTypes && { types: types }),
      ...(databases[database].hasEnums && { enums: enums }),
      transform: transform,
    };

    return !_.isEqual(previousDiagram, currentDiagram);
  };

  const recordVersion = async () => {
    try {
      setIsRecording(true);
      
      if (!gistId) {
        Toast.info("Please save the diagram first");
        return;
      }
      
      // Get current diagram data
      const currentData = {
        title,
        tables,
        relationships: relationships,
        notes: notes,
        areas: areas,
        database: database,
        ...(databases[database].hasTypes && { types: types }),
        ...(databases[database].hasEnums && { enums: enums }),
        transform: transform,
      };
      
      // Create manual snapshot via backend
      await createManualSnapshot(currentData);
      
      // Refresh versions list
      await getRevisions();
      
    } catch (e) {
      console.error('Failed to record version:', e);
      Toast.error("Failed to record version");
    } finally {
      setIsRecording(false);
    }
  };

  useEffect(() => {
    if (gistId && open) {
      // Debounce the call to avoid spam
      const timer = setTimeout(() => {
        getRevisions();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [gistId, open, getRevisions]);

  return (
    <div className="mx-5 relative h-full">
      <div className="sticky top-0 z-10 sidesheet-theme pb-2 space-y-2">
        <div className="flex gap-2">
          <Button
            className="flex-1"
            icon={isRecording ? <Spin /> : <IconPlus />}
            disabled={isLoading || isRecording}
            onClick={recordVersion}
          >
            {t("record_version")}
          </Button>
          
          {version && (
            <Button
              type="tertiary"
              icon={<i className="fa-solid fa-rotate-right" />}
              onClick={() => window.location.reload()}
              title="Reload page"
            />
          )}
        </div>
      </div>

      {(!gistId || !versions.length) && !isLoading && (
        <div className="my-3">{t("no_saved_versions")}</div>
      )}
      {gistId && (
        <div className="my-3 overflow-y-auto">
          <Steps direction="vertical" type="basic" current={currentStep}>
            {versions.map((r) => (
              <Steps.Step
                key={r.version_number || r.version}
                onClick={() => loadVersion(r.version_number || r.version)}
                className="group"
                title={
                  <div className="flex justify-between items-center w-full">
                    <Tag>{r.version_name || `Version ${r.version_number || r.version}`}</Tag>
                    <span className="text-xs hidden group-hover:inline-block">
                      {t("click_to_view")}
                    </span>
                  </div>
                }
                description={`${t("commited_at")} ${DateTime.fromISO(
                  r.created_at || r.committed_at,
                )
                  .setLocale(i18n.language)
                  .toLocaleString(DateTime.DATETIME_MED)}`}
                icon={
                  (r.version_number || r.version) === loadingVersion ? (
                    <Spin size="small" />
                  ) : (
                    <i className="text-sm fa-solid fa-asterisk ms-1" />
                  )
                }
              />
            ))}
          </Steps>
        </div>
      )}
      {isLoading && !isRecording && (
        <div className="text-blue-500 text-center my-3">
          <Spin size="middle" />
          <div>{t("loading")}</div>
        </div>
      )}
      {hasMore && !isLoading && (
        <div className="text-center">
          <Button onClick={() => getRevisions(cursor)}>{t("load_more")}</Button>
        </div>
      )}
    </div>
  );
}
