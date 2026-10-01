import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Modal,
  Select,
  Spin,
  Switch,
  Toast,
  Tooltip,
} from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { DateTime } from "luxon";
import { errorCode } from "../api";
import { errorMessage } from "../i18n";
import { linksApi, shareLinkUrl } from "../sharing";

const DAY = 24 * 60 * 60 * 1000;
const EXPIRY_OPTIONS = [null, 1, 7, 30];

/** The owner's view and edit links for a diagram. */
export default function LinkSharing({ diagramId }) {
  const { t } = useTranslation();
  const [links, setLinks] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    linksApi
      .list(diagramId)
      .then(setLinks)
      .catch(() => setLinks([]));
  }, [diagramId]);

  const run = async (key, fn) => {
    setBusy(key);
    try {
      setLinks(await fn());
    } catch (e) {
      Toast.error(errorMessage(t, errorCode(e)));
    } finally {
      setBusy(null);
    }
  };

  if (!links) {
    return (
      <div className="flex justify-center py-4">
        <Spin />
      </div>
    );
  }

  return (
    <div className="mt-4 pt-3 border-t border-[var(--semi-color-border)]">
      <div className="font-semibold mb-2">{t("cloud_link_sharing")}</div>
      {["viewer", "editor"].map((role) => (
        <LinkRow
          key={role}
          role={role}
          diagramId={diagramId}
          link={links.find((l) => l.role === role)}
          busy={busy === role}
          run={(fn) => run(role, fn)}
        />
      ))}
    </div>
  );
}

function LinkRow({ role, diagramId, link, busy, run }) {
  const { t, i18n } = useTranslation();
  const url = link && shareLinkUrl(diagramId, link.token);

  const toggle = (on) =>
    run(() =>
      on
        ? linksApi.set(diagramId, role, null)
        : linksApi.remove(diagramId, role),
    );

  const setExpiry = (days) =>
    run(() =>
      linksApi.set(
        diagramId,
        role,
        days ? new Date(Date.now() + days * DAY).toISOString() : null,
      ),
    );

  const regenerate = () =>
    Modal.confirm({
      title: t("cloud_link_regenerate"),
      content: t("cloud_link_regenerate_confirm"),
      okText: t("cloud_link_regenerate"),
      cancelText: t("cancel"),
      centered: true,
      onOk: () => run(() => linksApi.regenerate(diagramId, role)),
    });

  const copy = () =>
    navigator.clipboard
      .writeText(url)
      .then(() => Toast.success(t("cloud_link_copied")))
      .catch(() => Toast.error(t("cloud_error.unknown")));

  const expiry = link?.expiresAt
    ? t(link.expired ? "cloud_link_expired_at" : "cloud_link_expires_at", {
        date: DateTime.fromISO(link.expiresAt)
          .setLocale(i18n.language)
          .toLocaleString(DateTime.DATETIME_MED),
      })
    : null;

  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <i
          className={`bi ${role === "viewer" ? "bi-eye" : "bi-pencil"} opacity-70`}
        />
        <div className="flex-1">
          <div>{t(`cloud_link_${role}`)}</div>
          <div className="text-xs opacity-70">
            {t(`cloud_link_${role}_hint`)}
          </div>
        </div>
        <Switch
          checked={Boolean(link)}
          loading={busy}
          onChange={toggle}
          aria-label={t(`cloud_link_${role}`)}
        />
      </div>
      {link && (
        <div className="ms-7 mt-2 space-y-2">
          <div className="flex gap-2">
            <Input value={url} readonly size="small" />
            <Button size="small" onClick={copy} disabled={link.expired}>
              {t("cloud_copy_link")}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Select
              size="small"
              value={link.expiresAt ? undefined : null}
              placeholder={expiry}
              onChange={setExpiry}
              optionList={EXPIRY_OPTIONS.map((days) => ({
                value: days,
                label: days
                  ? t("cloud_link_expires_in", { count: days })
                  : t("cloud_link_never_expires"),
              }))}
              style={{ width: 230 }}
              className={link.expired ? "!text-red-500" : ""}
            />
            <Tooltip content={t("cloud_link_regenerate_confirm")}>
              <Button
                size="small"
                theme="borderless"
                icon={<i className="bi bi-arrow-repeat" />}
                onClick={regenerate}
              >
                {t("cloud_link_regenerate")}
              </Button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}
