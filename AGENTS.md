# AGENTS.md

Заметки для агентов, работающих в этом репозитории.

## Headless-Chromium для визуальной проверки (@sparticuz/chromium)

В песочнице нет системного Chrome и нет root на `apt`, поэтому обычная
установка браузера для скриншотов не проходит. Используется
`@sparticuz/chromium` (devDependency): бинарник + swiftshader (WebGL) +
шрифты входят в комплект, системные библиотеки (libnss3, libnspr4 и пр.)
лежат в `bin/al2023.tar.br`.

Важно: на обычной Linux-машине `isRunningInAmazonLinux2023()` возвращает
`false`, поэтому пакет сам `al2023.tar.br` не распаковывает, и `/tmp/chromium`
падает с `libnspr4.so: cannot open shared object file`. `scripts/preview-shot.mjs`
распаковывает все четыре архива вручную и подставляет `LD_LIBRARY_PATH=/tmp/al2023/lib`.

Проверено на этом окружении: работает.

Скриншот сцены (нужен запущенный `npm run dev`, порт `PREVIEW_BASE`, по умолчанию
`http://127.0.0.1:5174`):

```bash
node scripts/preview-shot.mjs sponsor-keaz 17.23 /tmp/keaz.png
node scripts/preview-shot.mjs gallery
```

Второй аргумент — время ролика в секундах (рендерится через `renderAt`), третий —
путь к PNG. Без второго аргумента кадр остаётся на текущем времени воспроизведения.
После правок композиции обязательно делать скриншот сцены, а не только
`node --test` — тесты видят логику, но не видят кадр.
