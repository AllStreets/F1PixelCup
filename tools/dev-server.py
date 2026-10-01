"""The local dev server for the game and its checks: serves the repo on
http://localhost:8765 with caching off (so a reload always gets the latest
modules).

  python3 tools/dev-server.py .
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
http.server.ThreadingHTTPServer(("", 8765), functools.partial(Handler, directory=root)).serve_forever()
