import { Tooltip, Tag } from "@douyinfe/semi-ui";
import { useCollaboration } from "../../hooks";
import { useTranslation } from "react-i18next";

export default function PresenceBar() {
  const { connected, myRole, myNickname, myColor, users } = useCollaboration() || {};
  const { t } = useTranslation();

  if (!connected || !users || users.length === 0) return null;

  const otherUsers = users.filter(
    (u) => u.nickname !== myNickname || u.color !== myColor,
  );

  return (
    <div className="flex items-center gap-1.5">
      {/* My avatar */}
      <Tooltip
        content={`${myNickname} (${t("you")}) - ${myRole === "editor" ? t("editing") : t("viewing")}`}
        position="bottom"
      >
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-default ring-2 ring-white"
          style={{ backgroundColor: myColor }}
        >
          {myNickname?.charAt(0) || "?"}
        </div>
      </Tooltip>

      {/* Other users */}
      {otherUsers.slice(0, 10).map((user) => (
        <Tooltip
          key={user.socketId}
          content={`${user.nickname} - ${user.role === "editor" ? t("editing") : t("viewing")}`}
          position="bottom"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-default"
            style={{ backgroundColor: user.color }}
          >
            {user.nickname?.charAt(0) || "?"}
          </div>
        </Tooltip>
      ))}

      {/* Overflow count */}
      {otherUsers.length > 10 && (
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-gray-400 text-white">
          +{otherUsers.length - 10}
        </div>
      )}

      {/* Connection + role indicator */}
      <Tag
        size="small"
        color={myRole === "editor" ? "green" : "orange"}
        style={{ marginLeft: 4 }}
      >
        {myRole === "editor" ? t("editor") : t("viewer")}
      </Tag>

      {/* Online count */}
      <span className="text-xs opacity-60 ml-1">
        {users.length} {t("online")}
      </span>
    </div>
  );
}
