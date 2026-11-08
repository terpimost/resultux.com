import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const page = new URL("../index.html", import.meta.url);
const result = await build({
  absWorkingDir: root,
  entryPoints: ["js/landing.js"],
  bundle: true,
  write: false,
  format: "iife",
  minify: true,
  target: "es2020",
  legalComments: "none",
});
const javascript = result.outputFiles[0].text.replace(
  /<\/script/gi,
  "<\\/script",
);
const html = await readFile(page, "utf8");
const marker =
  /(?:[ \t]*<!-- prettier-ignore -->\n)?[ \t]*<script\b[^>]*(?:data-wave-bundle|src="\.\/js\/landing\.js[^\"]*")[^>]*>[\s\S]*?<\/script>/;
if (!marker.test(html)) throw Error("Landing-page script marker not found");
await writeFile(
  page,
  html.replace(
    marker,
    () =>
      `    <!-- prettier-ignore -->\n    <script data-wave-bundle>${javascript.trim()}</script>`,
  ),
);
console.log(
  `Inlined landing JavaScript (${Buffer.byteLength(javascript)} bytes).`,
);
