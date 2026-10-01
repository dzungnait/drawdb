import { Avatar, Button, Dropdown, Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { auth } from "../api";

export function UserAvatar({ user, size = "small" }) {
  const initials = (user.name || user.email)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <Avatar
      size={size}
      src={user.avatarUrl ?? undefined}
      alt={user.name}
      color="light-blue"
    >
      {initials}
    </Avatar>
  );
}

/** Sign-in button, or the signed-in user's avatar with their menu. */
export default function AccountMenu({ variant = "editor" }) {
  const { t } = useTranslation();
  const { available, user, openDialog, signOut } = useAuth();
  const navigate = useNavigate();

  if (!available) return null;

  if (!user) {
    return (
      <Button
        type={variant === "landing" ? "primary" : "tertiary"}
        theme={variant === "landing" ? "solid" : "light"}
        className={variant === "editor" ? "!py-[18px] !rounded-md" : ""}
        onClick={() => openDialog("signin")}
      >
        {t("cloud_sign_in")}
      </Button>
    );
  }

  return (
    <Dropdown
      trigger="click"
      position="bottomRight"
      render={
        <Dropdown.Menu>
          <div className="px-4 py-2 max-w-64">
            <div className="font-semibold truncate">{user.name}</div>
            <div className="text-xs opacity-70 truncate">{user.email}</div>
          </div>
          <Dropdown.Divider />
          {!user.emailVerified && (
            <Dropdown.Item
              icon={<i className="fa-regular fa-envelope" />}
              onClick={() =>
                auth
                  .resendVerification()
                  .then(() => Toast.success(t("cloud_verification_sent")))
                  .catch(() => Toast.error(t("cloud_error.unknown")))
              }
            >
              {t("cloud_resend_verification")}
            </Dropdown.Item>
          )}
          <Dropdown.Item
            icon={<i className="fa-regular fa-folder-open" />}
            onClick={() => navigate("/diagrams")}
          >
            {t("cloud_my_diagrams")}
          </Dropdown.Item>
          <Dropdown.Item
            icon={<i className="fa-regular fa-trash-can" />}
            onClick={() => openDialog("trash")}
          >
            {t("cloud_trash")}
          </Dropdown.Item>
          <Dropdown.Item
            icon={<i className="fa-solid fa-gear" />}
            onClick={() => openDialog("settings")}
          >
            {t("cloud_account_settings")}
          </Dropdown.Item>
          <Dropdown.Item
            icon={<i className="fa-solid fa-arrow-right-from-bracket" />}
            onClick={signOut}
          >
            {t("cloud_sign_out")}
          </Dropdown.Item>
        </Dropdown.Menu>
      }
    >
      <button className="rounded-full" title={user.email}>
        <UserAvatar
          user={user}
          size={variant === "landing" ? "default" : "small"}
        />
      </button>
    </Dropdown>
  );
}
