import { useParams } from "react-router-dom";
import { Button } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { composeComment, openComments, useThreads } from "../comments";
import { useCommentsAvailable } from "./CommentsPanel";

// On the tables drawn on the canvas: quick ways to comment, and which
// fields have open comments

const stop = (e) => e.stopPropagation();

/** In a table's header, shown on hover. */
export function TableCommentButton({ tableId }) {
  const { t } = useTranslation();
  if (!useCommentsAvailable()) return null;
  return (
    <Button
      size="small"
      type="tertiary"
      theme="borderless"
      className="me-1"
      title={t("cloud_comment_on_table")}
      aria-label={t("cloud_comment_on_table")}
      icon={<i className="bi bi-chat-left-text" />}
      onPointerDown={stop}
      onClick={(e) => {
        stop(e);
        composeComment(tableId);
      }}
    />
  );
}

/** Next to a field's duplicate and delete buttons, shown on hover. */
export function FieldCommentButton({ tableId, fieldId }) {
  const { t } = useTranslation();
  if (!useCommentsAvailable()) return null;
  return (
    <Button
      theme="solid"
      size="small"
      title={t("cloud_comment_on_field")}
      aria-label={t("cloud_comment_on_field")}
      icon={<i className="bi bi-chat-left-text" />}
      onPointerDown={stop}
      onClick={(e) => {
        stop(e);
        composeComment(tableId, fieldId);
      }}
    />
  );
}

/** A dot after a field's name while it has open comments; opens them. */
export function FieldCommentMarker({ tableId, fieldId }) {
  const { t } = useTranslation();
  const { id } = useParams();
  const available = useCommentsAvailable();
  const threads = useThreads(available ? id : null);
  const count = (threads ?? []).filter(
    (th) =>
      !th.resolved &&
      th.tableId === String(tableId) &&
      th.fieldId === String(fieldId),
  ).length;
  if (!count) return null;
  return (
    <span
      data-export-ignore
      data-field-comments={fieldId}
      className="shrink-0 w-2 h-2 rounded-full bg-amber-500 cursor-pointer"
      title={t("cloud_field_comments", { count })}
      onPointerDown={stop}
      onClick={(e) => {
        stop(e);
        openComments(tableId);
      }}
    />
  );
}
