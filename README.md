# mcp-proxy

MCP server that bypasses Claude Desktop sandbox network restrictions.

Claude Desktop runs in a restricted sandbox that blocks many network operations and CLI tools that need internet access. This MCP server provides three tools that run outside the sandbox, enabling Claude to:

- Fetch any URL (API calls, web scraping, downloads)
- Execute network-capable CLI tools (yt-dlp, curl, ffmpeg, etc.)
- Read files created by those tools (subtitle files, downloads, etc.)

## Installation

### Quick Install (via GitHub)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "proxy": {
      "command": "npx",
      "args": ["-y", "github:CodefiLabs/claude-desktop-skills-proxy"]
    }
  }
}
```

Restart Claude Desktop for changes to take effect. The server will be automatically downloaded and run.

### Local Development

```bash
git clone https://github.com/CodefiLabs/claude-desktop-skills-proxy.git
cd claude-desktop-skills-proxy
npm install
npm run build
```

Then configure Claude Desktop to use the local build:

```json
{
  "mcpServers": {
    "proxy": {
      "command": "node",
      "args": ["/path/to/claude-desktop-skills-proxy/dist/index.js"]
    }
  }
}
```

## Tools

### proxy_fetch

Make HTTP requests to any URL. Supports all common HTTP methods.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | The URL to fetch |
| `method` | string | No | HTTP method: GET, POST, PUT, DELETE, PATCH, HEAD (default: GET) |
| `headers` | object | No | Custom HTTP headers as key-value pairs |
| `body` | string | No | Request body for POST/PUT/PATCH |
| `timeout` | number | No | Timeout in milliseconds (default: 30000) |
| `approve` | string | No | Domain approval: "once" or "always" |

**Example - Simple GET:**
```json
{
  "url": "https://api.github.com/users/octocat"
}
```

**Example - POST with headers:**
```json
{
  "url": "https://api.example.com/data",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer token123"
  },
  "body": "{\"key\": \"value\"}"
}
```

**Example - Approve new domain:**
```json
{
  "url": "https://newsite.com/api",
  "approve": "always"
}
```

### network_exec

Execute CLI commands that require network access. Uses secure `spawn()` instead of shell execution.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | string | Yes | The command to execute (e.g., "yt-dlp", "curl") |
| `args` | array | No | Command arguments as array |
| `cwd` | string | No | Working directory |
| `env` | object | No | Additional environment variables |
| `timeout` | number | No | Timeout in milliseconds (default: 60000) |
| `approve` | string | No | Command approval: "once" or "always" |

**Example - Download video with yt-dlp:**
```json
{
  "command": "yt-dlp",
  "args": ["--output", "video.mp4", "https://youtube.com/watch?v=dQw4w9WgXcQ"],
  "cwd": "/Users/kk/Downloads",
  "approve": "always"
}
```

**Example - Fetch with curl:**
```json
{
  "command": "curl",
  "args": ["-s", "https://api.ipify.org?format=json"],
  "approve": "once"
}
```

**Example - Convert video with ffmpeg:**
```json
{
  "command": "ffmpeg",
  "args": ["-i", "input.mp4", "-c:v", "libx264", "output.mp4"],
  "cwd": "/Users/kk/Videos",
  "timeout": 300000
}
```

### read_file

Read files from the host filesystem. Useful for reading files created by `network_exec` (e.g., subtitle files from yt-dlp).

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Absolute path to the file to read |
| `encoding` | string | No | "utf8" (default) or "base64" for binary files |
| `maxSize` | number | No | Maximum file size in bytes (default: 5MB) |

**Example - Read subtitle file:**
```json
{
  "path": "/tmp/video.en.vtt"
}
```

**Example - Read binary file as base64:**
```json
{
  "path": "/tmp/image.png",
  "encoding": "base64"
}
```

**Workflow for yt-dlp subtitles:**
1. Download subtitles with `network_exec`:
   ```json
   {
     "command": "yt-dlp",
     "args": ["--write-auto-sub", "--skip-download", "-o", "/tmp/%(id)s", "VIDEO_ID"],
     "approve": "always"
   }
   ```
2. Read the subtitle file with `read_file`:
   ```json
   {
     "path": "/tmp/VIDEO_ID.en.vtt"
   }
   ```

**Blocked paths:** Sensitive files like `~/.ssh/*`, `~/.aws/*`, `/etc/shadow`, `.env` files, and credential files are blocked for security.

## Approval Flow

When accessing a new domain or running a new command, the tool returns a `needs_approval` status:

```json
{
  "status": "needs_approval",
  "domain": "example.com",
  "message": "Domain \"example.com\" is not in your allowlist. To proceed, call proxy_fetch again with approve: \"once\" for this request only, or approve: \"always\" to remember this domain."
}
```

**Approval options:**
- `"once"` - Allow for this single request only
- `"always"` - Add to allowlist and remember for future requests

Once approved with `"always"`, subsequent requests to that domain/command work automatically.

## Security

### Blocked Domains (SSRF Protection)

The following domains are always blocked to prevent Server-Side Request Forgery attacks:

- `localhost`, `127.0.0.1`, `::1` - Loopback addresses
- `169.254.169.254` - AWS metadata endpoint
- `10.*`, `172.16-31.*`, `192.168.*` - Private IP ranges
- `fe80:*`, `fc00:*`, `fd00:*` - IPv6 private/link-local

### Blocked Commands

These commands are blocked for security:

- **Destructive:** `rm`, `rmdir`, `del`, `mv`
- **Privilege escalation:** `sudo`, `su`, `doas`
- **Permissions:** `chmod`, `chown`, `chgrp`
- **System:** `mkfs`, `fdisk`, `dd`, `format`
- **Package managers:** `apt`, `brew`, `yum`, etc.
- **Shells:** `bash`, `sh`, `zsh`, etc.
- **Network abuse:** `nc`, `netcat`, `telnet`

### Argument Validation

Shell operators are blocked in command arguments to prevent injection:
- `;`, `|`, `&&`, `||` - Command chaining
- `>`, `<` - Redirects
- `$(`, `` ` ``, `${` - Command/variable substitution

### Rate Limiting

Requests are rate-limited to prevent abuse:
- 60 requests per minute per domain/command
- Automatic cooldown with retry-after information

## Configuration

Configuration is stored at `~/.config/mcp-proxy/config.json`:

```json
{
  "allowedDomains": ["api.github.com", "example.com"],
  "blockedDomains": ["localhost", "127.0.0.1", "..."],
  "allowedCommands": ["yt-dlp", "curl", "ffmpeg"],
  "blockedCommands": ["rm", "sudo", "..."]
}
```

The file is created automatically on first use. User-approved domains/commands are added to the allowlists. Security blocklists cannot be overridden.

## Development

```bash
# Build
npm run build

# Watch mode
npm run watch

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## License

MIT
