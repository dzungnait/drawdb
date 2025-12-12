import { Banner, Button, Input, Spin, Toast } from "@douyinfe/semi-ui";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { IdContext } from "../../Workspace";
import { IconLink } from "@douyinfe/semi-icons";
import {
  useAreas,
  useDiagram,
  useEnums,
  useNotes,
  useTransform,
  useTypes,
  useSaveState,
} from "../../../hooks";
import { databases } from "../../../data/databases";
import { MODAL } from "../../../data/constants";
import { create, patch, del, SHARE_FILENAME } from "../../../api/gists";
import { lock, unlock } from "../../../api/lock";

export default function Share({ title, setModal }) {
  const { t } = useTranslation();
  const { gistId, setGistId } = useContext(IdContext);
  const { sessionId } = useSaveState();
  const [loading, setLoading] = useState(true);
  const { tables, relationships, database } = useDiagram();
  const { notes } = useNotes();
  const { areas } = useAreas();
  const { types } = useTypes();
  const { enums } = useEnums();
  const { transform } = useTransform();
  const [error, setError] = useState(null);
  const url =
    window.location.origin + window.location.pathname + "?shareId=" + gistId;

  const diagramToString = useCallback(() => {
    return JSON.stringify({
      title,
      tables: tables,
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

  const unshare = useCallback(async () => {
    try {
      if (sessionId) {
        await lock(gistId, sessionId);
      }
      
      try {
        await del(gistId);
        setGistId("");
        setModal(MODAL.NONE);
      } finally {
        if (sessionId) {
          await unlock(gistId, sessionId);
        }
      }
    } catch (e) {
      console.error(e);
      setError(e);
    }
  }, [gistId, setModal, setGistId, sessionId]);

  useEffect(() => {
    const updateOrGenerateLink = async () => {
      try {
        setLoading(true);
        const newGistId = gistId || "";

        if (!newGistId || newGistId === "") {
          // Create new share
          const id = await create(SHARE_FILENAME, diagramToString());
          setGistId(id);
        } else {
          // Update existing share with lock
          if (sessionId) {
            await lock(newGistId, sessionId);
          }

          try {
            await patch(newGistId, SHARE_FILENAME, diagramToString());
          } finally {
            // Release lock
            if (sessionId) {
              await unlock(newGistId, sessionId);
            }
          }
        }
      } catch (e) {
        setError(e);
      } finally {
        setLoading(false);
      }
    };
    updateOrGenerateLink();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyLink = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        Toast.success(t("copied_to_clipboard"));
      })
      .catch(() => {
        Toast.error(t("oops_smth_went_wrong"));
      });
  };

  if (loading)
    return (
      <div className="text-blue-500 text-center">
        <Spin size="middle" />
        <div>{t("loading")}</div>
      </div>
    );

  return (
    <div>
      {error && (
        <Banner
          description={t("oops_smth_went_wrong")}
          type="danger"
          closeIcon={null}
          fullMode={false}
        />
      )}
      {!error && (
        <>
          <div className="flex gap-3">
            <Input value={url} size="large" readonly />
          </div>
          <div className="text-xs mt-2">{t("share_info")}</div>
          <div className="flex gap-2 mt-3">
            <Button block onClick={unshare}>
              {t("unshare")}
            </Button>
            <Button block theme="solid" icon={<IconLink />} onClick={copyLink}>
              {t("copy_link")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
