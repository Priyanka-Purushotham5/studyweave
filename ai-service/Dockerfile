# Build from the REPO ROOT so fixtures/ is available (FakeGemini reads fixtures/ai_raw):
#   docker build -f ai-service/Dockerfile -t studyweave-ai .
#   docker run --rm -p 8001:8001 -e FAKE_GEMINI=1 studyweave-ai
#   docker run --rm -p 8001:8001 -e GEMINI_API_KEY=... -e FAKE_GEMINI=0 studyweave-ai
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/ai-service

COPY ai-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Same layout as the repo, so app/gemini.py finds ../fixtures
COPY ai-service/app ./app
COPY fixtures /app/fixtures

RUN useradd --create-home appuser
USER appuser

EXPOSE 8001
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8001/healthz', timeout=2).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
