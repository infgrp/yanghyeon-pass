import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../lib/types";

/**
 * 로그인 + (선택)역할 검사 후 자식 렌더링.
 * role 미지정 시 로그인만 확인합니다.
 */
export default function ProtectedRoute({
  children,
  role,
}: {
  children: ReactNode;
  role?: Role;
}) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <div className="center muted">불러오는 중…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (role && profile?.role !== role) {
    // 권한 불일치 → 역할에 맞는 홈으로 보냄
    const home = profile?.role === "teacher" ? "/teacher" : "/";
    return <Navigate to={home} replace />;
  }
  return <>{children}</>;
}
