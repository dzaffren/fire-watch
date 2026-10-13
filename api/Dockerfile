FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.12.0 /uv /bin/uv
# Bytecode is compiled at build time so a cold start skips it (O8).
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project
COPY src ./src
RUN uv sync --locked --no-dev --no-editable

FROM python:3.12-slim
RUN useradd --create-home --uid 10001 app
COPY --from=build /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER app
EXPOSE 8000
CMD ["uvicorn", "firewatch.app:app", "--host", "0.0.0.0", "--port", "8000"]
