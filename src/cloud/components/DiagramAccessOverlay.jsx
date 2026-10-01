import { useParams, useNavigate, useMatch } from "react-router-dom";
import { Button } from "@douyinfe/semi-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { db } from "../../data/db";
import { useAuth } from "../AuthContext";
import { linkInUrl, useOpened } from "../diagrams";

function Card({ icon, title, children }) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center backdrop-blur-sm"
      style={{ background: "rgba(var(--semi-grey-0), 0.85)" }}
    >
      <div className="max-w-md mx-4 p-6 rounded-lg border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-2)] shadow-lg text-center">
        <i className={`${icon} text-4xl opacity-60`} />
        <div className="text-lg font-semibold mt-3">{title}</div>
        {children}
      </div>
    </div>
  );
}

/** Signed in: the diagram in the link can't be opened. */
export function NoAccessOverlay() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const opened = useOpened(id);

  if (opened?.status !== "missing") return null;
  const badLink = opened.code === "link_invalid";
  return (
    <Card
      icon={badLink ? "bi bi-link-45deg" : "bi bi-lock"}
      title={t(badLink ? "cloud_link_invalid_title" : "cloud_no_access_title")}
    >
      <p className="opacity-80 mt-2">
        {badLink
          ? t("cloud_link_invalid")
          : t("cloud_no_access", { email: user?.email })}
      </p>
      <div className="flex justify-center gap-2 mt-5">
        <Button theme="solid" onClick={() => navigate("/diagrams")}>
          {t("cloud_my_diagrams")}
        </Button>
        <Button onClick={() => navigate("/editor")}>
          {t("cloud_new_diagram")}
        </Button>
      </div>
    </Card>
  );
}

/** Signed out, on a link to a diagram that isn't in this browser. */
export function SignInToOpenOverlay() {
  const { t } = useTranslation();
  const isDiagram = useMatch("/editor/diagrams/:id");
  const id = isDiagram?.params.id;
  const { available, user, openDialog } = useAuth();
  const opened = useOpened(id);
  const local = useLiveQuery(
    () => (id ? db.diagrams.where("diagramId").equals(id).count() : 0),
    [id],
  );

  if (!id || !available || user || local !== 0) return null;
  // A share link opens it without an account, unless the link is bad
  const withLink = Boolean(linkInUrl());
  if (withLink && opened?.status !== "missing") return null;
  return (
    <Card
      icon={withLink ? "bi bi-link-45deg" : "bi bi-person-lock"}
      title={t(withLink ? "cloud_link_invalid_title" : "cloud_sign_in_to_open")}
    >
      <p className="opacity-80 mt-2">
        {t(withLink ? "cloud_link_invalid" : "cloud_sign_in_to_open_hint")}
      </p>
      <Button
        theme="solid"
        className="mt-5"
        onClick={() => openDialog("signin")}
      >
        {t("cloud_sign_in")}
      </Button>
    </Card>
  );
}

/** Signed out with an edit link: viewing now, editing after signing in. */
export function SignInToEditBanner() {
  const { t } = useTranslation();
  const isDiagram = useMatch("/editor/diagrams/:id");
  const opened = useOpened(isDiagram?.params.id);
  const { user, openDialog } = useAuth();

  if (user || !opened?.signInToEdit) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-blue-300 bg-blue-50 px-5 py-1.5 shadow-md dark:border-sky-900/50 dark:bg-sky-900/30">
        <i className="bi bi-pencil-square" />
        <span className="text-sm">{t("cloud_sign_in_to_edit")}</span>
        <Button size="small" theme="solid" onClick={() => openDialog("signin")}>
          {t("cloud_sign_in")}
        </Button>
      </div>
    </div>
  );
}
