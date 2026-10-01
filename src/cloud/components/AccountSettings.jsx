import { useState } from "react";
import { Banner, Button, Input, Modal, Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { auth, errorCode, fieldErrors } from "../api";
import { errorMessage, PROVIDER_NAMES } from "../i18n";
import { UserAvatar } from "./AccountMenu";

function Section({ title, children, danger }) {
  return (
    <section
      className={`border rounded-lg p-4 mb-4 ${danger ? "border-red-400" : "border-color"}`}
    >
      <h3 className={`font-semibold mb-3 ${danger ? "text-red-500" : ""}`}>
        {title}
      </h3>
      {children}
    </section>
  );
}

const providerList = (providers) =>
  providers.map((p) => PROVIDER_NAMES[p] ?? p).join(", ");

export default function AccountSettings() {
  const { t } = useTranslation();
  const { dialog, closeDialog, user, setUser } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [passwords, setPasswords] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [passwordError, setPasswordError] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState(null);
  const [busy, setBusy] = useState(null);

  if (dialog !== "settings" || !user) return null;

  const run = async (key, fn, onError) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      const fields = fieldErrors(e);
      const text = Object.values(fields)[0] ?? errorMessage(t, errorCode(e));
      if (onError) onError(text);
      else Toast.error(text);
    } finally {
      setBusy(null);
    }
  };

  const saveName = () =>
    run("name", async () => {
      setUser(await auth.updateProfile({ name }));
      Toast.success(t("cloud_saved"));
    });

  const savePassword = () => {
    setPasswordError(null);
    if (passwords.next !== passwords.confirm) {
      setPasswordError(t("cloud_passwords_dont_match"));
      return;
    }
    run(
      "password",
      async () => {
        await auth.changePassword({
          currentPassword: user.hasPassword ? passwords.current : undefined,
          newPassword: passwords.next,
        });
        setPasswords({ current: "", next: "", confirm: "" });
        setUser({ ...user, hasPassword: true });
        Toast.success(t("cloud_password_updated"));
      },
      setPasswordError,
    );
  };

  const signOutOthers = () =>
    run("others", async () => {
      await auth.revokeOtherSessions();
      Toast.success(t("cloud_signed_out_others"));
    });

  const deleteAccount = () => {
    setDeleteError(null);
    run(
      "delete",
      async () => {
        await auth.deleteAccount(
          user.hasPassword
            ? { password: deleteConfirm }
            : { email: deleteConfirm },
        );
        setUser(null);
        closeDialog();
        Toast.success(t("cloud_account_deleted"));
      },
      setDeleteError,
    );
  };

  const setPw = (key) => (value) =>
    setPasswords((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal
      title={t("cloud_account_settings")}
      visible
      onCancel={closeDialog}
      footer={null}
      width={520}
      centered
    >
      <div className="pb-2">
        <Section title={t("cloud_profile")}>
          <div className="flex items-center gap-3 mb-3">
            <UserAvatar user={user} size="default" />
            <div className="min-w-0">
              <div className="truncate">{user.email}</div>
              {user.providers.length > 0 && (
                <div className="text-xs opacity-70">
                  {t("cloud_linked_with", {
                    providers: providerList(user.providers),
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="text-sm font-medium mb-1">{t("cloud_name")}</div>
          <div className="flex gap-2">
            <Input value={name} onChange={setName} maxLength={100} />
            <Button
              onClick={saveName}
              loading={busy === "name"}
              disabled={!name.trim() || name.trim() === user.name}
            >
              {t("cloud_save")}
            </Button>
          </div>
        </Section>

        <Section title={t("cloud_security")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              savePassword();
            }}
          >
            {!user.hasPassword && (
              <div className="text-sm mb-3 opacity-80">
                {t("cloud_set_password_hint", {
                  providers: providerList(user.providers),
                })}
              </div>
            )}
            {user.hasPassword && (
              <Input
                className="mb-2"
                mode="password"
                placeholder={t("cloud_current_password")}
                value={passwords.current}
                onChange={setPw("current")}
                autoComplete="current-password"
              />
            )}
            <Input
              className="mb-2"
              mode="password"
              placeholder={`${t("cloud_new_password")} (${t("cloud_password_hint")})`}
              value={passwords.next}
              onChange={setPw("next")}
              autoComplete="new-password"
            />
            <Input
              className="mb-2"
              mode="password"
              placeholder={t("cloud_confirm_password")}
              value={passwords.confirm}
              onChange={setPw("confirm")}
              autoComplete="new-password"
            />
            {passwordError && (
              <div className="text-xs text-red-500 mb-2">{passwordError}</div>
            )}
            <Button
              htmlType="submit"
              loading={busy === "password"}
              disabled={
                !passwords.next || (user.hasPassword && !passwords.current)
              }
            >
              {user.hasPassword
                ? t("cloud_change_password")
                : t("cloud_set_password")}
            </Button>
          </form>
          <div className="mt-4">
            <Button
              type="tertiary"
              onClick={signOutOthers}
              loading={busy === "others"}
            >
              {t("cloud_sign_out_others")}
            </Button>
          </div>
        </Section>

        <Section title={t("cloud_danger_zone")} danger>
          <Banner
            type="danger"
            description={t("cloud_delete_account_warning")}
            closeIcon={null}
            className="mb-3 rounded-md"
          />
          <Input
            className="mb-2"
            mode={user.hasPassword ? "password" : undefined}
            placeholder={
              user.hasPassword
                ? t("cloud_delete_confirm_password")
                : t("cloud_delete_confirm_email", { email: user.email })
            }
            value={deleteConfirm}
            onChange={setDeleteConfirm}
          />
          {deleteError && (
            <div className="text-xs text-red-500 mb-2">{deleteError}</div>
          )}
          <Button
            type="danger"
            theme="solid"
            onClick={deleteAccount}
            loading={busy === "delete"}
            disabled={!deleteConfirm}
          >
            {t("cloud_delete_account")}
          </Button>
        </Section>
      </div>
    </Modal>
  );
}
