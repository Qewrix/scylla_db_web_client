FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Default values (overridden by .env)
ENV HOST=0.0.0.0
ENV PORT=8049

# Expose the API port
EXPOSE ${PORT}

# Run the FastAPI application using HOST and PORT from env
CMD ["sh", "-c", "uvicorn main:app --host ${HOST} --port ${PORT}"]
