import { useParams } from "react-router-dom";
import {
  Avatar,
  AvatarGroup,
  Popover,
  Switch,
  Tooltip,
} from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useSession, useSessionState } from "./CollabBridge";
import { setShowCursors, useShowCursors } from "./LiveCursors";

const STATUS_COLORS = {
  live: "bg-green-500",
  connecting: "bg-amber-400",
  offline: "bg-red-500",
  closed: "bg-zinc-400",
};

const initials = (name) =>
  (name || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** In the editor's header: connection status and who else has it open. */
export default function PresenceBar() {
  const { t } = useTranslation();
  const { id } = useParams();
  const session = useSessionState(useSession(id));
  const showCursors = useShowCursors();
  if (!session) return null;

  // One avatar per person, even with several tabs open
  const people = [];
  const seen = new Set([session.self?.userId]);
  let guests = 0;
  for (const peer of session.peers.values()) {
    if (!peer.userId) guests++;
    else if (!seen.has(peer.userId)) {
      seen.add(peer.userId);
      people.push(peer);
    }
  }

  const status = (
    <span className="flex items-center gap-1.5 text-xs opacity-80">
      <span
        className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[session.status]}`}
      />
      {t(`cloud_live_${session.status}`)}
    </span>
  );

  const details = (
    <div className="p-3 w-64 popover-theme">
      <div className="mb-2">{status}</div>
      <div className="text-xs opacity-70 mb-2">
        {people.length || guests
          ? t("cloud_live_others", { count: people.length + guests })
          : t("cloud_live_alone")}
      </div>
      {people.map((p) => (
        <div key={p.sid} className="flex items-center gap-2 py-1">
          <Avatar size="extra-small" style={{ backgroundColor: p.color }}>
            {initials(p.name)}
          </Avatar>
          <span className="truncate">{p.name}</span>
          {p.role === "viewer" && (
            <span className="text-xs opacity-60">{t("cloud_role.viewer")}</span>
          )}
        </div>
      ))}
      {guests > 0 && (
        <div className="text-xs opacity-70 py-1">
          {t("cloud_live_guests", { count: guests })}
        </div>
      )}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-[var(--semi-color-border)]">
        <span className="text-sm">{t("cloud_live_show_cursors")}</span>
        <Switch size="small" checked={showCursors} onChange={setShowCursors} />
      </div>
    </div>
  );

  return (
    <Popover content={details} trigger="click" position="bottomRight">
      <button
        className="flex items-center gap-2 px-2 py-1 rounded-md hover-2"
        aria-label={t("cloud_live_who")}
      >
        <Tooltip content={t(`cloud_live_${session.status}`)}>
          <span
            className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[session.status]}`}
          />
        </Tooltip>
        {(people.length > 0 || guests > 0) && (
          <AvatarGroup size="small" maxCount={4}>
            {[
              ...people.map((p) => (
                <Avatar
                  key={p.sid}
                  size="small"
                  alt={p.name}
                  src={p.avatarUrl ?? undefined}
                  style={{
                    backgroundColor: p.color,
                    border: `2px solid ${p.color}`,
                  }}
                >
                  {initials(p.name)}
                </Avatar>
              )),
              ...(guests > 0
                ? [
                    <Avatar key="guests" size="small">
                      +{guests}
                    </Avatar>,
                  ]
                : []),
            ]}
          </AvatarGroup>
        )}
      </button>
    </Popover>
  );
}
