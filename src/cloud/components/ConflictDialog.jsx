import { useEffect, useState } from "react";
import { Button, Modal, Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useSaveState } from "../../hooks";
import { State } from "../../data/constants";
import { discard, onConflict, overwrite, saveAsCopy } from "../diagrams";

/**
 * Shown when a save is rejected because the diagram changed elsewhere
 * (another tab, device or person). Lives inside the editor so it can
 * update the save indicator.
 */
export default function ConflictDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setSaveState } = useSaveState();
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => onConflict((c) => setConflict((prev) => prev ?? c)), []);

  if (!conflict) return null;

  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
      setConflict(null);
    } catch {
      Toast.error(t("cloud_error.unknown"));
    } finally {
      setBusy(null);
    }
  };

  const keepMine = () =>
    run("mine", async () => {
      await overwrite(conflict.diagramId);
      setSaveState(State.SAVED);
    });

  const keepBoth = () =>
    run("copy", async () => {
      const newId = await saveAsCopy(conflict.diagramId);
      navigate(`/editor/diagrams/${newId}`);
      Toast.success(t("cloud_saved_as_copy"));
    });

  const takeTheirs = () =>
    run("theirs", async () => {
      discard(conflict.diagramId);
      window.location.reload();
    });

  return (
    <Modal
      title={t("cloud_conflict_title")}
      visible
      closable={false}
      maskClosable={false}
      footer={null}
      centered
      width={460}
    >
      <p className="mb-5">{t("cloud_conflict_body")}</p>
      <div className="flex flex-col gap-2 pb-4">
        <Button
          theme="solid"
          block
          onClick={takeTheirs}
          loading={busy === "theirs"}
        >
          {t("cloud_conflict_load_latest")}
        </Button>
        <Button block onClick={keepBoth} loading={busy === "copy"}>
          {t("cloud_conflict_save_copy")}
        </Button>
        <Button
          type="danger"
          block
          onClick={keepMine}
          loading={busy === "mine"}
        >
          {t("cloud_conflict_overwrite")}
        </Button>
      </div>
    </Modal>
  );
}
