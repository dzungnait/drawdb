import { Button, Tag } from "@douyinfe/semi-ui";
import { useCollaboration } from "../../hooks";
import { requestEditSlot } from "../../services/collaboration";
import { useTranslation } from "react-i18next";

export default function CollaborationBanner() {
  const { connected, myRole, users } = useCollaboration() || {};
  const { t } = useTranslation();

  if (!connected) return null;
  if (myRole !== "viewer") return null;

  const editorCount = users?.filter((u) => u.role === "editor").length || 0;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 border border-amber-300 shadow-md">
      <i className="fa-solid fa-eye text-amber-600" />
      <span className="text-sm text-amber-800">
        {t("view_mode_collab", {
          count: editorCount,
          defaultValue: `View only — ${editorCount}/15 editor slots in use`,
        })}
      </span>
      <Button
        size="small"
        theme="solid"
        type="warning"
        onClick={() => requestEditSlot()}
      >
        {t("request_edit_slot", { defaultValue: "Request edit slot" })}
      </Button>
    </div>
  );
}
