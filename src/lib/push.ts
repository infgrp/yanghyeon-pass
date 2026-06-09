/**
 * 웹 푸시 구독 유틸 (담임 즉시 알림)
 *
 * 교사가 '알림 켜기' 하면: 알림 권한 요청 → 서비스워커 등록 →
 * PushManager 구독 → 구독정보를 push_subscriptions 에 저장.
 * 학생이 신청하면 notify-pass 함수가 담임의 구독으로 푸시를 보냅니다.
 */
import { supabase } from "./supabase";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js");
}

/** 현재 구독 상태 */
export async function isSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

/** 알림 켜기: 권한 + 구독 + DB 저장 */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error("이 기기/브라우저는 웹 푸시를 지원하지 않습니다.");
  if (!VAPID_PUBLIC) throw new Error("VAPID 공개키(VITE_VAPID_PUBLIC_KEY)가 설정되지 않았습니다.");

  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("알림 권한이 거부되었습니다.");

  const reg = await registerServiceWorker();
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }

  const json = sub.toJSON();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("로그인이 필요합니다.");

  // 동일 endpoint 는 upsert
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: uid,
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
    },
    { onConflict: "endpoint" },
  );
  if (error) throw new Error(error.message);
}

/** 알림 끄기: 구독 해제 + DB 삭제 */
export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
  }
}
