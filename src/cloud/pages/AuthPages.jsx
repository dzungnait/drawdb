import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Banner, Button, Input, Spin } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import logo from "../../assets/logo_light_160.png";
import { useAuth } from "../AuthContext";
import { auth, errorCode, fieldErrors } from "../api";
import { errorMessage } from "../i18n";

function Card({ title, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 p-4">
      <div className="bg-white rounded-xl shadow-sm border w-full max-w-sm p-8 text-zinc-800">
        <Link to="/">
          <img src={logo} alt="drawDB" className="h-10 mx-auto mb-6" />
        </Link>
        <h1 className="text-xl font-semibold text-center mb-5">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState({ status: "pending" });
  const started = useRef(false);

  useEffect(() => {
    document.body.setAttribute("theme-mode", "light");
    // Tokens are single use: don't spend it twice in StrictMode
    if (started.current) return;
    started.current = true;
    auth
      .verifyEmail(params.get("token") ?? "")
      .then(() => {
        setState({ status: "done" });
        refresh();
      })
      .catch((e) => setState({ status: "error", code: errorCode(e) }));
  }, [params, refresh]);

  return (
    <Card title={t("cloud_email")}>
      {state.status === "pending" && (
        <div className="text-center">
          <Spin /> <div className="mt-2">{t("cloud_verifying_email")}</div>
        </div>
      )}
      {state.status === "done" && (
        <Banner
          type="success"
          description={t("cloud_email_verified")}
          closeIcon={null}
        />
      )}
      {state.status === "error" && (
        <Banner
          type="danger"
          description={errorMessage(t, state.code)}
          closeIcon={null}
        />
      )}
      {state.status !== "pending" && (
        <Link to="/editor">
          <Button theme="solid" block className="mt-5">
            {t("cloud_continue_to_drawdb")}
          </Button>
        </Link>
      )}
    </Card>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.body.setAttribute("theme-mode", "light");
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t("cloud_passwords_dont_match"));
      return;
    }
    setBusy(true);
    try {
      const user = await auth.resetPassword({
        token: params.get("token") ?? "",
        newPassword: password,
      });
      setUser(user);
      navigate("/editor", { replace: true });
    } catch (err) {
      setError(
        Object.values(fieldErrors(err))[0] ?? errorMessage(t, errorCode(err)),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t("cloud_choose_new_password")}>
      <form onSubmit={submit}>
        <Input
          className="mb-2"
          mode="password"
          size="large"
          placeholder={`${t("cloud_new_password")} (${t("cloud_password_hint")})`}
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
        />
        <Input
          className="mb-3"
          mode="password"
          size="large"
          placeholder={t("cloud_confirm_password")}
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
        {error && <div className="text-sm text-red-500 mb-3">{error}</div>}
        <Button
          htmlType="submit"
          theme="solid"
          block
          size="large"
          loading={busy}
          disabled={!password}
        >
          {t("cloud_choose_new_password")}
        </Button>
      </form>
    </Card>
  );
}
