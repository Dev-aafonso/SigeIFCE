import base64, json, os, tempfile, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from paddleocr import PaddleOCR

engine = PaddleOCR(lang="pt", ocr_version="PP-OCRv5", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False, device="cpu")
lock = threading.Lock()
class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/read': self.send_error(404); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 8_000_000: raise ValueError('Imagem inválida ou muito grande')
            data = json.loads(self.rfile.read(length))
            image = base64.b64decode(data['image'], validate=True)
            if len(image) > 5 * 1024 * 1024: raise ValueError('Imagem muito grande')
            with tempfile.NamedTemporaryFile(suffix='.jpg') as f:
                f.write(image); f.flush()
                with lock: results = list(engine.predict(f.name))
            lines = []
            for result in results:
                boxes = result.get('rec_polys', [])
                entries = []
                for text, box in zip(result.get('rec_texts', []), boxes):
                    points = list(box)
                    x = min(float(p[0]) for p in points)
                    y = sum(float(p[1]) for p in points) / len(points)
                    height = max(float(p[1]) for p in points) - min(float(p[1]) for p in points)
                    entries.append((y, x, height, text))
                entries.sort(key=lambda item: item[0])
                rows = []
                for y, x, height, text in entries:
                    match = next((row for row in rows if abs(row['y'] - y) <= max(row['height'], height) * .55), None)
                    if match is None:
                        match = {'y': y, 'height': height, 'items': []}; rows.append(match)
                    match['items'].append((x, text))
                lines.extend(' '.join(text for _, text in sorted(row['items'])) for row in rows)
            body = json.dumps({'text': '\n'.join(lines)}, ensure_ascii=False).encode()
            self.send_response(200); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
        except Exception as error:
            print('Falha no processamento:', type(error).__name__, str(error)[:300], flush=True)
            self.send_error(400, 'Não foi possível ler a imagem')
    def log_message(self, format, *args): pass
HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
