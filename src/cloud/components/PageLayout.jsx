import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSettings, useThemedPage } from "../../hooks";
import logo_light from "../../assets/logo_light_160.png";
import logo_dark from "../../assets/logo_dark_160.png";
import { useAuth } from "../AuthContext";
import AccountMenu from "./AccountMenu";
import LanguageSwitch from "./LanguageSwitch";

const tab = ({ isActive }) =>
  `px-3 py-1.5 rounded-md text-base font-semibold ${
    isActive ? "bg-[var(--semi-color-fill-0)]" : "opacity-70 hover:opacity-100"
  }`;

/** Header and body of the pages outside the editor (diagrams, teams). */
export default function PageLayout({ children }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { user } = useAuth();
  useThemedPage();

  return (
    <div className="min-h-screen bg-[var(--semi-color-bg-0)] text-[var(--semi-color-text-0)]">
      <div className="py-4 px-12 sm:px-4 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <Link to="/">
            <img
              src={settings.mode === "dark" ? logo_dark : logo_light}
              alt="logo"
              className="h-[40px] sm:h-[28px]"
            />
          </Link>
          {user && (
            <nav className="flex gap-1">
              <NavLink to="/" end className={tab}>
                {t("cloud_diagrams")}
              </NavLink>
              <NavLink to="/teams" className={tab}>
                {t("cloud_teams")}
              </NavLink>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitch />
          <AccountMenu variant="landing" />
        </div>
      </div>
      <hr className="border-[var(--semi-color-border)]" />
      <div className="px-12 sm:px-4 py-6 max-w-6xl mx-auto">{children}</div>
    </div>
  );
}
