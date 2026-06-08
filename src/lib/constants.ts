// 데이터 절약을 위해 분류는 정수 코드로 관리합니다.

export const PASS_TYPE = {
  EARLY_LEAVE: 1, // 조퇴
  OUTING: 2, // 외출
} as const;

export const PASS_STATUS = {
  PENDING: 0, // 대기
  APPROVED: 1, // 승인
  REJECTED: 2, // 반려
  USED: 3, // 사용완료(하교)
} as const;

export const TYPE_LABEL: Record<number, string> = {
  1: "조퇴",
  2: "외출",
};

export const STATUS_LABEL: Record<number, string> = {
  0: "대기중",
  1: "승인",
  2: "반려",
  3: "사용완료",
};

export const STATUS_COLOR: Record<number, string> = {
  0: "#b8860b", // 대기 - 황색
  1: "#1f7a3d", // 승인 - 녹색
  2: "#b23b3b", // 반려 - 적색
  3: "#5a5a5a", // 완료 - 회색
};

export const SCHOOL_NAME = "양현고등학교";

/** 학번 "30101" -> { grade: 3, cls: 1, num: 1 } */
export function parseStudentId(sid: string | null | undefined): {
  grade: number;
  cls: number;
  num: number;
} | null {
  if (!sid || sid.length < 5) return null;
  const grade = Number(sid[0]);
  const cls = Number(sid.slice(1, 3));
  const num = Number(sid.slice(3, 5));
  if ([grade, cls, num].some((n) => Number.isNaN(n))) return null;
  return { grade, cls, num };
}

/** "30101" -> "3학년 1반 1번" */
export function formatStudentId(sid: string | null | undefined): string {
  const p = parseStudentId(sid);
  if (!p) return sid ?? "-";
  return `${p.grade}학년 ${p.cls}반 ${p.num}번`;
}

/** "14:30:00" -> "14:30" */
export function trimTime(t: string | null | undefined): string {
  if (!t) return "";
  return t.slice(0, 5);
}
