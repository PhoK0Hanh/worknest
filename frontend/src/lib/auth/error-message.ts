import { FirebaseError } from "firebase/app";

export function authErrorMessage(error: unknown): string {
  // Never display raw SDK messages, credentials, or tokens to the user.
  if (!(error instanceof FirebaseError)) return "Chưa thể xử lý yêu cầu. Vui lòng thử lại.";
  switch (error.code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Email hoặc mật khẩu chưa đúng.";
    case "auth/email-already-in-use":
      return "Không thể đăng ký bằng email này. Hãy thử đăng nhập hoặc dùng email khác.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "Mật khẩu chưa đáp ứng yêu cầu bảo mật. Vui lòng chọn mật khẩu mạnh hơn.";
    case "auth/too-many-requests":
      return "Bạn đã thử quá nhiều lần. Vui lòng chờ một lúc rồi thử lại.";
    case "auth/network-request-failed":
      return "Không kết nối được. Hãy kiểm tra mạng và thử lại.";
    case "auth/user-disabled":
      return "Tài khoản hiện không thể đăng nhập.";
    default:
      return "Chưa thể xử lý yêu cầu đăng nhập. Vui lòng thử lại sau.";
  }
}
