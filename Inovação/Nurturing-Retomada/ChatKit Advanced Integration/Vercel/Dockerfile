FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Porta padrão para Cloud Run do Google
ENV PORT=8080

CMD ["python", "main.py"]