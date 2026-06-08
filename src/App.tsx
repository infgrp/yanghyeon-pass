import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import StudentHome from "./pages/StudentHome";
import ApplyPass from "./pages/ApplyPass";
import PassDetail from "./pages/PassDetail";
import TeacherHome from "./pages/TeacherHome";
import AdminHome from "./pages/AdminHome";

/** 로그인 상태/역할에 따라 시작 경로 결정 */
function HomeRedirect() {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="center muted">불러오는 중…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role === "admin") return <Navigate to="/admin" replace />;
  if (profile?.role === "teacher") return <Navigate to="/teacher" replace />;
  return <StudentHome />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route
        path="/apply"
        element={
          <ProtectedRoute role="student">
            <ApplyPass />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pass/:id"
        element={
          <ProtectedRoute>
            <PassDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/teacher"
        element={
          <ProtectedRoute role="teacher">
            <TeacherHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <AdminHome />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
