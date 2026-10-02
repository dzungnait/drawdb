import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Banner,
  Button,
  Divider,
  Dropdown,
  Empty,
  RadioGroup,
  Radio,
  Select,
  SideSheet,
  Spin,
  Tag,
  TextArea,
  Toast,
} from "@douyinfe/semi-ui";
import { IconMore } from "@douyinfe/semi-icons";
import { useTranslation } from "react-i18next";
import { DateTime } from "luxon";
import { useDiagram } from "../../hooks";
import { useAuth } from "../AuthContext";
import { errorCode } from "../api";
import {
  changeThreads,
  closeComments,
  commentsApi,
  openComments,
  showAllComments,
  useCommentsPanel,
  useThreads,
} from "../comments";
import { isCloudDiagram, useOpened } from "../diagrams";
import { errorMessage } from "../i18n";
import { UserAvatar } from "./AccountMenu";

/** Whether this person gets comments on the diagram open in the editor. */
export function useCommentsAvailable() {
  const { id } = useParams();
  const { user } = useAuth();
  const opened = useOpened(id);
  return Boolean(
    user &&
      id &&
      isCloudDiagram(id) &&
      opened?.status === "ok" &&
      opened.access !== "link",
  );
}

/** "users" or "users.email", or a note that it's gone. */
function useTargetName() {
  const { t } = useTranslation();
  const { tables } = useDiagram();
  return (thread) => {
    const table = tables.find((tb) => String(tb.id) === thread.tableId);
    if (!table) return t("cloud_comment_deleted_table");
    if (!thread.fieldId) return table.name;
    const field = table.fields.find((f) => String(f.id) === thread.fieldId);
    return `${table.name}.${field ? field.name : t("cloud_comment_deleted_field")}`;
  };
}

/** Comment threads on the diagram's tables and fields, beside the canvas. */
export default function CommentsPanel() {
  const { t } = useTranslation();
  const { id } = useParams();
  const available = useCommentsAvailable();
  const panel = useCommentsPanel();
  const visible = available && panel.open;

  return (
    <SideSheet
      visible={visible}
      onCancel={closeComments}
      // The diagram stays usable while reading comments
      mask={false}
      width={400}
      title={<div className="text-lg">{t("cloud_comments")}</div>}
      bodyStyle={{ padding: 0 }}
    >
      {visible && <Threads diagramId={id} panel={panel} />}
    </SideSheet>
  );
}

function Threads({ diagramId, panel }) {
  const { tableId } = panel;
  const { t } = useTranslation();
  const threads = useThreads(diagramId);
  const { tables } = useDiagram();
  const targetName = useTargetName();
  const [show, setShow] = useState("open");

  const shown = useMemo(
    () =>
      (threads ?? []).filter(
        (th) =>
          (!tableId || th.tableId === tableId) &&
          (show === "open" ? !th.resolved : th.resolved),
      ),
    [threads, tableId, show],
  );

  if (threads === null) {
    return (
      <div className="flex justify-center py-8">
        <Spin />
      </div>
    );
  }

  const table = tableId && tables.find((tb) => String(tb.id) === tableId);

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center gap-2 mb-3">
        <RadioGroup
          type="button"
          value={show}
          onChange={(e) => setShow(e.target.value)}
          // Stays on one line; a long table name gets cut instead
          className="shrink-0 whitespace-nowrap"
        >
          <Radio value="open">{t("cloud_comments_open")}</Radio>
          <Radio value="resolved">{t("cloud_comments_resolved")}</Radio>
        </RadioGroup>
        {tableId && (
          <Tag
            closable
            onClose={showAllComments}
            size="large"
            className="min-w-0"
            style={{ maxWidth: "100%" }}
          >
            <span className="truncate" title={table ? table.name : undefined}>
              {table ? table.name : t("cloud_comment_deleted_table")}
            </span>
          </Tag>
        )}
      </div>

      <NewThread
        // Started over when asked for from the canvas
        key={panel.compose}
        diagramId={diagramId}
        tableId={tableId}
        initialFieldId={panel.compose ? panel.fieldId : null}
        focus={panel.compose > 0}
      />

      {shown.length === 0 ? (
        <Empty
          className="py-6"
          description={
            show === "open"
              ? t("cloud_comments_none_open")
              : t("cloud_comments_none_resolved")
          }
        />
      ) : (
        shown.map((th) => (
          <Thread
            key={th.id}
            diagramId={diagramId}
            thread={th}
            target={targetName(th)}
          />
        ))
      )}
    </div>
  );
}

