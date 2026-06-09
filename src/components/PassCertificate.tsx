import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { PassCertificateData } from "../lib/types";
import {
  TYPE_LABEL,
  STATUS_LABEL,
  STATUS_COLOR,
  SCHOOL_NAME,
  formatStudentId,
} from "../lib/constants";

/**
 * 외출증 양식 컴포넌트 — Zero-Image UI + 위조 방어
 *
 * 외형(엠블럼·테두리·배치)은 전부 코드에 내장(서버는 텍스트 JSON만 전송).
 * 위조 방어 단서:
 *  - 실시간 시계: 초 단위로 흐르는 현재 시각 → 정지 이미지/스크린샷과 구별
 *  - 홀로그램 띠/도장: CSS 애니메이션 → 캡처하면 멈춤
 *  - QR: 서버 실시간 검증 페이지로 연결 → 위조 이미지의 QR 은 무효
 */
export default function PassCertificate({ data }: { data: PassCertificateData }) {
  const statusColor = STATUS_COLOR[data.status] ?? "#1e3a5f";
  const isOuting = data.type === 2;

  // 실시간 시계 (라이브니스 단서)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const clock = now.toLocaleTimeString("ko-KR", { hour12: false });

  // QR: 공개 검증 페이지로 연결 (pass_id + verify_token)
  const verifyUrl = data.verify_token
    ? `${window.location.origin}/verify/${data.pass_id}?t=${data.verify_token}`
    : "";

  // 동적 검증코드 (표시용)
  const vcode = data.verify_token
    ? data.verify_token.replace(/-/g, "").slice(0, 6).toUpperCase()
    : String(data.pass_id).padStart(6, "0");

  return (
    <div className={`cert ${isOuting ? "cert-outing" : "cert-leave"}`}>
      {/* 홀로그램 상단 띠 */}
      <div className="cert-holo" />

      <div className="cert-head">
        <span className="cert-no">No. {String(data.pass_id).padStart(6, "0")}</span>
        <svg className="cert-emblem" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="emblemG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2d4f7c" />
              <stop offset="1" stopColor="#16324f" />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill="none" stroke="url(#emblemG)" strokeWidth="3" />
          <path
            d="M50 16 L61 41 L88 41 L66 57 L75 84 L50 67 L25 84 L34 57 L12 41 L39 41 Z"
            fill="url(#emblemG)"
          />
          <text x="50" y="56" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff">
            陽
          </text>
        </svg>
        <div className="cert-title">{isOuting ? "외출증" : "조퇴증"}</div>
        <div className="cert-school">{SCHOOL_NAME}</div>
      </div>

      <div className="cert-body">
        <div className="cert-field">
          <span className="k">성명</span>
          <span className="v big">{data.name}</span>
        </div>
        <div className="cert-field">
          <span className="k">학번</span>
          <span className="v">{formatStudentId(data.student_no)}</span>
        </div>
        <div className="cert-grid2">
          <div className="cert-field">
            <span className="k">구분</span>
            <span className="v">{TYPE_LABEL[data.type] ?? "-"}</span>
          </div>
          <div className="cert-field">
            <span className="k">일자</span>
            <span className="v">{data.date}</span>
          </div>
        </div>
        <div className="cert-field">
          <span className="k">시간</span>
          <span className="v">{data.time_window}</span>
        </div>
        <div className="cert-field">
          <span className="k">사유</span>
          <span className="v">{data.reason}</span>
        </div>
      </div>

      {/* 절취선 + QR 검증 영역 */}
      <div className="cert-perf">
        <span className="notch left" />
        <span className="dash" />
        <span className="notch right" />
      </div>

      <div className="cert-verify">
        <div className="cert-qr">
          {verifyUrl ? (
            <QRCodeSVG value={verifyUrl} size={92} level="M" includeMargin={false} />
          ) : (
            <div className="qr-skel" />
          )}
        </div>
        <div className="cert-verify-info">
          <div
            className="cert-stamp"
            style={{ ["--status-color" as string]: statusColor }}
          >
            <span className="cert-stamp-shine" />
            {STATUS_LABEL[data.status] ?? "-"}
          </div>
          <div className="cert-meta">
            <div>담당 <b>{data.teacher_name || "—"}</b></div>
            <div className="vcode">검증코드 {vcode}</div>
            <div className="liveclock">
              <span className="dot" /> {clock}
            </div>
          </div>
        </div>
      </div>

      <div className="cert-foot-line">
        QR을 교문에서 제시하면 실시간 진위 확인 · {SCHOOL_NAME}장
      </div>
    </div>
  );
}
