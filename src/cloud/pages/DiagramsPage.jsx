import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  Banner,
  Button,
  Dropdown,
  Empty,
  Input,
  Modal,
  RadioGroup,
  Radio,
  Select,
  Spin,
  Table,
  Tag,
  Toast,
} from "@douyinfe/semi-ui";
import { IconMore, IconPlus, IconSearch } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { DateTime } from "luxon";
import { databases } from "../../data/databases";
import { useAuth } from "../AuthContext";
import { errorCode } from "../api";
import { diagramsApi } from "../diagrams";
import { errorMessage } from "../i18n";
import { membersApi } from "../sharing";
import { teamsApi } from "../teams";
import PageLayout from "../components/PageLayout";
import ShareDialog from "../components/ShareDialog";

const ROLE_COLORS = { owner: "blue", editor: "green", viewer: "grey" };
const ROLE_RANK = { owner: 0, editor: 1, viewer: 2 };

// The list's sort column and direction, remembered in this browser
const SORT_KEY = "drawdb:diagrams-sort";
const DEFAULT_SORT = { by: "lastModified", order: "descend" };

function readSort() {
  try {
    const saved = JSON.parse(localStorage.getItem(SORT_KEY));
    return saved?.by && saved?.order ? saved : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

function saveSort(sort) {
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(sort));
  } catch {
    // Only not remembered
  }
}

const compareText = (a, b) =>
  (a || "").localeCompare(b || "", undefined, { sensitivity: "base" });
const ownerName = (d) => d.owner?.username || d.owner?.email || "";
const databaseName = (d) => databases[d.database]?.name ?? d.database ?? "";

/** Ascending comparisons per column; the table flips them for descending. */
const SORTERS = {
  name: (a, b) => compareText(a.name, b.name),
  // Mine first, then by owner
  owner: (a, b) =>
    (a.role === "owner") !== (b.role === "owner")
      ? a.role === "owner"
        ? -1
        : 1
      : compareText(ownerName(a), ownerName(b)),
  role: (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role],
  lastModified: (a, b) =>
    Date.parse(a.lastModified) - Date.parse(b.lastModified),
};

/** Every diagram the signed-in user owns or that is shared with them. */
export default function DiagramsPage() {
  const { t } = useTranslation();
  const { status, user, openDialog } = useAuth();
  const navigate = useNavigate();

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

  return <PageLayout>{body}</PageLayout>;
}

