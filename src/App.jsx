import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { lazy, Suspense, useLayoutEffect } from "react";
import { Spin } from "@douyinfe/semi-ui";
import SettingsContextProvider from "./context/SettingsContext";
import NotFound from "./pages/NotFound";
import MigrationBanner, { isLegacyHost } from "./components/MigrationBanner";
import CloudProvider from "./cloud/CloudProvider";
import DiagramsPage from "./cloud/pages/DiagramsPage";

// Loaded when visited, so the home page doesn't wait for the editor
const Editor = lazy(() => import("./pages/Editor"));
const TeamsPage = lazy(() => import("./cloud/pages/TeamsPage"));
const ResetPasswordPage = lazy(() =>
  import("./cloud/pages/AuthPages").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const VerifyEmailPage = lazy(() =>
  import("./cloud/pages/AuthPages").then((m) => ({
    default: m.VerifyEmailPage,
  })),
);

export default function App() {
  const routes = (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center">
          <Spin size="large" />
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<DiagramsPage />} />
        <Route path="/diagrams" element={<Navigate to="/" replace />} />
        <Route path="/teams" element={<TeamsPage />} />
        <Route path="/teams/:id" element={<TeamsPage />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/editor/diagrams/:id" element={<Editor />} />
        <Route path="/editor/templates/:id" element={<Editor />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );

  return (
    <BrowserRouter>
      <SettingsContextProvider>
        <CloudProvider>
          <RestoreScroll />
          {isLegacyHost() ? (
            <div className="h-full flex flex-col">
              <MigrationBanner />
              <div className="flex-1 min-h-0">{routes}</div>
            </div>
          ) : (
            routes
          )}
        </CloudProvider>
      </SettingsContextProvider>
    </BrowserRouter>
  );
}

function RestoreScroll() {
  const location = useLocation();
  useLayoutEffect(() => {
    window.scroll(0, 0);
  }, [location.pathname]);
  return null;
}
