#!/bin/zsh
cd "${0:A:h}/dist"
python3 - <<'PY'
import http.server, threading, webbrowser
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), http.server.SimpleHTTPRequestHandler)
url = 'http://127.0.0.1:%d/' % server.server_port
print('一字一练已启动：' + url + '\n使用结束后关闭此窗口即可。')
threading.Timer(0.7, lambda: webbrowser.open(url)).start()
server.serve_forever()
PY
