import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { auth, errorCode } from "./api";
import { errorMessage } from "./i18n";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Session state for the whole app.
 * status: "loading" | "ready" | "unavailable" (no server or no database,
 * in which case every account feature stays hidden).
 */
export default function AuthProvider({ children }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState("loading");
  const [providers, setProviders] = useState(null);
  const [user, setUser] = useState(null);
  // Which dialog is open: null | "signin" | "signup" | "forgot" | "settings"
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const available = await auth.providers();
        if (cancelled) return;
        setProviders(available);
        try {
          const me = await auth.me();
          if (!cancelled) setUser(me);
        } catch {
          // Not signed in
        }
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // OAuth failures come back as ?auth_error=<code>
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("auth_error");
    if (!code) return;
    Toast.error(errorMessage(t, code));
    url.searchParams.delete("auth_error");
    window.history.replaceState(null, "", url.toString());
  }, [t]);

  const signIn = useCallback(async (body) => {
    const me = await auth.login(body);
    setUser(me);
    return me;
  }, []);

  const signUp = useCallback(async (body) => {
    const me = await auth.register(body);
    setUser(me);
    return me;
  }, []);

  const signOut = useCallback(async () => {
    await auth.logout().catch(() => {});
    setUser(null);
    Toast.info(t("cloud_signed_out"));
    // A server diagram can't stay open (or be saved) once signed out
    if (window.location.pathname.startsWith("/editor/diagrams/")) {
      window.location.assign("/editor");
    }
  }, [t]);

  const refresh = useCallback(async () => {
    try {
      setUser(await auth.me());
    } catch (e) {
      if (errorCode(e) === "not_signed_in") setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      status,
      available: status === "ready",
      providers,
      user,
      setUser,
      signIn,
      signUp,
      signOut,
      refresh,
      dialog,
      openDialog: setDialog,
      closeDialog: () => setDialog(null),
    }),
    [status, providers, user, signIn, signUp, signOut, refresh, dialog],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
