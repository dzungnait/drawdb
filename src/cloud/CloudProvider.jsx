import { useMemo } from "react";
import ExtensionsContext from "../context/ExtensionsContext";
import AuthProvider, { useAuth } from "./AuthContext";
import AuthDialog from "./components/AuthDialog";
import AccountMenu from "./components/AccountMenu";
import AccountSettings from "./components/AccountSettings";
import "./i18n";

/**
 * Entry point of the cloud features. Plugs into the editor through the
 * extension slots upstream provides, so upstream files barely change.
 */
export default function CloudProvider({ children }) {
  return (
    <AuthProvider>
      <Extensions>{children}</Extensions>
    </AuthProvider>
  );
}

function Extensions({ children }) {
  const { dialog } = useAuth();
  const extensions = useMemo(
    () => ({
      "header-actions-end": <AccountMenu />,
    }),
    [],
  );

  return (
    <ExtensionsContext.Provider value={extensions}>
      {children}
      <AuthDialog />
      {/* Mounted on open, so its form starts from the current profile */}
      {dialog === "settings" && <AccountSettings />}
    </ExtensionsContext.Provider>
  );
}
