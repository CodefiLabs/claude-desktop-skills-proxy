/**
 * File Registry
 * Tracks files registered for serving with UUID-based access
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export interface FileRegistration {
  id: string;
  originalPath: string;
  servePath: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface RegisterOptions {
  filename?: string;
  contentType?: string;
  expiryMinutes?: number;
}

// Default serve directory
const DEFAULT_SERVE_DIR = path.join(os.tmpdir(), "mcp-proxy-files");
const DEFAULT_EXPIRY_MINUTES = 60;

// MIME types for common extensions (avoid external dependency)
const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".json": "application/json",
  ".txt": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

class FileRegistry {
  private files = new Map<string, FileRegistration>();
  private serveDirectory: string;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(serveDirectory: string = DEFAULT_SERVE_DIR) {
    this.serveDirectory = serveDirectory;
  }

  async initialize(): Promise<void> {
    await fsPromises.mkdir(this.serveDirectory, { recursive: true });
    console.error(`[file-registry] Initialized at ${this.serveDirectory}`);

    // Start cleanup interval (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(err => {
        console.error("[file-registry] Cleanup error:", err);
      });
    }, 5 * 60 * 1000);
  }

  async register(
    originalPath: string,
    options: RegisterOptions = {}
  ): Promise<FileRegistration> {
    // Verify file exists and get size
    const stats = await fsPromises.stat(originalPath);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${originalPath}`);
    }

    const id = crypto.randomUUID();
    const ext = path.extname(originalPath);
    const servePath = path.join(this.serveDirectory, `${id}${ext}`);

    // Copy file to serve directory
    await fsPromises.copyFile(originalPath, servePath);

    const registration: FileRegistration = {
      id,
      originalPath,
      servePath,
      filename: options.filename || path.basename(originalPath),
      contentType: options.contentType || getMimeType(originalPath),
      size: stats.size,
      createdAt: new Date(),
      expiresAt: new Date(
        Date.now() + (options.expiryMinutes || DEFAULT_EXPIRY_MINUTES) * 60 * 1000
      ),
    };

    this.files.set(id, registration);
    console.error(
      `[file-registry] Registered: ${id} -> ${registration.filename} (expires: ${registration.expiresAt.toISOString()})`
    );

    return registration;
  }

  get(id: string): FileRegistration | undefined {
    const registration = this.files.get(id);
    if (registration && registration.expiresAt < new Date()) {
      // Expired, clean up
      this.removeFile(id).catch(() => {});
      return undefined;
    }
    return registration;
  }

  async removeFile(id: string): Promise<boolean> {
    const registration = this.files.get(id);
    if (!registration) {
      return false;
    }

    try {
      await fsPromises.unlink(registration.servePath);
    } catch (error) {
      // File might already be deleted
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error(`[file-registry] Error deleting file: ${error}`);
      }
    }

    this.files.delete(id);
    console.error(`[file-registry] Removed: ${id}`);
    return true;
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    for (const [id, registration] of this.files) {
      if (registration.expiresAt < now) {
        await this.removeFile(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.error(`[file-registry] Cleaned up ${cleaned} expired files`);
    }
    return cleaned;
  }

  async clearAll(): Promise<number> {
    const count = this.files.size;
    for (const id of this.files.keys()) {
      await this.removeFile(id);
    }
    return count;
  }

  getStats(): { filesServed: number; totalSize: number } {
    let totalSize = 0;
    for (const registration of this.files.values()) {
      totalSize += registration.size;
    }
    return {
      filesServed: this.files.size,
      totalSize,
    };
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    console.error("[file-registry] Shutdown");
  }
}

// Singleton instance
let registryInstance: FileRegistry | null = null;

export function getFileRegistry(): FileRegistry {
  if (!registryInstance) {
    registryInstance = new FileRegistry();
  }
  return registryInstance;
}

export async function initializeFileRegistry(): Promise<FileRegistry> {
  const registry = getFileRegistry();
  await registry.initialize();
  return registry;
}
