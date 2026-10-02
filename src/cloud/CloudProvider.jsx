import { useEffect, useMemo } from "react";
import ExtensionsContext from "../context/ExtensionsContext";
import { CollabContext } from "../context/CollabContext";
import AuthProvider, { useAuth } from "./AuthContext";
import AuthDialog from "./components/AuthDialog";
import AccountMenu from "./components/AccountMenu";
import AccountSettings from "./components/AccountSettings";
import ConflictDialog from "./components/ConflictDialog";
import {
  NoAccessOverlay,
  SignInToEditBanner,
  SignInToOpenOverlay,
} from "./components/DiagramAccessOverlay";
import { EditorShare } from "./components/ShareDialog";
import TrashDialog from "./components/TrashDialog";
import VersionHistory from "./components/VersionHistory";
import VersionPreviewBanner from "./components/VersionPreviewBanner";
import {
  cloudHooks,
  hasUnsavedChanges,
  loadWithLink,
  resetCloudState,
} from "./diagrams";
import CollabBridge from "./collab/CollabBridge";
import LiveCursors from "./collab/LiveCursors";
import PresenceBar from "./collab/PresenceBar";
import { activeSession } from "./collab/session";
import "./i18n";

/** Over the canvas when signed out: share links, live view-only. */
function GuestOverlay(props) {
  return (
    <>
      <CollabBridge {...props} />
      <SignInToOpenOverlay />
      <SignInToEditBanner />
    </>
  );
}

/** Over the canvas when signed in. */
function EditorOverlay(props) {
  return (
    <>
      <CollabBridge {...props} />
      <ConflictDialog />
      <VersionPreviewBanner />
      <NoAccessOverlay />
    </>
  );
}

// Changes go through the live session's state diffing, not emitDelta; the
// canvas's awareness (the relationship line being dragged) goes to the others
const collab = {
  emitDelta: () => {},
  emitAwareness: (update) => activeSession()?.sendAwareness(update),
  isApplyingRemoteRef: { current: false },
};

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
      // Signed out: share links still open diagrams (view only); other
      // links to someone's diagram ask to sign in
      cloudLoad: loadWithLink,
      "canvas-overlay": <GuestOverlay />,
      // Live editing: who's here, and their cursors on the canvas
      "header-actions-start": <PresenceBar />,
      "svg-overlay": <LiveCursors />,
      // Signed in: new diagrams are saved to the server, and the Open
      // dialog lists them next to the ones in this browser
      ...(userId && {
        ...cloudHooks,
        cloudCurrentUserId: userId,
        "canvas-overlay": <EditorOverlay />,
        "versions-panel": <VersionHistory />,
        // Sharing with people replaces upstream's public gist links
        "share-modal-content": <EditorShare />,
      }),
    }),
    [userId],
  );

  return (
    <ExtensionsContext.Provider value={extensions}>
      <CollabContext.Provider value={collab}>{children}</CollabContext.Provider>
      <AuthDialog />
      {/* Mounted on open, so they start from fresh data */}
      {dialog === "settings" && <AccountSettings />}
      {dialog === "trash" && <TrashDialog />}
    </ExtensionsContext.Provider>
  );
}
