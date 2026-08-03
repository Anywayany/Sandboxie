"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const SHELL_HOST = "127.0.0.1";
const SHELL_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src http://127.0.0.1:*",
  "form-action 'none'"
].join("; ");

const SHELL_FILES = new Map([
  ["/", { name: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/index.html", { name: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/app.js", { name: "app.js", contentType: "text/javascript; charset=utf-8" }],
  ["/styles.css", { name: "styles.css", contentType: "text/css; charset=utf-8" }]
]);

function loadShellFiles(rendererRoot, readFileSync = fs.readFileSync) {
  return new Map([...SHELL_FILES].map(([urlPath, file]) => [
    urlPath,
    {
      body: readFileSync(path.join(rendererRoot, file.name)),
      contentType: file.contentType
    }
  ]));
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

async function startShellServer(rendererRoot, options = {}) {
  const host = options.host || SHELL_HOST;
  const files = loadShellFiles(rendererRoot, options.readFileSync);
  const createServer = options.createServer || http.createServer;
  const server = createServer((request, response) => {
    const method = request.method || "GET";
    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405, {
        Allow: "GET, HEAD",
        "Cache-Control": "no-store"
      });
      response.end();
      return;
    }

    let requestUrl;
    try {
      requestUrl = new URL(request.url || "/", `http://${host}`);
    } catch {
      response.writeHead(400, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    const file = requestUrl.search === "" ? files.get(requestUrl.pathname) : undefined;
    if (!file) {
      response.writeHead(404, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff"
      });
      response.end(method === "HEAD" ? undefined : "Not found");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Security-Policy": SHELL_CSP,
      "Content-Type": file.contentType,
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(method === "HEAD" ? undefined : file.body);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  server.unref();

  const address = server.address();
  if (!address || typeof address === "string" || !address.port) {
    await closeServer(server);
    throw new Error("Windows did not allocate a Wendi shell loopback port.");
  }

  return Object.freeze({
    origin: `http://${host}:${address.port}`,
    close: () => closeServer(server)
  });
}

module.exports = {
  SHELL_CSP,
  SHELL_HOST,
  closeServer,
  loadShellFiles,
  startShellServer
};
