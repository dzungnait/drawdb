import { useEffect, useMemo } from "react";
import ExtensionsContext from "../context/ExtensionsContext";
import AuthProvider, { useAuth } from "./AuthContext";
import AuthDialog from "./components/AuthDialog";
import AccountMenu from "./components/AccountMenu";
import AccountSettings from "./components/AccountSettings";
import ConflictDialog from "./components/ConflictDialog";
import TrashDialog from "./components/TrashDialog";
import VersionHistory from "./components/VersionHistory";
import VersionPreviewBanner from "./components/VersionPreviewBanner";
import { cloudHooks, hasUnsavedChanges, resetCloudState } from "./diagrams";
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
  const { dialog, user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    resetCloudState();
  }, [userId]);

  useEffect(() => {
    const warn = (e) => {
      if (!hasUnsavedChanges()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const extensions = useMemo(
    () => ({
      "header-actions-end": <AccountMenu />,
      // Signed in: new diagrams are saved to the server, and the Open
      // dialog lists them next to the ones in this browser
      ...(userId && {
        ...cloudHooks,
        cloudCurrentUserId: userId,
        "canvas-overlay": (
          <>
            <ConflictDialog />
            <VersionPreviewBanner />
          </>
        ),
        "versions-panel": <VersionHistory />,
      }),
    }),
    [userId],
  );

  return (
    <ExtensionsContext.Provider value={extensions}>
      {children}
      <AuthDialog />
      {/* Mounted on open, so they start from fresh data */}
      {dialog === "settings" && <AccountSettings />}
      {dialog === "trash" && <TrashDialog />}
    </ExtensionsContext.Provider>
  );
}
