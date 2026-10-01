import { useNavigate } from "react-router-dom";
import { Button, Empty } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useThemedPage } from "../hooks";

export default function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  useThemedPage();

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--semi-color-bg-0)]">
      <Empty
        image={<div className="text-6xl font-bold opacity-30">404</div>}
        title={t("cloud_page_not_found")}
      >
        <Button theme="solid" onClick={() => navigate("/")}>
          {t("cloud_go_home")}
        </Button>
      </Empty>
    </div>
  );
}
