import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Banner,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Spin,
  Tag,
  Toast,
  Tooltip,
} from "@douyinfe/semi-ui";
import { IconPlus } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { errorCode } from "../api";
import { errorMessage } from "../i18n";
import { teamsApi } from "../teams";
import { UserAvatar } from "../components/AccountMenu";
import PageLayout from "../components/PageLayout";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The user's teams; /teams/:id shows one of them. */
export default function TeamsPage() {
  const { t } = useTranslation();
  const { status, user } = useAuth();

  useEffect(() => {
    document.title = `${t("cloud_teams")} | drawDB`;
  }, [t]);

  if (status === "loading") {
    return (
      <PageLayout>
        <div className="flex justify-center py-16">
          <Spin size="large" />
        </div>
      </PageLayout>
    );
  }
  if (status === "unavailable") return <Navigate to="/editor" replace />;
  // The home page asks to sign in
  if (!user) return <Navigate to="/" replace />;
  return (
    <PageLayout>
      <Teams key={user.id} />
    </PageLayout>
  );
}

function Teams() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(null);

  const load = useCallback(
    () =>
      teamsApi
        .list()
        .then(setTeams)
        .catch((e) => setError(errorMessage(t, errorCode(e)))),
    [t],
  );
  useEffect(() => {
    load();
  }, [load]);

  // Open the first team when none is picked
  useEffect(() => {
    if (!id && teams?.length)
      navigate(`/teams/${teams[0].id}`, { replace: true });
  }, [id, teams, navigate]);

  const create = async () => {
    const name = creating.trim();
    if (!name) return;
    try {
      const team = await teamsApi.create(name);
      setCreating(null);
      await load();
      navigate(`/teams/${team.id}`);
    } catch (e) {
      Toast.error(errorMessage(t, errorCode(e)));
    }
  };

  if (error)
    return <Banner type="danger" closeIcon={null} description={error} />;
  if (!teams) {
    return (
      <div className="flex justify-center py-16">
        <Spin />
      </div>
    );
  }

  const newTeamButton = (
    <Button theme="solid" icon={<IconPlus />} onClick={() => setCreating("")}>
      {t("cloud_new_team")}
    </Button>
  );

  return (
    <>
      <div className="text-sm opacity-70 mb-4">{t("cloud_teams_hint")}</div>
      {teams.length === 0 ? (
        <Empty
          className="py-16"
          image={<i className="bi bi-people text-6xl opacity-50" />}
          title={t("cloud_no_teams")}
          description={t("cloud_no_teams_hint")}
        >
          {newTeamButton}
        </Empty>
      ) : (
        <div className="flex gap-6 sm:flex-col">
          <div className="w-64 sm:w-full shrink-0 space-y-1">
            <div className="mb-3">{newTeamButton}</div>
            {teams.map((team) => (
              <Link
                key={team.id}
                to={`/teams/${team.id}`}
                className={`block px-3 py-2 rounded-md hover-1 ${
                  team.id === id ? "bg-[var(--semi-color-fill-0)]" : ""
                }`}
              >
                <div className="font-medium truncate">{team.name}</div>
                <div className="text-xs opacity-70">
                  {t("cloud_member_count", { count: team.memberCount })}
                  {team.role === "admin" && ` · ${t("cloud_team_role.admin")}`}
                </div>
              </Link>
            ))}
          </div>
          <div className="flex-1 min-w-0">
            {id && teams.some((team) => team.id === id) ? (
              <TeamDetail
                key={id}
                teamId={id}
                onChange={load}
                onGone={async () => {
                  await load();
                  navigate("/teams", { replace: true });
                }}
              />
            ) : (
              id && (
                <Banner
                  closeIcon={null}
                  description={t("cloud_error.team_not_found")}
                />
              )
            )}
          </div>
        </div>
      )}

      <Modal
        title={t("cloud_new_team")}
        visible={creating !== null}
        onCancel={() => setCreating(null)}
        onOk={create}
        okText={t("cloud_create")}
        cancelText={t("cancel")}
        okButtonProps={{ disabled: !creating?.trim() }}
        centered
        width={420}
      >
        <Input
          autoFocus
          value={creating ?? ""}
          onChange={setCreating}
          onEnterPress={create}
          maxLength={100}
          placeholder={t("cloud_team_name")}
        />
      </Modal>
    </>
  );
}

