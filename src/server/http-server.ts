/**
 * HTTP File Server
 * Serves registered files via streaming
 */
import * as http from "node:http";
import * as fs from "node:fs";
import { getFileRegistry } from "./file-registry.js";

const DEFAULT_PORT = 8765;

class HttpFileServer {
  private server: http.Server | null = null;
  private port: number = DEFAULT_PORT;
  private startedAt: Date | null = null;

  async start(port: number = DEFAULT_PORT): Promise<number> {
    if (this.server) {
      console.error("[http-server] Already running");
      return this.port;
    }

    this.port = port;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((error) => {
          console.error("[http-server] Request error:", error);
          res.writeHead(500);
          res.end("Internal Server Error");
        });
      });

      this.server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          // Try next port
          console.error(`[http-server] Port ${this.port} in use, trying ${this.port + 1}`);
          this.port++;
          this.server?.listen(this.port);
        } else {
          reject(error);
        }
      });

      this.server.on("listening", () => {
        this.startedAt = new Date();
        console.error(`[http-server] Listening on http://localhost:${this.port}`);
        resolve(this.port);
      });

      this.server.listen(this.port);
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // CORS headers for browser access
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    // Parse URL to get file ID
    // Expected format: /files/{uuid}.{ext} or /{uuid}.{ext}
    const url = new URL(req.url || "/", `http://localhost:${this.port}`);
    const pathParts = url.pathname.split("/").filter(Boolean);

    // Handle /files/uuid.ext or /uuid.ext
    const filename = pathParts[pathParts.length - 1] || "";
    const match = filename.match(/^([0-9a-f-]{36})\.[^.]+$/i);

    if (!match) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const fileId = match[1];
    const registry = getFileRegistry();
    const registration = registry.get(fileId);

    if (!registration) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    // Set headers
    res.setHeader("Content-Type", registration.contentType);
    res.setHeader("Content-Length", registration.size);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${registration.filename}"`
    );
    res.setHeader("Cache-Control", "public, max-age=3600");

    if (req.method === "HEAD") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Stream the file
    res.writeHead(200);
    const stream = fs.createReadStream(registration.servePath);

    stream.on("error", (error) => {
      console.error(`[http-server] Stream error for ${fileId}:`, error);
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    });

    stream.pipe(res);

    console.error(
      `[http-server] Served: ${fileId} (${registration.filename}, ${registration.size} bytes)`
    );
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(() => {
        console.error("[http-server] Stopped");
        this.server = null;
        this.startedAt = null;
        resolve();
      });
    });
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  getPort(): number | null {
    return this.server ? this.port : null;
  }

  getUptime(): number | null {
    if (!this.startedAt) return null;
    return Math.floor((Date.now() - this.startedAt.getTime()) / 1000);
  }
}

// Singleton instance
let serverInstance: HttpFileServer | null = null;

export function getHttpServer(): HttpFileServer {
  if (!serverInstance) {
    serverInstance = new HttpFileServer();
  }
  return serverInstance;
}

export async function startHttpServer(port?: number): Promise<number> {
  const server = getHttpServer();
  return server.start(port);
}

export async function stopHttpServer(): Promise<void> {
  if (serverInstance) {
    await serverInstance.stop();
  }
}
