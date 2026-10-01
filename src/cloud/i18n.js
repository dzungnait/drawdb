import i18n from "../i18n/i18n";

// Strings for the cloud features, kept apart from the upstream locale files
const strings = {
  en: {
    cloud_sign_in: "Sign in",
    cloud_sign_up: "Create account",
    cloud_sign_out: "Sign out",
    cloud_signed_out: "Signed out",
    cloud_email: "Email",
    cloud_password: "Password",
    cloud_name: "Name",
    cloud_new_password: "New password",
    cloud_current_password: "Current password",
    cloud_confirm_password: "Confirm new password",
    cloud_passwords_dont_match: "Passwords don't match",
    cloud_password_hint: "At least 8 characters",
    cloud_forgot_password: "Forgot password?",
    cloud_back_to_sign_in: "Back to sign in",
    cloud_no_account: "No account yet?",
    cloud_have_account: "Already have an account?",
    cloud_or: "or",
    cloud_continue_with: "Continue with {{provider}}",
    cloud_send_reset_link: "Send reset link",
    cloud_reset_link_sent:
      "If an account exists for {{email}}, a link to reset the password is on its way.",
    cloud_reset_unavailable:
      "Password reset by email isn't available on this server. Ask the administrator.",
    cloud_choose_new_password: "Choose a new password",
    cloud_password_updated: "Password updated",
    cloud_account_settings: "Account settings",
    cloud_profile: "Profile",
    cloud_security: "Security",
    cloud_danger_zone: "Danger zone",
    cloud_save: "Save",
    cloud_saved: "Saved",
    cloud_set_password: "Set a password",
    cloud_set_password_hint:
      "You sign in with {{providers}}. Set a password to also sign in with your email.",
    cloud_change_password: "Change password",
    cloud_sign_out_others: "Sign out other devices",
    cloud_signed_out_others: "Signed out of other devices",
    cloud_delete_account: "Delete account",
    cloud_delete_account_warning:
      "This permanently deletes your account and everything stored with it. It can't be undone.",
    cloud_delete_confirm_password: "Enter your password to confirm",
    cloud_delete_confirm_email: "Type {{email}} to confirm",
    cloud_account_deleted: "Account deleted",
    cloud_verify_email_banner:
      "Check {{email}} for a link to verify your address.",
    cloud_resend: "Resend",
    cloud_resend_verification: "Resend verification email",
    cloud_verification_sent: "Verification email sent",
    cloud_verifying_email: "Verifying your email...",
    cloud_email_verified: "Email verified",
    cloud_continue_to_drawdb: "Continue to drawDB",
    cloud_welcome: "Welcome, {{name}}",
    cloud_linked_with: "Linked with {{providers}}",
    cloud_trash: "Trash",
    cloud_trash_hint: "Deleted diagrams stay here for 30 days.",
    cloud_trash_empty: "The trash is empty",
    cloud_restore: "Restore",
    cloud_restored: "Diagram restored",
    cloud_delete_forever: "Delete forever",
    cloud_delete_forever_confirm: "This can't be undone.",
    cloud_deleted_forever: "Deleted forever",
    cloud_deleted_at: "deleted {{date}}",
    cloud_moved_to_trash:
      "Moved to trash. You can restore it from Trash in the account menu.",
    cloud_diagram_too_large: "This diagram is too large to save to the server",
    cloud_copy: "copy",
    cloud_saved_as_copy: "Your version was saved as a copy",
    cloud_conflict_title: "This diagram was changed elsewhere",
    cloud_conflict_body:
      "Someone (or you, in another tab or device) saved a newer version while you were editing. Your recent changes are not saved yet.",
    cloud_conflict_load_latest: "Load the latest version (discard my changes)",
    cloud_conflict_save_copy: "Save my version as a copy",
    cloud_conflict_overwrite: "Overwrite with my version",
    "cloud_error.diagram_limit_reached":
      "You've reached the maximum number of diagrams",
    "cloud_error.read_only": "You can only view this diagram",
    "cloud_error.diagram_not_found": "Diagram not found",
    "cloud_error.invalid_credentials": "Wrong email or password",
    "cloud_error.email_taken": "An account with this email already exists",
    "cloud_error.registration_disabled": "Sign-ups are disabled on this server",
    "cloud_error.wrong_password": "Password is incorrect",
    "cloud_error.invalid_token": "This link is invalid or has expired",
    "cloud_error.confirmation_mismatch": "The email doesn't match",
    "cloud_error.rate_limited":
      "Too many attempts. Try again in a few minutes.",
    "cloud_error.oauth_cancelled": "Sign-in was cancelled",
    "cloud_error.oauth_state_mismatch": "Sign-in expired. Please try again.",
    "cloud_error.oauth_email_unverified":
      "That account has no verified email address",
    "cloud_error.oauth_account_conflict":
      "Another account from this provider is already linked to this email",
    "cloud_error.oauth_failed": "Couldn't sign in with that provider",
    "cloud_error.network": "Can't reach the server",
    "cloud_error.unknown": "Something went wrong",
  },
  vi: {
    cloud_sign_in: "Đăng nhập",
    cloud_sign_up: "Tạo tài khoản",
    cloud_sign_out: "Đăng xuất",
    cloud_signed_out: "Đã đăng xuất",
    cloud_email: "Email",
    cloud_password: "Mật khẩu",
    cloud_name: "Tên",
    cloud_new_password: "Mật khẩu mới",
    cloud_current_password: "Mật khẩu hiện tại",
    cloud_confirm_password: "Nhập lại mật khẩu mới",
    cloud_passwords_dont_match: "Mật khẩu nhập lại không khớp",
    cloud_password_hint: "Ít nhất 8 ký tự",
    cloud_forgot_password: "Quên mật khẩu?",
    cloud_back_to_sign_in: "Quay lại đăng nhập",
    cloud_no_account: "Chưa có tài khoản?",
    cloud_have_account: "Đã có tài khoản?",
    cloud_or: "hoặc",
    cloud_continue_with: "Tiếp tục với {{provider}}",
    cloud_send_reset_link: "Gửi link đặt lại",
    cloud_reset_link_sent:
      "Nếu có tài khoản với {{email}}, link đặt lại mật khẩu đang được gửi tới.",
    cloud_reset_unavailable:
      "Máy chủ này chưa hỗ trợ đặt lại mật khẩu qua email. Hãy liên hệ quản trị viên.",
    cloud_choose_new_password: "Đặt mật khẩu mới",
    cloud_password_updated: "Đã cập nhật mật khẩu",
    cloud_account_settings: "Cài đặt tài khoản",
    cloud_profile: "Hồ sơ",
    cloud_security: "Bảo mật",
    cloud_danger_zone: "Vùng nguy hiểm",
    cloud_save: "Lưu",
    cloud_saved: "Đã lưu",
    cloud_set_password: "Đặt mật khẩu",
    cloud_set_password_hint:
      "Bạn đang đăng nhập bằng {{providers}}. Đặt mật khẩu để đăng nhập thêm bằng email.",
    cloud_change_password: "Đổi mật khẩu",
    cloud_sign_out_others: "Đăng xuất khỏi các thiết bị khác",
    cloud_signed_out_others: "Đã đăng xuất khỏi các thiết bị khác",
    cloud_delete_account: "Xoá tài khoản",
    cloud_delete_account_warning:
      "Thao tác này xoá vĩnh viễn tài khoản và mọi dữ liệu lưu kèm. Không thể hoàn tác.",
    cloud_delete_confirm_password: "Nhập mật khẩu để xác nhận",
    cloud_delete_confirm_email: "Gõ {{email}} để xác nhận",
    cloud_account_deleted: "Đã xoá tài khoản",
    cloud_verify_email_banner: "Hãy mở {{email}} để xác thực địa chỉ email.",
    cloud_resend: "Gửi lại",
    cloud_resend_verification: "Gửi lại email xác thực",
    cloud_verification_sent: "Đã gửi email xác thực",
    cloud_verifying_email: "Đang xác thực email...",
    cloud_email_verified: "Đã xác thực email",
    cloud_continue_to_drawdb: "Tiếp tục vào drawDB",
    cloud_welcome: "Xin chào, {{name}}",
    cloud_linked_with: "Đã liên kết với {{providers}}",
    cloud_trash: "Thùng rác",
    cloud_trash_hint: "Diagram đã xoá được giữ ở đây 30 ngày.",
    cloud_trash_empty: "Thùng rác trống",
    cloud_restore: "Khôi phục",
    cloud_restored: "Đã khôi phục diagram",
    cloud_delete_forever: "Xoá vĩnh viễn",
    cloud_delete_forever_confirm: "Không thể hoàn tác.",
    cloud_deleted_forever: "Đã xoá vĩnh viễn",
    cloud_deleted_at: "xoá lúc {{date}}",
    cloud_moved_to_trash:
      "Đã chuyển vào thùng rác. Có thể khôi phục trong mục Thùng rác ở menu tài khoản.",
    cloud_diagram_too_large: "Diagram quá lớn để lưu lên máy chủ",
    cloud_copy: "bản sao",
    cloud_saved_as_copy: "Đã lưu phiên bản của bạn thành bản sao",
    cloud_conflict_title: "Diagram đã bị thay đổi ở nơi khác",
    cloud_conflict_body:
      "Ai đó (hoặc chính bạn ở tab/thiết bị khác) vừa lưu phiên bản mới hơn trong lúc bạn đang sửa. Các thay đổi gần đây của bạn chưa được lưu.",
    cloud_conflict_load_latest: "Tải phiên bản mới nhất (bỏ thay đổi của tôi)",
    cloud_conflict_save_copy: "Lưu phiên bản của tôi thành bản sao",
    cloud_conflict_overwrite: "Ghi đè bằng phiên bản của tôi",
    "cloud_error.diagram_limit_reached": "Bạn đã đạt số lượng diagram tối đa",
    "cloud_error.read_only": "Bạn chỉ có quyền xem diagram này",
    "cloud_error.diagram_not_found": "Không tìm thấy diagram",
    "cloud_error.invalid_credentials": "Sai email hoặc mật khẩu",
    "cloud_error.email_taken": "Email này đã có tài khoản",
    "cloud_error.registration_disabled": "Máy chủ này đang tắt đăng ký",
    "cloud_error.wrong_password": "Mật khẩu không đúng",
    "cloud_error.invalid_token": "Link không hợp lệ hoặc đã hết hạn",
    "cloud_error.confirmation_mismatch": "Email không khớp",
    "cloud_error.rate_limited": "Thử quá nhiều lần. Hãy thử lại sau ít phút.",
    "cloud_error.oauth_cancelled": "Đã huỷ đăng nhập",
    "cloud_error.oauth_state_mismatch":
      "Phiên đăng nhập đã hết hạn, hãy thử lại.",
    "cloud_error.oauth_email_unverified":
      "Tài khoản đó chưa có email đã xác thực",
    "cloud_error.oauth_account_conflict":
      "Email này đã liên kết với một tài khoản khác của nhà cung cấp này",
    "cloud_error.oauth_failed": "Không đăng nhập được bằng nhà cung cấp đó",
    "cloud_error.network": "Không kết nối được máy chủ",
    "cloud_error.unknown": "Đã có lỗi xảy ra",
  },
};

// i18next reads "a.b" as a path, so dotted keys become nested objects
const nest = (flat) =>
  Object.entries(flat).reduce((acc, [key, value]) => {
    const [head, ...rest] = key.split(".");
    if (rest.length === 0) acc[head] = value;
    else (acc[head] ??= {})[rest.join(".")] = value;
    return acc;
  }, {});

for (const [lng, bundle] of Object.entries(strings)) {
  i18n.addResourceBundle(lng, "translation", nest(bundle), true, false);
}

export const PROVIDER_NAMES = { google: "Google", github: "GitHub" };

/** Translated message for a server error code. */
export const errorMessage = (t, code) =>
  t(`cloud_error.${code}`, { defaultValue: t("cloud_error.unknown") });