/** Starts a thread about a table, or one of its fields. */
function NewThread({ diagramId, tableId, initialFieldId, focus }) {
  const { t } = useTranslation();
  const { tables } = useDiagram();
  const [picked, setPicked] = useState(null);
  const [fieldId, setFieldId] = useState(initialFieldId ?? "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const target = tableId ?? picked;
  const table = tables.find((tb) => String(tb.id) === target);

  const submit = async () => {
    if (!table || !body.trim()) return;
    setBusy(true);
    try {
      await changeThreads(
        diagramId,
        commentsApi.start(diagramId, target, fieldId || null, body.trim()),
      );
      setBody("");
      setFieldId("");
    } catch (e) {
      Toast.error(errorMessage(t, errorCode(e)));
    } finally {
      setBusy(false);
    }
  };

  if (tables.length === 0) {
    return (
      <Banner
        className="mb-3"
        closeIcon={null}
        description={t("cloud_comments_no_tables")}
      />
    );
  }

  return (
    <div className="mb-4 p-3 rounded-md bg-[var(--semi-color-fill-0)]">
      <div className="flex gap-2 mb-2">
        {!tableId && (
          <Select
            value={picked}
            onChange={(v) => {
              setPicked(v);
              setFieldId("");
            }}
            placeholder={t("cloud_comment_pick_table")}
            optionList={tables.map((tb) => ({
              value: String(tb.id),
              label: tb.name,
            }))}
            filter
            style={{ flex: 1, minWidth: 0 }}
          />
        )}
        <Select
          value={fieldId}
          onChange={setFieldId}
          disabled={!table}
          optionList={[
            { value: "", label: t("cloud_comment_whole_table") },
            ...(table?.fields ?? []).map((f) => ({
              value: String(f.id),
              label: f.name,
            })),
          ]}
          style={{ flex: 1, minWidth: 0 }}
        />
      </div>
      <TextArea
        autoFocus={focus}
        value={body}
        onChange={setBody}
        placeholder={t("cloud_comment_placeholder")}
        autosize={{ minRows: 2, maxRows: 8 }}
        maxLength={5000}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
        }}
      />
      <div className="flex justify-end mt-2">
        <Button
          theme="solid"
          disabled={!table || !body.trim()}
          loading={busy}
          onClick={submit}
        >
          {t("cloud_comment_button")}
        </Button>
      </div>
    </div>
  );
}

function Thread({ diagramId, thread, target }) {
  const { t } = useTranslation();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(null);

  const run = async (key, request) => {
    setBusy(key);
    try {
      await changeThreads(diagramId, request());
      return true;
    } catch (e) {
      Toast.error(errorMessage(t, errorCode(e)));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    const ok = await run("reply", () =>
      commentsApi.reply(diagramId, thread.id, reply.trim()),
    );
    if (ok) setReply("");
  };

  return (
    <div
      className="mb-3 rounded-md border border-[var(--semi-color-border)]"
      data-thread={thread.id}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--semi-color-border)]">
        <button
          className="flex-1 min-w-0 text-start truncate font-medium hover:underline"
          onClick={() => openComments(thread.tableId)}
        >
          <i className="bi bi-table me-1 opacity-70" />
          {target}
        </button>
        <Button
          size="small"
          theme="borderless"
          loading={busy === "resolve"}
          icon={
            <i
              className={
                thread.resolved
                  ? "bi bi-arrow-counterclockwise"
                  : "bi bi-check2"
              }
            />
          }
          onClick={() =>
            run("resolve", () =>
              commentsApi.resolve(diagramId, thread.id, !thread.resolved),
            )
          }
        >
          {thread.resolved
            ? t("cloud_comment_reopen")
            : t("cloud_comment_resolve")}
        </Button>
      </div>
      {thread.resolved && (
        <div className="px-3 pt-2 text-xs opacity-70">
          {t("cloud_comment_resolved_by", {
            name: thread.resolved.by ?? "?",
          })}
        </div>
      )}
      {thread.comments.map((c) => (
        <Comment key={c.id} diagramId={diagramId} comment={c} run={run} />
      ))}
      <div className="flex gap-2 px-3 pb-3">
        <TextArea
          value={reply}
          onChange={setReply}
          placeholder={t("cloud_comment_reply")}
          autosize={{ minRows: 1, maxRows: 6 }}
          maxLength={5000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendReply();
          }}
        />
        <Button
          disabled={!reply.trim()}
          loading={busy === "reply"}
          onClick={sendReply}
        >
          {t("cloud_comment_send")}
        </Button>
      </div>
    </div>
  );
}

