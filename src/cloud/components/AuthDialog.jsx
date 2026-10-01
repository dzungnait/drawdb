import { useEffect, useState } from "react";
import { Banner, Button, Divider, Input, Modal } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { auth, errorCode, fieldErrors } from "../api";
import { errorMessage, PROVIDER_NAMES } from "../i18n";

const PROVIDER_ICONS = { google: "bi bi-google", github: "bi bi-github" };

function Field({ label, error, ...props }) {
  return (
    <label className="block mb-3">
      <div className="text-sm font-medium mb-1">{label}</div>
      <Input validateStatus={error ? "error" : "default"} {...props} />
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </label>
  );
}

export default function AuthDialog() {
  const { t } = useTranslation();
  const { dialog, openDialog, closeDialog, providers, signIn, signUp } =
    useAuth();
  const mode = ["signin", "signup", "forgot"].includes(dialog) ? dialog : null;

  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setErrors({});
    setMessage(null);
  }, [mode]);

  if (!mode) return null;

  const set = (key) => (value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const run = async (fn) => {
    setBusy(true);
    setErrors({});
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      const fields = fieldErrors(e);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setMessage({ type: "danger", text: errorMessage(t, errorCode(e)) });
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (mode === "signin") {
      return run(async () => {
        await signIn({ email: form.email, password: form.password });
        closeDialog();
      });
    }
    if (mode === "signup") {
      return run(async () => {
        await signUp(form);
        closeDialog();
      });
    }
    return run(async () => {
      await auth.forgotPassword(form.email);
      setMessage({
        type: "success",
        text: t("cloud_reset_link_sent", { email: form.email }),
      });
    });
  };

  const oauth = providers?.oauth ?? [];
  const returnTo = window.location.pathname + window.location.search;
  const title = {
    signin: t("cloud_sign_in"),
    signup: t("cloud_sign_up"),
    forgot: t("cloud_forgot_password"),
  }[mode];

  return (
    <Modal
      title={title}
      visible
      onCancel={closeDialog}
      footer={null}
      width={400}
      centered
      closeOnEsc
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="pb-4"
      >
        {message && (
          <Banner
            type={message.type}
            description={message.text}
            closeIcon={null}
            className="mb-3 rounded-md"
          />
        )}

        {mode !== "forgot" && oauth.length > 0 && (
          <>
            {oauth.map((p) => (
              <Button
                key={p}
                block
                size="large"
                className="mb-2"
                icon={<i className={PROVIDER_ICONS[p]} />}
                onClick={() => {
                  window.location.href = auth.oauthUrl(p, returnTo);
                }}
              >
                {t("cloud_continue_with", { provider: PROVIDER_NAMES[p] ?? p })}
              </Button>
            ))}
            <Divider margin="12px">{t("cloud_or")}</Divider>
          </>
        )}

        {mode === "signup" && (
          <Field
            label={t("cloud_name")}
            value={form.name}
            onChange={set("name")}
            error={errors.name}
            autoComplete="name"
            maxLength={100}
          />
        )}
        <Field
          label={t("cloud_email")}
          type="email"
          value={form.email}
          onChange={set("email")}
          error={errors.email}
          autoComplete="email"
        />
        {mode !== "forgot" && (
          <Field
            label={t("cloud_password")}
            mode="password"
            value={form.password}
            onChange={set("password")}
            error={errors.password}
            placeholder={mode === "signup" ? t("cloud_password_hint") : ""}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
          />
        )}

        {mode === "forgot" && providers && !providers.passwordReset ? (
          <Banner
            type="warning"
            description={t("cloud_reset_unavailable")}
            closeIcon={null}
          />
        ) : (
          <Button
            htmlType="submit"
            theme="solid"
            block
            size="large"
            loading={busy}
            disabled={mode === "signup" && providers && !providers.registration}
          >
            {mode === "forgot" ? t("cloud_send_reset_link") : title}
          </Button>
        )}

        <div className="mt-4 text-sm text-center space-y-1">
          {mode === "signin" && (
            <>
              <div>
                <a
                  className="text-blue-500 cursor-pointer"
                  onClick={() => openDialog("forgot")}
                >
                  {t("cloud_forgot_password")}
                </a>
              </div>
              {providers?.registration && (
                <div>
                  {t("cloud_no_account")}{" "}
                  <a
                    className="text-blue-500 cursor-pointer"
                    onClick={() => openDialog("signup")}
                  >
                    {t("cloud_sign_up")}
                  </a>
                </div>
              )}
            </>
          )}
          {mode === "signup" && (
            <div>
              {t("cloud_have_account")}{" "}
              <a
                className="text-blue-500 cursor-pointer"
                onClick={() => openDialog("signin")}
              >
                {t("cloud_sign_in")}
              </a>
            </div>
          )}
          {mode === "forgot" && (
            <a
              className="text-blue-500 cursor-pointer"
              onClick={() => openDialog("signin")}
            >
              {t("cloud_back_to_sign_in")}
            </a>
          )}
        </div>
      </form>
    </Modal>
  );
}
