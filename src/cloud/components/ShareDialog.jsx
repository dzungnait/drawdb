import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Banner,
  Button,
  Input,
  Modal,
  Select,
  Spin,
  Tag,
  Toast,
  Tooltip,
} from "@douyinfe/semi-ui";
import { IconLink } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { errorCode } from "../api";
import { isCloudDiagram, useOpened } from "../diagrams";
import { errorMessage } from "../i18n";
import { membersApi } from "../sharing";
import { UserAvatar } from "./AccountMenu";
import LinkSharing from "./LinkSharing";
import TeamSharing from "./TeamSharing";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const diagramLink = (id) =>
  `${window.location.origin}/editor/diagrams/${id}`;

/** Replaces upstream's gist share link inside the editor's Share modal. */
export function EditorShare() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const opened = useOpened(id);

  if (!id || id === "blank") {
    return <Banner closeIcon={null} description={t("cloud_share_unsaved")} />;
  }
  if (!isCloudDiagram(id)) {
    return <Banner closeIcon={null} description={t("cloud_share_local")} />;
  }
  if (opened?.access === "link") {
    return <Banner closeIcon={null} description={t("cloud_share_via_link")} />;
  }
  return <ShareDialog diagramId={id} onLeft={() => navigate("/")} />;
}

/** Who has access to a diagram; the owner can share and change roles. */
export default function ShareDialog({ diagramId, onChange, onLeft }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(null);

  const fail = useCallback(
    (e) => Toast.error(errorMessage(t, errorCode(e))),
    [t],
  );

  useEffect(() => {
    membersApi
      .list(diagramId)
      .then(setData)
      .catch((e) => setError(errorMessage(t, errorCode(e))));
  }, [diagramId, t]);

  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const update = (next) => {
    setData(next);
    onChange?.(next);
  };

  const validEmail = EMAIL.test(email.trim());
  const share = () =>
    validEmail &&
    run("share", async () => {
      const address = email.trim().toLowerCase();
      const result = await membersApi.share(diagramId, address, role);
      update(result);
      setEmail("");
      Toast.success(
        t(result.status === "added" ? "cloud_shared_with" : "cloud_invited", {
          email: address,
        }),
      );
    });

  const changeRole = (member, next) =>
    run(member.id, async () =>
      update(await membersApi.changeRole(diagramId, member.id, next)),
    );

  const removeMember = (member) =>
    run(member.id, async () => {
      await membersApi.remove(diagramId, member.id);
      update({
        ...data,
        members: data.members.filter((m) => m.id !== member.id),
      });
    });

  const makeOwner = (member) => {
    const name = member.name || member.email;
    Modal.confirm({
      title: t("cloud_make_owner"),
      content: t("cloud_make_owner_confirm", { name }),
      okText: t("cloud_make_owner"),
      cancelText: t("cancel"),
      centered: true,
      onOk: () =>
        run(member.id, async () => {
          update(await membersApi.transferOwnership(diagramId, member.id));
          Toast.success(t("cloud_owner_changed", { name }));
        }),
    });
  };

  const cancelInvite = (invite) =>
    run(`invite:${invite.id}`, async () =>
      update(await membersApi.cancelInvite(diagramId, invite.id)),
    );

  const leave = () =>
    Modal.confirm({
      title: t("cloud_leave"),
      content: t("cloud_leave_confirm"),
      okText: t("cloud_leave"),
      okButtonProps: { type: "danger" },
      cancelText: t("cancel"),
      centered: true,
      onOk: async () => {
        try {
          await membersApi.remove(diagramId, user.id);
          Toast.success(t("cloud_left"));
          onLeft?.();
        } catch (e) {
          fail(e);
        }
      },
    });

  const copyLink = () =>
    navigator.clipboard
      .writeText(diagramLink(diagramId))
      .then(() => Toast.success(t("cloud_link_copied")))
      .catch(() => Toast.error(t("cloud_error.unknown")));

  if (error)
    return <Banner type="danger" closeIcon={null} description={error} />;
  if (!data) {
    return (
      <div className="flex justify-center py-8">
        <Spin />
      </div>
    );
  }

  const isOwner = data.role === "owner";
  const roleOptions = ["editor", "viewer"].map((r) => ({
    value: r,
    label: t(`cloud_role.${r}`),
  }));
  // For people with access, the owner can also hand the diagram over
  const memberOptions = [
    ...roleOptions,
    { value: "owner", label: t("cloud_make_owner") },
  ];

  return (
    <div className="pb-2">
      {isOwner ? (
        <div className="flex gap-2 mb-4">
          <Input
            value={email}
            onChange={setEmail}
            onEnterPress={share}
            placeholder={t("cloud_share_email")}
            type="email"
            autoFocus
          />
          <Select
            value={role}
            onChange={setRole}
            optionList={roleOptions}
            style={{ width: 170 }}
          />
          <Button
            theme="solid"
            disabled={!validEmail}
            loading={busy === "share"}
            onClick={share}
          >
            {t("cloud_share_button")}
          </Button>
        </div>
      ) : (
        <div className="text-sm opacity-70 mb-3">
          {t("cloud_share_owner_only")}
        </div>
      )}

      <div className="font-semibold mb-2">{t("cloud_people_with_access")}</div>
      <div className="max-h-[320px] overflow-auto">
        <Person
          person={data.owner}
          me={user}
          right={<span className="opacity-70">{t("cloud_role.owner")}</span>}
        />
        {data.members.map((m) => (
          <Person
            key={m.id}
            person={m}
            me={user}
            right={
              isOwner ? (
                <div className="flex items-center gap-1">
                  <Select
                    size="small"
                    value={m.role}
                    disabled={busy === m.id}
                    onChange={(next) =>
                      next === "owner" ? makeOwner(m) : changeRole(m, next)
                    }
                    optionList={memberOptions}
                    style={{ width: 170 }}
                  />
                  <Tooltip content={t("cloud_remove_access")}>
                    <Button
                      size="small"
                      theme="borderless"
                      type="danger"
                      icon={<i className="bi bi-x-lg" />}
                      aria-label={t("cloud_remove_access")}
                      onClick={() => removeMember(m)}
                    />
                  </Tooltip>
                </div>
              ) : (
                <span className="opacity-70">{t(`cloud_role.${m.role}`)}</span>
              )
            }
          />
        ))}
        {data.invites.map((i) => (
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
              {t(`cloud_role.${i.role}`)}
            </span>
            <Tooltip content={t("cloud_cancel_invite")}>
              <Button
                size="small"
                theme="borderless"
                type="danger"
                icon={<i className="bi bi-x-lg" />}
                aria-label={t("cloud_cancel_invite")}
                loading={busy === `invite:${i.id}`}
                onClick={() => cancelInvite(i)}
              />
            </Tooltip>
          </div>
        ))}
      </div>

      <TeamSharing
        diagramId={diagramId}
        teams={data.teams ?? []}
        isOwner={isOwner}
        onChange={() =>
          membersApi
            .list(diagramId)
            .then(update)
            .catch(() => {})
        }
      />

      {isOwner && <LinkSharing diagramId={diagramId} />}

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[var(--semi-color-border)]">
        <div className="flex-1 text-xs opacity-70">
          {t("cloud_share_link_hint")}
        </div>
        {!isOwner && (
          <Button type="danger" theme="borderless" onClick={leave}>
            {t("cloud_leave")}
          </Button>
        )}
        <Button icon={<IconLink />} onClick={copyLink}>
          {t("cloud_copy_link")}
        </Button>
      </div>
    </div>
  );
}

function Person({ person, me, right }) {
  const { t } = useTranslation();
  const isMe = person.id === me?.id;
  return (
    <div className="flex items-center gap-3 py-2">
      <UserAvatar user={person} size="small" />
      <div className="flex-1 min-w-0">
        <div className="truncate">
          {person.name || person.email}
          {isMe && <span className="opacity-70"> ({t("cloud_you")})</span>}
        </div>
        <div className="text-xs opacity-70 truncate">{person.email}</div>
      </div>
      {right}
    </div>
  );
}
