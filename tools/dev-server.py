"""The local dev server for the game and its checks: serves the repo on
http://localhost:8765 with caching off (so a reload always gets the latest
modules).

  python3 tools/dev-server.py .
  python3 tools/dev-server.py . 8766      # another port, e.g. for a second worktree
"""
import functools
import http.server
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


root = sys.argv[1] if len(sys.argv) > 1 else "."
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
http.server.ThreadingHTTPServer(("", port), functools.partial(Handler, directory=root)).serve_forever()
