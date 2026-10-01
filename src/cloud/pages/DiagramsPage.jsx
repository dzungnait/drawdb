import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  Banner,
  Button,
  Dropdown,
  Empty,
  Input,
  Modal,
  RadioGroup,
  Radio,
  Spin,
  Table,
  Tag,
  Toast,
} from "@douyinfe/semi-ui";
import { IconMore, IconPlus, IconSearch } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { DateTime } from "luxon";
import { useThemedPage } from "../../hooks";
import { databases } from "../../data/databases";
import logo_light from "../../assets/logo_light_160.png";
import logo_dark from "../../assets/logo_dark_160.png";
import { useSettings } from "../../hooks";
import { useAuth } from "../AuthContext";
import { errorCode } from "../api";
import { diagramsApi } from "../diagrams";
import { errorMessage } from "../i18n";
import { membersApi } from "../sharing";
import AccountMenu from "../components/AccountMenu";
import LanguageSwitch from "../components/LanguageSwitch";
import ShareDialog from "../components/ShareDialog";

const ROLE_COLORS = { owner: "blue", editor: "green", viewer: "grey" };

/** Every diagram the signed-in user owns or that is shared with them. */
export default function DiagramsPage() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { status, user, openDialog } = useAuth();
  const navigate = useNavigate();
  useThemedPage();

  useEffect(() => {
    document.title = `${t("cloud_diagrams")} | drawDB`;
  }, [t]);

  let body;
  if (status === "loading") {
    body = (
      <div className="flex justify-center py-16">
        <Spin size="large" />
      </div>
    );
  } else if (status === "unavailable") {
    // No accounts on this server: the editor (with browser storage) is all there is
    return <Navigate to="/editor" replace />;
  } else if (!user) {
    body = (
      <Empty
        className="py-16"
        image={<i className="bi bi-person-lock text-6xl opacity-50" />}
        title={t("cloud_sign_in_to_see")}
        description={t("cloud_or_use_locally")}
      >
        <div className="flex justify-center gap-2">
          <Button theme="solid" onClick={() => openDialog("signin")}>
            {t("cloud_sign_in")}
          </Button>
          <Button onClick={() => navigate("/editor")}>
            {t("cloud_use_without_account")}
          </Button>
        </div>
      </Empty>
    );
  } else {
    body = <DiagramList key={user.id} />;
  }

  return (
    <div className="min-h-screen bg-[var(--semi-color-bg-0)] text-[var(--semi-color-text-0)]">
      <div className="py-4 px-12 sm:px-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link to="/">
            <img
              src={settings.mode === "dark" ? logo_dark : logo_light}
              alt="logo"
              className="h-[40px] sm:h-[28px]"
            />
          </Link>
          <div className="text-xl sm:text-base font-semibold">
            {t("cloud_diagrams")}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <AccountMenu variant="landing" />
        </div>
      </div>
      <hr className="border-[var(--semi-color-border)]" />
      <div className="px-12 sm:px-4 py-6 max-w-6xl mx-auto">{body}</div>
    </div>
  );
}