function DiagramList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [database, setDatabase] = useState("");
  const [sort, setSort] = useState(readSort);
  const [sharing, setSharing] = useState(null);
  const [teams, setTeams] = useState([]);
  // ?team=<id>: diagrams shared with that team (e.g. from the Teams page)
  const [params, setParams] = useSearchParams();
  const team = params.get("team");
  const { user } = useAuth();

  useEffect(() => {
    teamsApi
      .list()
      .then(setTeams)
      .catch(() => {});
  }, []);

  const setTeam = (id) => setParams(id ? { team: id } : {}, { replace: true });

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

  // Databases the user has diagrams in, for the filter
  const usedDatabases = useMemo(
    () =>
      [...new Set((items ?? []).map((d) => d.database))]
        .map((value) => ({ value, label: databaseName({ database: value }) }))
        .sort((a, b) => compareText(a.label, b.label)),
    [items],
  );

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matches = (d) =>
      [d.name, ownerName(d), d.owner?.email, databaseName(d)].some((text) =>
        (text || "").toLowerCase().includes(needle),
      );
    return (items ?? []).filter(
      (d) =>
        (scope === "all" ||
          (scope === "owned" ? d.role === "owner" : d.role !== "owner")) &&
        (!team || d.teamIds?.includes(team)) &&
        (!database || d.database === database) &&
        (!needle || matches(d)),
    );
  }, [items, scope, search, team, database]);

  const sortable = (key) => ({
    sorter: SORTERS[key],
    sortOrder: sort.by === key ? sort.order : false,
  });
  const onSortChange = ({ sorter }) => {
    if (!sorter) return;
    // Clearing a column's sort goes back to the newest first
    const next = sorter.sortOrder
      ? { by: sorter.dataIndex, order: sorter.sortOrder }
      : DEFAULT_SORT;
    setSort(next);
    saveSort(next);
  };

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
      ...sortable("name"),
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
                <i className="bi bi-person" />{" "}
                {t("cloud_shared_count", { count: d.sharedWith })}
              </>
            )}
            {d.role === "owner" && d.sharedWithTeams > 0 && (
              <>
                {" · "}
                <i className="bi bi-people" />{" "}
                {t("cloud_shared_teams_count", { count: d.sharedWithTeams })}
              </>
            )}
            {d.role !== "owner" && d.teamIds?.length > 0 && (
              <>
                {" · "}
                <i className="bi bi-people" />{" "}
                {teams
                  .filter((tm) => d.teamIds.includes(tm.id))
                  .map((tm) => tm.name)
                  .join(", ")}
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
      ...sortable("owner"),
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
      ...sortable("role"),
      render: (role) => (
        <Tag color={ROLE_COLORS[role]}>{t(`cloud_role.${role}`)}</Tag>
      ),
    },
    {
      title: t("cloud_col_modified"),
      dataIndex: "lastModified",
      width: 190,
      ...sortable("lastModified"),
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
              // The same width on every row, whatever the last item says
              <Dropdown.Menu style={{ minWidth: 180 }}>
                <Dropdown.Item
                  icon={<i className="bi bi-box-arrow-up-right" />}
                  onClick={() => open(d)}
                >
                  {t("cloud_open")}
                </Dropdown.Item>
                <Dropdown.Item
                  icon={<i className="bi bi-share" />}
                  onClick={() => setSharing(d)}
                >
                  {t("cloud_share")}
                </Dropdown.Item>
                <Dropdown.Divider />
                {d.role === "owner" ? (
                  <Dropdown.Item
                    type="danger"
                    icon={<i className="bi bi-trash" />}
                    onClick={() => moveToTrash(d)}
                  >
                    {t("cloud_move_to_trash")}
                  </Dropdown.Item>
                ) : (
                  <Dropdown.Item
                    type="danger"
                    icon={<i className="bi bi-box-arrow-left" />}
                    onClick={() => leave(d)}
                  >
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
    items?.length && (search.trim() || database || team)
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
        {teams.length > 0 && (
          <Select
            value={team ?? ""}
            onChange={setTeam}
            optionList={[
              { value: "", label: t("cloud_all_teams") },
              ...teams.map((tm) => ({ value: tm.id, label: tm.name })),
            ]}
            prefix={<i className="bi bi-people ms-2" />}
            style={{ width: 200 }}
          />
        )}
        <Input
          prefix={<IconSearch />}
          placeholder={t("cloud_search")}
          value={search}
          onChange={setSearch}
          showClear
          style={{ width: 260 }}
        />
        {usedDatabases.length > 1 && (
          <Select
            value={database}
            onChange={setDatabase}
            optionList={[
              { value: "", label: t("cloud_all_databases") },
              ...usedDatabases,
            ]}
            prefix={<i className="bi bi-database ms-2" />}
            style={{ width: 200 }}
          />
        )}
        {items && (
          <span className="text-sm opacity-70">
            {t("cloud_diagram_count", { count: shown.length })}
          </span>
        )}
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
          onChange={onSortChange}
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
            onChange={({ role, members, teams: teamsShared }) =>
              // Handed over to someone else: the list shows it differently
              role !== sharing.role
                ? load()
                : setItems((prev) =>
                    prev.map((d) =>
                      d.diagramId === sharing.diagramId
                        ? {
                            ...d,
                            sharedWith: members.length,
                            sharedWithTeams: teamsShared?.length ?? 0,
                          }
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
