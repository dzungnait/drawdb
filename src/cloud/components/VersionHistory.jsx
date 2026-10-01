import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Button,
  Dropdown,
  Input,
  Modal,
  Spin,
  Toast,
  Tooltip,
} from "@douyinfe/semi-ui";
import { IconMore, IconPlus } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { DateTime } from "luxon";
import { useLayout } from "../../hooks";
import { DB } from "../../data/constants";
import Migration from "../../components/EditorHeader/SideSheet/Migration";
import { errorCode } from "../api";
import { adoptDiagram, flushSaves, isCloudDiagram } from "../diagrams";
import { historyApi } from "../history";
import { errorMessage } from "../i18n";
import { previewStore, usePreview } from "../preview";
import useEditorState from "../useEditorState";

export const formatDate = (iso, language) =>
  DateTime.fromISO(iso)
    .setLocale(language)
    .toLocaleString(DateTime.DATETIME_MED);

export function confirmRestore(t, onOk) {
  Modal.confirm({
    title: t("cloud_history_restore"),
    content: t("cloud_history_restore_confirm"),
    okText: t("cloud_history_restore"),
    cancelText: t("cancel"),
    centered: true,
    onOk,
  });
}

/** The diagram as JSON in the shape upstream's migration generator reads. */
const toMigrationJson = (d) =>
  JSON.stringify({
    title: d.name,
    database: d.database,
    tables: d.tables ?? [],
    relationships: d.references ?? [],
    notes: d.notes ?? [],
    subjectAreas: d.areas ?? [],
    views: d.views ?? [],
    types: d.types ?? [],
    enums: d.enums ?? [],
  });

/** Replaces upstream's gist-based panel in the Versions side sheet. */
export default function VersionHistory({ title, setTitle }) {
  const { t } = useTranslation();
  const { id } = useParams();

  if (!id || id === "blank") return <Hint text={t("cloud_history_unsaved")} />;
  if (!isCloudDiagram(id)) return <Hint text={t("cloud_history_local")} />;
  return <History key={id} diagramId={id} title={title} setTitle={setTitle} />;
}

const Hint = ({ text }) => <div className="mx-5 my-3 opacity-80">{text}</div>;

