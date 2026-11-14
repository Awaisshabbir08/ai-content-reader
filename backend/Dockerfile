FROM python:3.12-slim AS deps

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models

WORKDIR /app

# CPU-only PyTorch keeps the image small. For a GPU server, swap the index URL
# for a CUDA one (e.g. https://download.pytorch.org/whl/cu128) and set DEVICE=cuda.
RUN pip install --retries 10 --timeout 60 --index-url https://download.pytorch.org/whl/cpu torch
COPY requirements.txt .
RUN pip install --retries 10 --timeout 60 -r requirements.txt

FROM deps AS app
COPY app ./app
COPY scripts ./scripts
COPY calibration.json ./calibration.json

RUN useradd --create-home appuser && mkdir -p /models && chown appuser /models
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
