#!/usr/bin/env python3
"""Static server for the demo.

Plain `http.server` sends no cache headers, so browsers apply their own
heuristic and keep serving yesterday's configuration, templates and CSS — the
widget fetches those itself, so a normal reload does not clear them. Everything
here is sent with `no-store`.
"""

import functools
import http.server
import os
import sys


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8088
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
    handler = functools.partial(NoStoreHandler, directory=root)

    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Serving {root} on http://localhost:{port}")

        # Ctrl+C is how this is stopped, so it exits quietly rather than with a
        # traceback and a non-zero status.
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
