import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * В корне проекта лежит папка `video/` с исходными роликами вечера. В dev её
 * отдаёт сам Vite, а сборка про неё не знает: файлы не попадают в `dist`, и
 * фильм «Монолиты» открывается с пустыми экранами. Копируем папку в сборку
 * как есть — ролики должны оставаться обычными файлами (110 МиБ в base64
 * внутри единственного HTML сделали бы страницу нерабочей).
 */
function copyVideoFolder(): Plugin {
  return {
    name: "studio-copy-video",
    apply: "build",
    closeBundle() {
      const from = path.resolve(__dirname, "video");
      const to = path.resolve(__dirname, "dist", "video");
      if (!fs.existsSync(from)) return;
      // Рекурсивно: кроме роликов вечера в корне есть video/gallery/01..10.mp4
      // (клипы видеогалереи), их тоже надо забрать в сборку.
      fs.cpSync(from, to, { recursive: true });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), copyVideoFolder()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Студия живёт в песочнице и открывается через прокси-хост превью
  // (https://<port>-<sandbox>.e2b.app). Vite по умолчанию принимает только
  // localhost и отвечает 403 на такой Host, то есть предпросмотр не грузится.
  // Точечно разрешаем поддомены превью, а не отключаем проверку целиком.
  server: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app", ".arena.ai", "localhost", "127.0.0.1"],
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app", ".arena.ai", "localhost", "127.0.0.1"],
  },
});
