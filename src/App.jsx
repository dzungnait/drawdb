import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useLayoutEffect } from "react";
import Editor from "./pages/Editor";
import BugReport from "./pages/BugReport";
import Templates from "./pages/Templates";
import LandingPage from "./pages/LandingPage";
import SettingsContextProvider from "./context/SettingsContext";
import NotFound from "./pages/NotFound";
import MigrationBanner, { isLegacyHost } from "./components/MigrationBanner";
import CloudProvider from "./cloud/CloudProvider";
import { ResetPasswordPage, VerifyEmailPage } from "./cloud/pages/AuthPages";

export default function App() {
  const routes = (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/editor" element={<Editor />} />
      <Route path="/editor/diagrams/:id" element={<Editor />} />
      <Route path="/editor/templates/:id" element={<Editor />} />
      <Route path="/bug-report" element={<BugReport />} />
      <Route path="/templates" element={<Templates />} />
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
