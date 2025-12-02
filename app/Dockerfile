FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/root/.local/bin:${PATH}"

WORKDIR /app

# Basic tools for git deps and uv installer
RUN apt-get update && \
    apt-get install -y --no-install-recommends git curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh && \
    ln -sf /root/.local/bin/uv /usr/local/bin/uv

# Copy manifests
COPY pyproject.toml uv.lock README.md ./

# Install dependencies (creates .venv and uses it by default)
RUN uv sync --no-dev --frozen

# Copy source
COPY . .

EXPOSE 8081

CMD ["uv", "run", "python", "custom_llm_service.py", "--host", "0.0.0.0", "--port", "8081"]
