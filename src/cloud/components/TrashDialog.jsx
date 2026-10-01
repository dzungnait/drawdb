import { useCallback, useEffect, useState } from "react";
import {
  Banner,
  Button,
  Modal,
  Popconfirm,
  Spin,
  Toast,
} from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { diagramsApi } from "../diagrams";
import { errorCode } from "../api";
import { errorMessage } from "../i18n";
import { databases } from "../../data/databases";

export default function TrashDialog() {
  const { t } = useTranslation();
  const { closeDialog } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    diagramsApi
      .trash()
      .then(setItems)
      .catch((e) => setError(errorMessage(t, errorCode(e))));
  }, [t]);

  useEffect(load, [load]);

  const act = async (id, fn, message) => {
    setBusy(id);
    try {
      await fn(id);
      setItems((prev) => prev.filter((d) => d.diagramId !== id));
      Toast.success(message);
    } catch (e) {
      Toast.error(errorMessage(t, errorCode(e)));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      title={t("cloud_trash")}
      visible
      onCancel={closeDialog}
      footer={null}
      width={600}
      centered
    >
      <div className="pb-4">
        <div className="text-sm opacity-70 mb-3">{t("cloud_trash_hint")}</div>
        {error && <Banner type="danger" description={error} closeIcon={null} />}
        {!items && !error && (
          <div className="flex justify-center py-8">
            <Spin />
          </div>
        )}
        {items?.length === 0 && (
          <div className="text-center py-8 opacity-70">
            {t("cloud_trash_empty")}
          </div>
        )}
        {items?.length > 0 && (
          <div className="max-h-[360px] overflow-auto divide-y divide-[var(--semi-color-border)]">
            {items.map((d) => (
              <div key={d.diagramId} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {d.name || "Untitled diagram"}
                  </div>
                  <div className="text-xs opacity-70">
                    {databases[d.database]?.name ?? d.database} ·{" "}
                    {t("cloud_deleted_at", {
                      date: new Date(d.deletedAt).toLocaleString(),
                    })}
                  </div>
                </div>
                <Button
                  size="small"
                  loading={busy === d.diagramId}
                  onClick={() =>
                    act(d.diagramId, diagramsApi.restore, t("cloud_restored"))
                  }
                >
                  {t("cloud_restore")}
                </Button>
                <Popconfirm
                  title={t("cloud_delete_forever")}
                  content={t("cloud_delete_forever_confirm")}
                  onConfirm={() =>
                    act(
                      d.diagramId,
                      diagramsApi.removeForever,
                      t("cloud_deleted_forever"),
                    )
                  }
                >
                  <Button size="small" type="danger">
                    {t("cloud_delete_forever")}
                  </Button>
                </Popconfirm>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
