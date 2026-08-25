import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
    const safePath = normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
    let filePath = join(root, safePath);

    const fileStat = await stat(filePath).catch(() => null);
    if (fileStat?.isDirectory()) filePath = join(filePath, "index.html");

    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(body);
  } catch {
    try {
      const fallback = await readFile(join(root, "index.html"));
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
      response.end(fallback);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Página não encontrada");
    }
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`FIA Estoque disponível em http://localhost:${port}`);
});
