import { useEffect, useState } from "react";
import { Button, Select, Toast, Tooltip } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { errorCode } from "../api";
import { errorMessage } from "../i18n";
import { teamSharesApi, teamsApi } from "../teams";

/**
 * Teams the diagram is shared with. The owner can share it with their
 * own teams and change or remove access; others just see the list.
 */
export default function TeamSharing({ diagramId, teams, isOwner, onChange }) {
  const { t } = useTranslation();
  const [myTeams, setMyTeams] = useState(null);
  const [teamId, setTeamId] = useState(null);
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!isOwner) return;
    teamsApi
      .list()
      .then(setMyTeams)
      .catch(() => setMyTeams([]));
  }, [isOwner]);

  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
      onChange();
    } catch (e) {
      Toast.error(errorMessage(t, errorCode(e)));
    } finally {
      setBusy(null);
    }
  };

  const roleOptions = ["editor", "viewer"].map((r) => ({
    value: r,
    label: t(`cloud_role.${r}`),
  }));
  const available = (myTeams ?? []).filter(
    (team) => !teams.some((shared) => shared.id === team.id),
  );

  if (!isOwner && teams.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-[var(--semi-color-border)]">
      <div className="font-semibold mb-2">{t("cloud_teams_with_access")}</div>
      {isOwner && available.length > 0 && (
        <div className="flex gap-2 mb-2">
          <Select
            value={teamId}
            onChange={setTeamId}
            placeholder={t("cloud_pick_team")}
            optionList={available.map((team) => ({
              value: team.id,
              label: team.name,
            }))}
            style={{ flex: 1 }}
          />
          <Select
            value={role}
            onChange={setRole}
            optionList={roleOptions}
            style={{ width: 170 }}
          />
          <Button
            theme="solid"
            disabled={!teamId}
            loading={busy === "share"}
            onClick={() =>
              run("share", async () => {
                await teamSharesApi.share(diagramId, teamId, role);
                setTeamId(null);
              })
            }
          >
            {t("cloud_share_button")}
          </Button>
        </div>
      )}
      {isOwner && myTeams?.length === 0 && teams.length === 0 && (
        <div className="text-xs opacity-70">{t("cloud_no_teams_to_share")}</div>
      )}
      {teams.map((team) => (
        <div key={team.id} className="flex items-center gap-3 py-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--semi-color-fill-0)]">
            <i className="bi bi-people" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate">{team.name}</div>
            <div className="text-xs opacity-70">
              {t("cloud_member_count", { count: team.memberCount })}
            </div>
          </div>
          {isOwner ? (
            <div className="flex items-center gap-1">
              <Select
                size="small"
                value={team.role}
                disabled={busy === team.id}
                onChange={(next) =>
                  run(team.id, () =>
                    teamSharesApi.changeRole(diagramId, team.id, next),
                  )
                }
                optionList={roleOptions}
                style={{ width: 150 }}
              />
              <Tooltip content={t("cloud_remove_access")}>
                <Button
                  size="small"
                  theme="borderless"
                  type="danger"
                  icon={<i className="bi bi-x-lg" />}
                  aria-label={t("cloud_remove_access")}
                  onClick={() =>
                    run(team.id, () => teamSharesApi.remove(diagramId, team.id))
                  }
                />
              </Tooltip>
            </div>
          ) : (
            <span className="opacity-70">{t(`cloud_role.${team.role}`)}</span>
          )}
        </div>
      ))}
    </div>
  );
}
