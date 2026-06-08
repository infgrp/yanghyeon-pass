import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vercel 호스팅 기준: 루트 도메인 배포(base "/"), 기본 출력 폴더 dist 사용.
export default defineConfig({
  plugins: [react()],
  base: "/",
});
