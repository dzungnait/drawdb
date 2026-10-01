import { useParams, useNavigate, useMatch } from "react-router-dom";
import { Button } from "@douyinfe/semi-ui";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { db } from "../../data/db";
import { useAuth } from "../AuthContext";
import { useIsMissing } from "../diagrams";

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
  const missing = useIsMissing(id);

  if (!missing) return null;
  return (
    <Card icon="bi bi-lock" title={t("cloud_no_access_title")}>
      <p className="opacity-80 mt-2">
        {t("cloud_no_access", { email: user?.email })}
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
  const local = useLiveQuery(
    () => (id ? db.diagrams.where("diagramId").equals(id).count() : 0),
    [id],
  );

  if (!id || !available || user || local !== 0) return null;
  return (
    <Card icon="bi bi-person-lock" title={t("cloud_sign_in_to_open")}>
      <p className="opacity-80 mt-2">{t("cloud_sign_in_to_open_hint")}</p>
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
