FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app/ai-service
COPY ai-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home app
COPY --chown=app:app ai-service/app ./app
COPY --chown=app:app fixtures /app/fixtures
COPY --chmod=755 deploy/start-ai.sh /usr/local/bin/start-studyweave-ai
USER app
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz',timeout=4)"
CMD ["/usr/local/bin/start-studyweave-ai"]
