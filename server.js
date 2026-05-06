const fs = require("fs");
const http = require("http");
const path = require("path");

const buildDir = path.join(__dirname, "build");
const indexFile = path.join(buildDir, "index.html");
const port = Number(process.env.PORT) || 3000;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal server error");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const normalizedPath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const resolvedPath = path.join(buildDir, normalizedPath);

  fs.stat(resolvedPath, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(res, resolvedPath);
      return;
    }

    if (!err && stats.isDirectory()) {
      const nestedIndex = path.join(resolvedPath, "index.html");
      fs.stat(nestedIndex, (nestedErr, nestedStats) => {
        if (!nestedErr && nestedStats.isFile()) {
          sendFile(res, nestedIndex);
          return;
        }

        sendFile(res, indexFile);
      });
      return;
    }

    sendFile(res, indexFile);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Serving build/ on port ${port}`);
});
