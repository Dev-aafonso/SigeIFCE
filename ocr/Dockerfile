FROM python:3.11-slim
ENV PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir paddlepaddle==3.2.2 paddleocr==3.3.3
WORKDIR /app
COPY leitor.py /app/leitor.py
EXPOSE 8080
CMD ["python", "/app/leitor.py"]
