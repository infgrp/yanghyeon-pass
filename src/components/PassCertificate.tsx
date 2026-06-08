import type { PassCertificateData } from "../lib/types";
import {
  TYPE_LABEL,
  STATUS_LABEL,
  STATUS_COLOR,
  SCHOOL_NAME,
  formatStudentId,
} from "../lib/constants";

/**
 * 외출증 양식 컴포넌트 — Zero-Image UI (가이드북 1-1)
 *
 * 학교 마크(엠블럼), 격자 테두리, 텍스트 배치 등 외형은 전부 이 코드에 내장됩니다.
 * 서버는 외형을 전송하지 않으며, 오직 PassCertificateData(JSON 텍스트)만 받습니다.
 */
export default function PassCertificate({ data }: { data: PassCertificateData }) {
  const statusColor = STATUS_COLOR[data.status] ?? "#1e3a5f";

  return (
    <div className="cert">
      <div className="cert-head">
        <span className="cert-no">No. {String(data.pass_id).padStart(6, "0")}</span>
        {/* 학교 엠블럼: 인라인 SVG (이미지 다운로드 없음) */}
        <svg className="cert-emblem" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="46" fill="none" stroke="#1e3a5f" strokeWidth="4" />
          <path
            d="M50 18 L62 42 L88 42 L67 58 L75 84 L50 68 L25 84 L33 58 L12 42 L38 42 Z"
            fill="#1e3a5f"
          />
          <text
            x="50"
            y="56"
            textAnchor="middle"
            fontSize="14"
            fontWeight="800"
            fill="#fff"
          >
            陽
          </text>
        </svg>
        <div className="cert-title">
          {data.type === 1 ? "조퇴증" : "외출증"}
        </div>
        <div className="cert-school">{SCHOOL_NAME}</div>
      </div>

      <table className="cert-table">
        <tbody>
          <tr>
            <th>학번</th>
            <td>{formatStudentId(data.student_no)}</td>
          </tr>
          <tr>
            <th>성명</th>
            <td>{data.name}</td>
          </tr>
          <tr>
            <th>구분</th>
            <td>{TYPE_LABEL[data.type] ?? "-"}</td>
          </tr>
          <tr>
            <th>일자</th>
            <td>{data.date}</td>
          </tr>
          <tr>
            <th>시간</th>
            <td>{data.time_window}</td>
          </tr>
          <tr className="cert-reason">
            <th>사유</th>
            <td>{data.reason}</td>
          </tr>
        </tbody>
      </table>

      <div className="cert-foot">
        <div
          className="cert-stamp"
          style={{ ["--status-color" as string]: statusColor }}
        >
          {STATUS_LABEL[data.status] ?? "-"}
        </div>
        <div className="teacher">
          담당교사 <b>{data.teacher_name || "—"}</b> (인)
        </div>
        <div className="issued">{SCHOOL_NAME}장</div>
      </div>
    </div>
  );
}
