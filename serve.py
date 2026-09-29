"""Kuuntelee sekä localhost (IPv6) että 127.0.0.1 (IPv4) portissa 7071."""
import http.server
import socket
import threading

PORT = 7071


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))


def run(host, family):
    class Server(http.server.ThreadingHTTPServer):
        address_family = family
        allow_reuse_address = True

    httpd = Server((host, PORT), Handler)
    httpd.serve_forever()


if __name__ == "__main__":
    ipv4 = threading.Thread(
        target=run, args=("127.0.0.1", socket.AF_INET), daemon=True
    )
    ipv4.start()
    print("Ovipiirrin: http://localhost:7071")
    print("            http://127.0.0.1:7071")
    try:
        run("::1", socket.AF_INET6)
    except OSError:
        print("IPv6 ei käytössä, kuunnellaan 127.0.0.1")
        ipv4.join()
