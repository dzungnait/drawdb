import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { previewStore, usePreview } from "../preview";
import { confirmRestore, formatDate } from "./VersionHistory";

/** Over the canvas while an old version is shown instead of the diagram. */
export default function VersionPreviewBanner() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const preview = usePreview();
  const stale = preview && preview.diagramId !== id;

  // Another diagram was opened: that one is loaded fresh
  useEffect(() => {
    if (stale) previewStore.set(null);
  }, [stale]);

  if (!preview || stale) return null;
  const { version } = preview;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-blue-300 bg-blue-50 px-5 py-1.5 shadow-md dark:border-sky-900/50 dark:bg-sky-900/30">
        <i className="bi bi-clock-history" />
        <span className="text-sm">
          {t("cloud_history_viewing", {
            date: formatDate(version.createdAt, i18n.language),
          })}
          {version.label && <b> · {version.label}</b>}
        </span>
        <Button
          size="small"
          theme="solid"
          onClick={() => confirmRestore(t, preview.restore)}
        >
          {t("cloud_history_restore")}
        </Button>
        <Button size="small" onClick={preview.exit}>
          {t("cloud_history_back")}
        </Button>
      </div>
    </div>
  );
}