function History({ diagramId, title, setTitle }) {
  const { t, i18n } = useTranslation();
  const { setLayout } = useLayout();
  const editor = useEditorState(title, setTitle);
  const preview = usePreview();
  const previewing = preview?.diagramId === diagramId ? preview : null;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  // { version (null for a new one), label } while the name dialog is open
  const [naming, setNaming] = useState(null);
  const [compare, setCompare] = useState(null);

  const date = (iso) => formatDate(iso, i18n.language);
  const by = (author) =>
    t("cloud_history_by", {
      name: author?.username ?? t("cloud_history_deleted_user"),
    });

  const fail = useCallback(
    (e) =>
      Toast.error(
        e?.message === "save_pending"
          ? t("cloud_history_unsaved_changes")
          : errorMessage(t, errorCode(e)),
      ),
    [t],
  );

  const reload = useCallback(async () => {
    try {
      setData(await historyApi.list(diagramId));
      setError(null);
    } catch (e) {
      setError(errorMessage(t, errorCode(e)));
    }
  }, [diagramId, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  // Kept in the preview store and called from the banner too, possibly
  // after this panel closed: only setters and module functions inside
  const restore = async (version) => {
    try {
      await flushSaves(diagramId);
      const diagram = await historyApi.restore(diagramId, version.id);
      previewStore.set(null);
      adoptDiagram(diagram);
      editor.apply(diagram);
      setLayout((prev) => ({ ...prev, readOnly: !diagram.canWrite }));
      Toast.success(t("cloud_history_restored"));
      reload();
    } catch (e) {
      fail(e);
    }
  };

  const show = (version) =>
    run(version.id, async () => {
      const { diagram } = await historyApi.get(diagramId, version.id);
      let original = previewStore.get()?.original;
      if (!previewing) {
        // Store pending edits first: they're part of the current state
        await flushSaves(diagramId);
        original = editor.capture();
        setLayout((prev) => ({ ...prev, readOnly: true }));
      }
      const exit = () => {
        previewStore.set(null);
        editor.apply(original);
        setLayout((prev) => ({ ...prev, readOnly: false }));
      };
      // Set before the editor changes, so the change isn't saved
      previewStore.set({
        diagramId,
        version,
        original,
        exit,
        restore: () => restore(version),
      });
      editor.apply(diagram);
    });

  const loadMore = () =>
    run("more", async () => {
      const before = data.versions[data.versions.length - 1].id;
      const next = await historyApi.list(diagramId, { before });
      setData((prev) => ({
        ...next,
        versions: [...prev.versions, ...next.versions],
      }));
    });

  const submitName = () =>
    run("name", async () => {
      const label = naming.label.trim();
      if (naming.version) {
        const updated = await historyApi.rename(
          diagramId,
          naming.version.id,
          label,
        );
        setData((prev) => ({
          ...prev,
          versions: prev.versions.map((v) =>
            v.id === updated.id ? updated : v,
          ),
        }));
      } else {
        await flushSaves(diagramId);
        await historyApi.create(diagramId, label);
        Toast.success(t("cloud_history_saved"));
        await reload();
      }
      setNaming(null);
    });

  const remove = (version) =>
    Modal.confirm({
      title: t("cloud_history_delete"),
      content: t("cloud_history_delete_confirm"),
      okText: t("cloud_history_delete"),
      okButtonProps: { type: "danger" },
      cancelText: t("cancel"),
      centered: true,
      onOk: async () => {
        try {
          await historyApi.remove(diagramId, version.id);
          if (previewing?.version.id === version.id) previewing.exit();
          setData((prev) => ({
            ...prev,
            versions: prev.versions.filter((v) => v.id !== version.id),
          }));
        } catch (e) {
          fail(e);
        }
      },
    });

  const current = () => previewing?.original ?? editor.capture();
  const migrationUnsupported = current().database === DB.GENERIC;

  const compareWithCurrent = (version) => {
    const now = current();
    setCompare({
      key: `${version.id}:current`,
      load: async () => ({
        contentA: toMigrationJson(now),
        contentB: toMigrationJson(
          (await historyApi.get(diagramId, version.id)).diagram,
        ),
      }),
    });
  };

  const compareWithPrevious = (version, previous) =>
    setCompare({
      key: `${version.id}:${previous.id}`,
      load: async () => {
        const [a, b] = await Promise.all([
          historyApi.get(diagramId, version.id),
          historyApi.get(diagramId, previous.id),
        ]);
        return {
          contentA: toMigrationJson(a.diagram),
          contentB: toMigrationJson(b.diagram),
        };
      },
    });

  const menu = (version, previous) => {
    const compareItem = (label, onClick, disabled) => (
      <Dropdown.Item
        disabled={disabled || migrationUnsupported}
        onClick={onClick}
      >
        {migrationUnsupported ? (
          <Tooltip content={t("migration_not_supported_generic")}>
            {label}
          </Tooltip>
        ) : (
          label
        )}
      </Dropdown.Item>
    );
    return (
      <Dropdown.Menu>
        <Dropdown.Item
          onClick={() => confirmRestore(t, () => restore(version))}
        >
          {t("cloud_history_restore")}
        </Dropdown.Item>
        {compareItem(t("cloud_history_compare_current"), () =>
          compareWithCurrent(version),
        )}
        {compareItem(
          t("cloud_history_compare_previous"),
          () => compareWithPrevious(version, previous),
          !previous,
        )}
        <Dropdown.Divider />
        <Dropdown.Item
          onClick={() => setNaming({ version, label: version.label ?? "" })}
        >
          {version.label ? t("cloud_history_rename") : t("cloud_history_name")}
        </Dropdown.Item>
        <Dropdown.Item type="danger" onClick={() => remove(version)}>
          {t("cloud_history_delete")}
        </Dropdown.Item>
      </Dropdown.Menu>
    );
  };

  const row = (active) =>
    `flex items-center gap-2 px-5 py-2 cursor-pointer hover-1 ${
      active ? "bg-[var(--semi-color-primary-light-default)]" : ""
    }`;

  return (
    <div className="pb-4">
      <div className="sticky top-0 z-10 sidesheet-theme px-5 pb-3">
        {previewing ? (
          <div className="flex gap-2">
            <Button
              theme="solid"
              className="flex-1"
              onClick={() => confirmRestore(t, previewing.restore)}
            >
              {t("cloud_history_restore")}
            </Button>
            <Button className="flex-1" onClick={previewing.exit}>
              {t("cloud_history_back")}
            </Button>
          </div>
        ) : (
          <Button
            block
            icon={<IconPlus />}
            disabled={!data}
            onClick={() => setNaming({ version: null, label: "" })}
          >
            {t("cloud_history_save")}
          </Button>
        )}
        <div className="text-xs opacity-70 mt-2">{t("cloud_history_hint")}</div>
      </div>

      {error && <Hint text={error} />}
      {!data && !error && (
        <div className="flex justify-center py-8">
          <Spin />
        </div>
      )}

      {data && (
        <>
          <div
            className={row(!previewing)}
            onClick={previewing ? previewing.exit : undefined}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium">{t("cloud_history_current")}</div>
              <div className="text-xs opacity-70">
                {by(data.current.author)}
              </div>
            </div>
          </div>
          {data.versions.map((v, i) => (
            <div
              key={v.id}
              className={row(previewing?.version.id === v.id)}
              onClick={() => show(v)}
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {v.label || date(v.createdAt)}
                </div>
                <div className="text-xs opacity-70 truncate">
                  {v.label && `${date(v.createdAt)} · `}
                  {t(`cloud_history_kind.${v.kind}`)} · {by(v.author)}
                </div>
              </div>
              {busy === v.id && <Spin size="small" />}
              {/* Menu clicks bubble through the portal; don't open the row */}
              <div onClick={(e) => e.stopPropagation()}>
                <Dropdown
                  trigger="click"
                  position="bottomRight"
                  clickToHide
                  render={menu(v, data.versions[i + 1])}
                >
                  <Button
                    size="small"
                    theme="borderless"
                    type="tertiary"
                    icon={<IconMore />}
                    aria-label="More"
                  />
                </Dropdown>
              </div>
            </div>
          ))}
          {data.versions.length === 0 && (
            <Hint text={t("cloud_history_empty")} />
          )}
          {data.hasMore && (
            <div className="text-center mt-2">
              <Button loading={busy === "more"} onClick={loadMore}>
                {t("load_more")}
              </Button>
            </div>
          )}
        </>
      )}

      <Modal
        title={
          naming?.version
            ? naming.version.label
              ? t("cloud_history_rename")
              : t("cloud_history_name")
            : t("cloud_history_save")
        }
        visible={Boolean(naming)}
        onCancel={() => setNaming(null)}
        onOk={submitName}
        okButtonProps={{ loading: busy === "name" }}
        okText={t("cloud_save")}
        cancelText={t("cancel")}
        centered
        width={420}
      >
        <Input
          autoFocus
          value={naming?.label ?? ""}
          maxLength={100}
          placeholder={t("cloud_history_name_placeholder")}
          onChange={(label) => setNaming((prev) => ({ ...prev, label }))}
          onEnterPress={submitName}
        />
      </Modal>

      <Migration
        selectedVersion={compare?.key ?? null}
        setSelectedVersion={() => setCompare(null)}
        loadContents={compare?.load}
      />
    </div>
  );
}
