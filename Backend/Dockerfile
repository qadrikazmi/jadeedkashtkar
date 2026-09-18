FROM python:3.12-slim

WORKDIR /app

# Install system dependencies required by WeasyPrint, C compilers, and GIS packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    libgdal-dev \
    libproj-dev \
    libgeos-dev \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libharfbuzz0b \
    libfontconfig1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Upgrade build tools to ensure Pip selects pre-built binary wheels
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]