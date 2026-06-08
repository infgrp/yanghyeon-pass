import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages 배포 시 저장소 이름에 맞춰 base 를 조정하세요.
// 예: https://<user>.github.io/yanghyeon_pass/  ->  base: "/yanghyeon_pass/"
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "docs", // GitHub Pages(docs/) 배포용
  },
});
