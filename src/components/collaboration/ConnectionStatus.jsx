import { useCollaboration } from "../../hooks";
import { useTranslation } from "react-i18next";

export default function ConnectionStatus() {
  const { connected, reconnecting } = useCollaboration() || {};
  const { t } = useTranslation();

  if (connected || (!connected && !reconnecting)) return null;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-100 border border-yellow-400 text-yellow-800 text-sm font-medium shadow-md">
      <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
      {t("reconnecting") || "Reconnecting..."}
    </div>
  );
}
