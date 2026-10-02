import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { useLayoutEffect } from "react";
import Editor from "./pages/Editor";
import SettingsContextProvider from "./context/SettingsContext";
import NotFound from "./pages/NotFound";
import MigrationBanner, { isLegacyHost } from "./components/MigrationBanner";
import CloudProvider from "./cloud/CloudProvider";
import { ResetPasswordPage, VerifyEmailPage } from "./cloud/pages/AuthPages";
import DiagramsPage from "./cloud/pages/DiagramsPage";
import TeamsPage from "./cloud/pages/TeamsPage";

export default function App() {
  const routes = (
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
