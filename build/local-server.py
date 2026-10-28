"""Dependency-free local PrepVault server. Python 3.8+. No remote access or APIs."""
import http.server
import os
import pathlib
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent / "app"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript", ".js": "text/javascript", ".svg": "image/svg+xml", ".pdf": "application/pdf"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        super().end_headers()

    def send_head(self):
        if self.headers.get("Host") != "127.0.0.1:" + str(self.server.server_port):
            self.send_error(403, "Use the launcher's 127.0.0.1 address")
            return None
        pathname = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        if "\\" in pathname or "\0" in pathname or any(part.startswith(".") for part in pathname.split("/")):
            self.send_error(403)
            return None
        if pathname.startswith("/api/"):
            self.send_error(503, "Connected services require the live PrepVault website")
            return None
        target = (ROOT / pathname.lstrip("/")).resolve()
        if target != ROOT and ROOT not in target.parents:
            self.send_error(403)
            return None
        if target.is_dir() and pathname != "/":
            self.send_error(404)
            return None
        return super().send_head()

    def log_message(self, format, *args):
        pass  # No request or browsing logs.


if __name__ == "__main__":
    port = int(os.environ.get("PREPVAULT_PORT", "4173"))
    if not 1024 <= port <= 65535:
        raise ValueError("PREPVAULT_PORT must be between 1024 and 65535")
    print(f"PrepVault is running on this computer.\nOpen http://127.0.0.1:{port}/ in your browser.\nKeep this window open. Press Ctrl+C to stop.\nExport an encrypted backup regularly.", flush=True)
    try:
        http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
    except OSError:
        print("Could not start. Close another PrepVault launcher and try again.")
        raise SystemExit(1)
