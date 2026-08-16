FROM python:3.12-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/scripts ./scripts
COPY backend/run.py ./run.py
COPY *.xlsx ./

ENV PORT=5000
EXPOSE 5000

CMD ["sh", "-c", "python scripts/bootstrap_vocabulary.py && gunicorn -b 0.0.0.0:${PORT} run:app"]