function TeamDetail({ teamId, onChange, onGone }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [team, setTeam] = useState(null);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(null);
  const [renaming, setRenaming] = useState(null);

  useEffect(() => {
    teamsApi
      .get(teamId)
      .then(setTeam)
      .catch((e) => setError(errorMessage(t, errorCode(e))));
  }, [teamId, t]);

  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      Toast.error(errorMessage(t, errorCode(e)));
    } finally {
      setBusy(null);
    }
  };

  const update = (next) => {
    setTeam(next);
    onChange();
  };

  if (error)
    return <Banner type="danger" closeIcon={null} description={error} />;
  if (!team) {
    return (
      <div className="flex justify-center py-8">
        <Spin />
      </div>
    );
  }

  const isAdmin = team.role === "admin";
  const roleOptions = ["admin", "member"].map((r) => ({
    value: r,
    label: t(`cloud_team_role.${r}`),
  }));

  const validEmail = EMAIL.test(email.trim());
  const add = () =>
    validEmail &&
    run("add", async () => {
      const address = email.trim().toLowerCase();
      const result = await teamsApi.addMember(teamId, address, role);
      update(result);
      setEmail("");
      Toast.success(
        t(result.status === "added" ? "cloud_team_added" : "cloud_invited", {
          email: address,
        }),
      );
    });

  const confirm = (title, content, okText, onOk) =>
    Modal.confirm({
      title,
      content,
      okText,
      okButtonProps: { type: "danger" },
      cancelText: t("cancel"),
      centered: true,
      onOk: () => run("confirm", onOk),
    });

  const remove = (member) =>
    member.id === user.id
      ? confirm(
          t("cloud_leave_team"),
          t("cloud_leave_team_confirm"),
          t("cloud_leave"),
          async () => {
            await teamsApi.removeMember(teamId, member.id);
            onGone();
          },
        )
      : run(member.id, async () => {
          await teamsApi.removeMember(teamId, member.id);
          update({
            ...team,
            memberCount: team.memberCount - 1,
            members: team.members.filter((m) => m.id !== member.id),
          });
        });

  const rename = () =>
    renaming?.trim() &&
    run("rename", async () => {
      update(await teamsApi.rename(teamId, renaming.trim()));
      setRenaming(null);
    });

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <div className="text-xl font-semibold truncate">{team.name}</div>
        {isAdmin && (
          <Tooltip content={t("cloud_history_rename")}>
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              icon={<i className="bi bi-pencil" />}
              aria-label={t("cloud_history_rename")}
              onClick={() => setRenaming(team.name)}
            />
          </Tooltip>
        )}
        <div className="flex-1" />
        <Link to={`/?team=${teamId}`}>
          <Button theme="borderless">{t("cloud_team_diagrams")}</Button>
        </Link>
        {isAdmin ? (
          <Button
            type="danger"
            theme="borderless"
            onClick={() =>
              confirm(
                t("cloud_delete_team"),
                t("cloud_delete_team_confirm"),
                t("cloud_delete_team"),
                async () => {
                  await teamsApi.remove(teamId);
                  onGone();
                },
              )
            }
          >
            {t("cloud_delete_team")}
          </Button>
        ) : (
          <Button
            type="danger"
            theme="borderless"
            onClick={() => remove({ id: user.id })}
          >
            {t("cloud_leave_team")}
          </Button>
        )}
      </div>
      <div className="text-sm opacity-70 mb-4">
        {t("cloud_member_count", { count: team.memberCount })}
      </div>

      {isAdmin && (
        <div className="flex gap-2 mb-4">
          <Input
            value={email}
            onChange={setEmail}
            onEnterPress={add}
            placeholder={t("cloud_share_email")}
            type="email"
          />
          <Select
            value={role}
            onChange={setRole}
            optionList={roleOptions}
            style={{ width: 160 }}
          />
          <Button
            theme="solid"
            disabled={!validEmail}
            loading={busy === "add"}
            onClick={add}
          >
            {t("cloud_add")}
          </Button>
        </div>
      )}

      <div className="divide-y divide-[var(--semi-color-border)]">
        {team.members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 py-2">
            <UserAvatar user={m} />
            <div className="flex-1 min-w-0">
              <div className="truncate">
                {m.name || m.email}
                {m.id === user.id && (
                  <span className="opacity-70"> ({t("cloud_you")})</span>
                )}
              </div>
              <div className="text-xs opacity-70 truncate">{m.email}</div>
            </div>
            {isAdmin ? (
              <>
                <Select
                  size="small"
                  value={m.role}
                  disabled={busy === m.id}
                  onChange={(next) =>
                    run(m.id, async () =>
                      update(await teamsApi.changeRole(teamId, m.id, next)),
                    )
                  }
                  optionList={roleOptions}
                  style={{ width: 140 }}
                />
                {m.id !== user.id && (
                  <Tooltip content={t("cloud_remove_from_team")}>
                    <Button
                      size="small"
                      theme="borderless"
                      type="danger"
                      icon={<i className="bi bi-x-lg" />}
                      aria-label={t("cloud_remove_from_team")}
                      onClick={() => remove(m)}
                    />
                  </Tooltip>
                )}
              </>
            ) : (
              <span className="opacity-70 text-sm">
                {t(`cloud_team_role.${m.role}`)}
              </span>
            )}
          </div>
        ))}
        {team.invites.map((i) => (
          <div key={i.id} className="flex items-center gap-3 py-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--semi-color-fill-0)]">
              <i className="fa-regular fa-envelope" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate">{i.email}</div>
              <div className="text-xs opacity-70">
                {t("cloud_pending_hint")}
              </div>
            </div>
            <Tag size="small">{t("cloud_pending")}</Tag>
            <span className="opacity-70 text-sm">
              {t(`cloud_team_role.${i.role}`)}
            </span>
            <Tooltip content={t("cloud_cancel_invite")}>
              <Button
                size="small"
                theme="borderless"
                type="danger"
                icon={<i className="bi bi-x-lg" />}
                aria-label={t("cloud_cancel_invite")}
                onClick={() =>
                  run(`invite:${i.id}`, async () =>
                    update(await teamsApi.cancelInvite(teamId, i.id)),
                  )
                }
              />
            </Tooltip>
          </div>
        ))}
      </div>

      <Modal
        title={t("cloud_history_rename")}
        visible={renaming !== null}
        onCancel={() => setRenaming(null)}
        onOk={rename}
        okText={t("cloud_save")}
        cancelText={t("cancel")}
        okButtonProps={{
          loading: busy === "rename",
          disabled: !renaming?.trim(),
        }}
        centered
        width={420}
      >
        <Input
          autoFocus
          value={renaming ?? ""}
          onChange={setRenaming}
          onEnterPress={rename}
          maxLength={100}
        />
      </Modal>
    </div>
  );
}
