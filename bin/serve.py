#!/usr/bin/env python3
"""Static server for the demo.

Usage: serve.py [PORT]

Serves public/ under /enter-map-examples/, the path GitHub Pages publishes it
at, and answers 404 outside it as Pages does. A path that climbs out of the site
(`../data/…`) then breaks here rather than only once deployed; at the server
root the browser would quietly clamp it and it would appear to work.

Plain `http.server` sends no cache headers, so browsers apply their own
heuristic and keep serving yesterday's configuration, templates and CSS — the
widget fetches those itself, so a normal reload does not clear them. Everything
here is sent with `no-store`.
"""

import functools
import http.server
import os
import sys
from urllib.parse import urlsplit

# Must match the repository name, which sets the GitHub Pages path.
PREFIX = "/enter-map-examples/"


class DemoHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if not self.handled_outside_prefix():
            super().do_GET()

    def do_HEAD(self):
        if not self.handled_outside_prefix():
            super().do_HEAD()

    def handled_outside_prefix(self) -> bool:
        path = urlsplit(self.path).path

        if path in ("/", PREFIX.rstrip("/")):
            self.send_response(302)
            self.send_header("Location", PREFIX)
            self.end_headers()
            return True

        if not path.startswith(PREFIX):
            self.send_error(404)
            return True

        return False

    def translate_path(self, path):
        if path.startswith(PREFIX):
            path = "/" + path[len(PREFIX):]

        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8088
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
    handler = functools.partial(DemoHandler, directory=root)

    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Serving {root} on http://localhost:{port}{PREFIX}")

        # Ctrl+C is how this is stopped, so it exits quietly rather than with a
        # traceback and a non-zero status.
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
