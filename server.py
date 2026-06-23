import http.server
import socketserver

PORT = 8000

# ponytail: Simple custom server to enforce UTF-8 charset header and prevent Mojibake on Windows
class UTF8ServerHandler(http.server.SimpleHTTPRequestHandler):
    def send_header(self, keyword, value):
        if keyword.lower() == 'content-type':
            # Append charset=utf-8 if serving HTML, JS, CSS, or JSON text files
            if any(ext in value.lower() for ext in ['html', 'javascript', 'css', 'json']):
                if 'charset' not in value.lower():
                    value = f"{value}; charset=utf-8"
        super().send_header(keyword, value)

# Allow port reuse immediately upon restart
socketserver.TCPServer.allow_reuse_address = True

if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), UTF8ServerHandler) as httpd:
        print(f"Serving 'Kalimat' app at http://localhost:{PORT} with UTF-8 support...")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
