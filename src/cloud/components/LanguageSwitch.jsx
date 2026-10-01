import { Button, Dropdown } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { languages } from "../../i18n/i18n";

/** Language picker for pages outside the editor (the editor has Settings). */
export default function LanguageSwitch() {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage;

  return (
    <Dropdown
      trigger="click"
      position="bottomRight"
      render={
        <Dropdown.Menu>
          {languages.map((l) => (
            <Dropdown.Item
              key={l.code}
              active={l.code === current}
              onClick={() => i18n.changeLanguage(l.code)}
            >
              {l.native_name}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      }
    >
      <Button
        theme="borderless"
        type="tertiary"
        icon={<i className="bi bi-translate" />}
        aria-label="Language"
      >
        {current?.toUpperCase()}
      </Button>
    </Dropdown>
  );
}
