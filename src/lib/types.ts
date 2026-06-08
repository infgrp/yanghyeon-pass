export type Role = "student" | "teacher" | "parent";

export interface UserProfile {
  id: string;
  student_id: string | null;
  name: string;
  role: Role;
  parent_phone: string | null;
}

export interface Pass {
  id: number;
  student_id: string;
  type: number; // 1: 조퇴, 2: 외출
  reason: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  status: number; // 0~3
  teacher_id: string | null;
  created_at: string;
  updated_at: string;
}

/** 교사 화면에서 학생 정보를 함께 보여줄 때 사용하는 조인 결과 */
export interface PassWithStudent extends Pass {
  student?: Pick<UserProfile, "name" | "student_id"> | null;
}

/**
 * 가이드북의 경량 조회 응답 JSON (외출증 렌더링/캐싱용, < 1KB)
 * 서버↔앱 사이에는 이 최소 형태만 오갑니다.
 */
export interface PassCertificateData {
  pass_id: number;
  student_no: string; // 학번 "30101"
  name: string;
  type: number;
  reason: string;
  date: string;
  time_window: string; // "14:00-16:30"
  status: number;
  teacher_name: string;
}
