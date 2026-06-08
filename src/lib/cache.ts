/**
 * 로컬 캐싱 + 오프라인 검증 유틸 (가이드북 1-2)
 *
 * 승인된 외출증을 기기 내부 저장소(localStorage)에 AES-GCM 으로 암호화 저장합니다.
 * 교문(경비실)에서는 서버 재요청 없이 이 캐시만으로 화면을 렌더링하므로
 * 추가 데이터 소모가 없고 음영 지역에서도 동작합니다.
 *
 * 주의: 브라우저 로컬 암호화는 "평문 저장 방지" 수준의 보호입니다.
 *      키가 동일 기기에 있으므로 기기 자체가 탈취되면 복호화될 수 있습니다.
 */
import type { PassCertificateData } from "./types";

const KEY_STORAGE = "yhp.cache.key";
const DATA_PREFIX = "yhp.pass.";

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/** 기기별 AES-GCM 키를 가져오거나 없으면 생성하여 localStorage 에 보관 */
async function getKey(): Promise<CryptoKey> {
  const existing = localStorage.getItem(KEY_STORAGE);
  if (existing) {
    return crypto.subtle.importKey(
      "raw",
      fromB64(existing),
      "AES-GCM",
      true,
      ["encrypt", "decrypt"],
    );
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const raw = await crypto.subtle.exportKey("raw", key);
  localStorage.setItem(KEY_STORAGE, toB64(raw));
  return key;
}

/** 승인된 외출증을 암호화하여 캐싱 */
export async function cachePass(data: PassCertificateData): Promise<void> {
  try {
    const key = await getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(data));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
    const payload = JSON.stringify({ iv: toB64(iv.buffer), c: toB64(cipher) });
    localStorage.setItem(DATA_PREFIX + data.pass_id, payload);
  } catch (e) {
    console.warn("캐시 저장 실패:", e);
  }
}

/** 캐싱된 외출증 복호화 */
export async function readCachedPass(
  passId: number,
): Promise<PassCertificateData | null> {
  try {
    const raw = localStorage.getItem(DATA_PREFIX + passId);
    if (!raw) return null;
    const { iv, c } = JSON.parse(raw) as { iv: string; c: string };
    const key = await getKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(iv) },
      key,
      fromB64(c),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as PassCertificateData;
  } catch (e) {
    console.warn("캐시 복호화 실패:", e);
    return null;
  }
}

/** 캐싱된 모든 외출증 목록 (최근순) */
export async function listCachedPasses(): Promise<PassCertificateData[]> {
  const out: PassCertificateData[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(DATA_PREFIX)) continue;
    const id = Number(k.slice(DATA_PREFIX.length));
    const p = await readCachedPass(id);
    if (p) out.push(p);
  }
  return out.sort((a, b) => b.pass_id - a.pass_id);
}

export function removeCachedPass(passId: number): void {
  localStorage.removeItem(DATA_PREFIX + passId);
}
