import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
/** Explicit reauthentication clears the invalid JWT; /login otherwise redirects authenticated users. */
export function WarningSessionAction() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        logout();
        navigate("/login", { replace: true });
      }}
    >
      Đăng nhập lại
    </button>
  );
}
