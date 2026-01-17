/**
 * Tunnel Manager
 * Manages cloudflared quick tunnel for public URL access
 */
import { spawn, ChildProcess } from "node:child_process";

// Regex to parse tunnel URL from cloudflared output
const TUNNEL_URL_REGEX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

class TunnelManager {
  private process: ChildProcess | null = null;
  private publicUrl: string | null = null;
  private startedAt: Date | null = null;
  private restartCount: number = 0;
  private maxRestarts: number = 3;

  async start(localPort: number): Promise<string> {
    if (this.process && this.publicUrl) {
      console.error("[tunnel] Already running");
      return this.publicUrl;
    }

    // Check if cloudflared is installed
    const installed = await this.isCloudflaredInstalled();
    if (!installed) {
      throw new Error(
        "cloudflared is not installed. Install with: brew install cloudflared (macOS) or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
      );
    }

    return this.startTunnel(localPort);
  }

  private async isCloudflaredInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      const check = spawn("which", ["cloudflared"]);
      check.on("close", (code) => {
        resolve(code === 0);
      });
      check.on("error", () => {
        resolve(false);
      });
    });
  }

  private startTunnel(localPort: number): Promise<string> {
    return new Promise((resolve, reject) => {
      console.error(`[tunnel] Starting cloudflared tunnel to localhost:${localPort}`);

      this.process = spawn("cloudflared", [
        "tunnel",
        "--url",
        `http://localhost:${localPort}`,
      ]);

      let stderr = "";
      let resolved = false;

      // Parse URL from stderr (cloudflared outputs URL there)
      this.process.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        stderr += output;

        // Look for tunnel URL
        const match = output.match(TUNNEL_URL_REGEX);
        if (match && !resolved) {
          resolved = true;
          this.publicUrl = match[0];
          this.startedAt = new Date();
          console.error(`[tunnel] Tunnel ready: ${this.publicUrl}`);
          resolve(this.publicUrl);
        }
      });

      this.process.on("error", (error: Error) => {
        console.error(`[tunnel] Process error: ${error.message}`);
        if (!resolved) {
          reject(new Error(`Failed to start cloudflared: ${error.message}`));
        }
      });

      this.process.on("close", (code: number | null) => {
        console.error(`[tunnel] Process exited with code ${code}`);

        const wasRunning = this.publicUrl !== null;
        this.process = null;
        this.publicUrl = null;
        this.startedAt = null;

        if (!resolved) {
          reject(
            new Error(
              `cloudflared exited unexpectedly with code ${code}. Output: ${stderr.slice(0, 500)}`
            )
          );
        } else if (wasRunning && this.restartCount < this.maxRestarts) {
          // Tunnel died while running, attempt restart
          this.restartCount++;
          console.error(
            `[tunnel] Attempting restart (${this.restartCount}/${this.maxRestarts})`
          );
          this.startTunnel(localPort).catch((err) => {
            console.error(`[tunnel] Restart failed: ${err.message}`);
          });
        }
      });

      // Timeout if URL not found within 30 seconds
      setTimeout(() => {
        if (!resolved) {
          this.stop();
          reject(
            new Error(
              `Timeout waiting for tunnel URL. cloudflared output: ${stderr.slice(0, 500)}`
            )
          );
        }
      }, 30000);
    });
  }

  stop(): void {
    if (this.process) {
      console.error("[tunnel] Stopping cloudflared");
      this.process.kill("SIGTERM");

      // Force kill after 5 seconds if needed
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
    }
    this.process = null;
    this.publicUrl = null;
    this.startedAt = null;
  }

  isRunning(): boolean {
    return this.process !== null && this.publicUrl !== null;
  }

  getPublicUrl(): string | null {
    return this.publicUrl;
  }

  getUptime(): number | null {
    if (!this.startedAt) return null;
    return Math.floor((Date.now() - this.startedAt.getTime()) / 1000);
  }
}

// Singleton instance
let tunnelInstance: TunnelManager | null = null;

export function getTunnelManager(): TunnelManager {
  if (!tunnelInstance) {
    tunnelInstance = new TunnelManager();
  }
  return tunnelInstance;
}

export async function startTunnel(localPort: number): Promise<string> {
  const tunnel = getTunnelManager();
  return tunnel.start(localPort);
}

export function stopTunnel(): void {
  if (tunnelInstance) {
    tunnelInstance.stop();
  }
}