function DiagramList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [sharing, setSharing] = useState(null);
  const { user } = useAuth();

  const load = useCallback(() => {
    diagramsApi
      .list()
      .then((list) => {
        setItems(list);
        setError(null);
      })
      .catch((e) => setError(errorMessage(t, errorCode(e))));
  }, [t]);

  useEffect(load, [load]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (items ?? []).filter(
      (d) =>
        (scope === "all" ||
          (scope === "owned" ? d.role === "owner" : d.role !== "owner")) &&
        (!needle || (d.name || "").toLowerCase().includes(needle)),
    );
  }, [items, scope, search]);

  const open = (d) => navigate(`/editor/diagrams/${d.diagramId}`);
  const drop = (id) =>
    setItems((prev) => prev.filter((d) => d.diagramId !== id));

  const moveToTrash = (d) =>
    Modal.confirm({
      title: t("cloud_move_to_trash"),
      content: t("cloud_move_to_trash_confirm"),
      okText: t("cloud_move_to_trash"),
      okButtonProps: { type: "danger" },
      cancelText: t("cancel"),
      centered: true,
      onOk: async () => {
        try {
          await diagramsApi.remove(d.diagramId);
          drop(d.diagramId);
          Toast.success(t("cloud_moved_to_trash"));
        } catch (e) {
          Toast.error(errorMessage(t, errorCode(e)));
        }
      },
    });

  const leave = (d) =>
    Modal.confirm({
      title: t("cloud_leave"),
      content: t("cloud_leave_confirm"),
      okText: t("cloud_leave"),
      okButtonProps: { type: "danger" },
      cancelText: t("cancel"),
      centered: true,
      onOk: async () => {
        try {
          await membersApi.remove(d.diagramId, user.id);
          drop(d.diagramId);
          Toast.success(t("cloud_left"));
        } catch (e) {
          Toast.error(errorMessage(t, errorCode(e)));
        }
      },
    });

  const columns = [
    {
      title: t("cloud_col_name"),
      dataIndex: "name",
      render: (_, d) => (
        <div className="min-w-0">
          <div className="font-medium truncate">
            {d.name || t("cloud_untitled")}
          </div>
          <div className="text-xs opacity-70">
            {databases[d.database]?.name ?? d.database}
            {d.role === "owner" && d.sharedWith > 0 && (
              <>
                {" · "}
                <i className="bi bi-people" />{" "}
                {t("cloud_shared_count", { count: d.sharedWith })}
              </>
            )}
          </div>
        </div>
      ),
    },
    {
      title: t("cloud_col_owner"),
      dataIndex: "owner",
      width: 200,
      render: (owner, d) =>
        d.role === "owner" ? (
          t("cloud_you")
        ) : (
          <span title={owner.email}>{owner.username || owner.email}</span>
        ),
    },
    {
      title: t("cloud_col_access"),
      dataIndex: "role",
      width: 160,
      render: (role) => (
        <Tag color={ROLE_COLORS[role]}>{t(`cloud_role.${role}`)}</Tag>
      ),
    },
    {
      title: t("cloud_col_modified"),
      dataIndex: "lastModified",
      width: 190,
      render: (date) =>
        DateTime.fromISO(date).setLocale(i18n.language).toRelative(),
    },
    {
      dataIndex: "actions",
      width: 60,
      render: (_, d) => (
        // Don't open the row when using its menu
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown
            trigger="click"
            position="bottomRight"
            clickToHide
            render={
              <Dropdown.Menu>
                <Dropdown.Item onClick={() => open(d)}>
                  {t("cloud_open")}
                </Dropdown.Item>
                <Dropdown.Item onClick={() => setSharing(d)}>
                  {t("cloud_share")}
                </Dropdown.Item>
                <Dropdown.Divider />
                {d.role === "owner" ? (
                  <Dropdown.Item type="danger" onClick={() => moveToTrash(d)}>
                    {t("cloud_move_to_trash")}
                  </Dropdown.Item>
                ) : (
                  <Dropdown.Item type="danger" onClick={() => leave(d)}>
                    {t("cloud_leave")}
                  </Dropdown.Item>
                )}
              </Dropdown.Menu>
            }
          >
            <Button
              theme="borderless"
              type="tertiary"
              icon={<IconMore />}
              aria-label="More"
            />
          </Dropdown>
        </div>
      ),
    },
  ];

  const emptyText =
    items?.length && search.trim()
      ? t("cloud_no_match")
      : scope === "shared"
        ? t("cloud_no_shared")
        : t("cloud_no_diagrams");

  return (
    <>
      <div className="text-sm opacity-70 mb-4">{t("cloud_diagrams_hint")}</div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <RadioGroup
          type="button"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <Radio value="all">{t("cloud_all")}</Radio>
          <Radio value="owned">{t("cloud_owned_by_me")}</Radio>
          <Radio value="shared">{t("cloud_shared_with_me")}</Radio>
        </RadioGroup>
        <Input
          prefix={<IconSearch />}
          placeholder={t("cloud_search")}
          value={search}
          onChange={setSearch}
          showClear
          style={{ width: 260 }}
        />
        <div className="flex-1" />
        <Button
          theme="solid"
          icon={<IconPlus />}
          onClick={() => navigate("/editor")}
        >
          {t("cloud_new_diagram")}
        </Button>
      </div>

      {error && <Banner type="danger" closeIcon={null} description={error} />}
      {!error && (
        <Table
          rowKey="diagramId"
          columns={columns}
          dataSource={shown}
          loading={!items}
          pagination={shown.length > 20 ? { pageSize: 20 } : false}
          empty={<div className="py-8 opacity-70">{emptyText}</div>}
          onRow={(d) => ({
            onClick: () => open(d),
            className: "cursor-pointer",
          })}
        />
      )}

      <Modal
        title={t("cloud_share_title", {
          name: sharing?.name || t("cloud_untitled"),
        })}
        visible={Boolean(sharing)}
        onCancel={() => setSharing(null)}
        footer={null}
        width={620}
        centered
      >
        {sharing && (
          <ShareDialog
            diagramId={sharing.diagramId}
            onChange={({ members }) =>
              setItems((prev) =>
                prev.map((d) =>
                  d.diagramId === sharing.diagramId
                    ? { ...d, sharedWith: members.length }
                    : d,
                ),
              )
            }
            onLeft={() => {
              drop(sharing.diagramId);
              setSharing(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}
