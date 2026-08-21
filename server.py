import http.server
import socketserver

PORT = 8000

# ponytail: Simple custom server to enforce UTF-8 charset header and prevent Mojibake on Windows
class UTF8ServerHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def send_header(self, keyword, value):
        if keyword.lower() == 'content-type':
            # Append charset=utf-8 if serving HTML, JS, CSS, or JSON text files
            if any(ext in value.lower() for ext in ['html', 'javascript', 'css', 'json']):
                if 'charset' not in value.lower():
                    value = f"{value}; charset=utf-8"
            super().send_header('X-Content-Type-Options', 'nosniff')
        super().send_header(keyword, value)

    def do_GET(self):
        # DNS-rebinding guard: only loopback hostnames may talk to this server.
        host = (self.headers.get('Host') or '').split(':')[0].lower()
        if host not in ('localhost', '127.0.0.1'):
            self.send_error(421, 'Misdirected Request', 'Host header not allowed')
            return
        super().do_GET()

# Allow port reuse immediately upon restart
socketserver.ThreadingTCPServer.allow_reuse_address = True

if __name__ == "__main__":
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), UTF8ServerHandler) as httpd:
        print(f"Serving 'Kalimat' app at http://localhost:{PORT} with UTF-8 support...")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