function Comment({ diagramId, comment, run }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { id } = useParams();
  const opened = useOpened(id);
  const [editing, setEditing] = useState(null);
  const mine = comment.author?.id === user?.id;
  const canDelete = mine || opened?.role === "owner";

  const save = async () => {
    if (!editing.trim()) return;
    const ok = await run(`edit:${comment.id}`, () =>
      commentsApi.edit(diagramId, comment.id, editing.trim()),
    );
    if (ok) setEditing(null);
  };

  return (
    <div className="flex gap-2 px-3 py-2">
      {comment.author ? (
        <UserAvatar
          user={{ ...comment.author, email: comment.author.name ?? "?" }}
          size="extra-small"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-[var(--semi-color-fill-1)]" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">
            {comment.author?.name ?? t("cloud_comment_deleted_user")}
          </span>
          <span className="text-xs opacity-60 shrink-0">
            {DateTime.fromISO(comment.createdAt)
              .setLocale(i18n.language)
              .toRelative()}
            {comment.editedAt && ` · ${t("cloud_comment_edited")}`}
          </span>
          <div className="flex-1" />
          {(mine || canDelete) && !editing && (
            <Dropdown
              trigger="click"
              position="bottomRight"
              clickToHide
              render={
                <Dropdown.Menu>
                  {mine && (
                    <Dropdown.Item onClick={() => setEditing(comment.body)}>
                      {t("cloud_comment_edit")}
                    </Dropdown.Item>
                  )}
                  {canDelete && (
                    <Dropdown.Item
                      type="danger"
                      onClick={() =>
                        run(`delete:${comment.id}`, () =>
                          commentsApi.remove(diagramId, comment.id),
                        )
                      }
                    >
                      {t("cloud_comment_delete")}
                    </Dropdown.Item>
                  )}
                </Dropdown.Menu>
              }
            >
              <Button
                size="small"
                theme="borderless"
                type="tertiary"
                icon={<IconMore />}
                aria-label={t("cloud_comment_actions")}
              />
            </Dropdown>
          )}
        </div>
        {editing !== null ? (
          <div>
            <TextArea
              value={editing}
              onChange={setEditing}
              autosize={{ minRows: 1, maxRows: 8 }}
              maxLength={5000}
            />
            <div className="flex justify-end gap-2 mt-1">
              <Button size="small" onClick={() => setEditing(null)}>
                {t("cancel")}
              </Button>
              <Button size="small" theme="solid" onClick={save}>
                {t("cloud_save")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words text-sm">
            {comment.body}
          </div>
        )}
      </div>
    </div>
  );
}

/** Toolbar button, with the number of open threads. */
export function CommentsButton() {
  const { t } = useTranslation();
  const { id } = useParams();
  const available = useCommentsAvailable();
  const threads = useThreads(available ? id : null);
  if (!available) return null;
  const open = (threads ?? []).filter((th) => !th.resolved).length;
  return (
    <>
      <Divider layout="vertical" margin="8px" />
      <button
        className="py-1 px-2 hover-2 rounded-sm text-xl -mt-0.5 relative"
        title={t("cloud_comments")}
        aria-label={t("cloud_comments")}
        onClick={() => openComments()}
      >
        <i className="bi bi-chat-left-text" />
        {open > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[var(--semi-color-primary)] text-white text-[10px] leading-4">
            {open}
          </span>
        )}
      </button>
    </>
  );
}
