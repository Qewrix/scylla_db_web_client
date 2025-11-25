# Report 3: API Key Authentication

**Date**: 2025-11-25  
**Model**: Claude 3.5 Sonnet (Thinking)  
**Feature**: API Key Authentication

## Objective
Secure the API endpoints with API key authentication.

## Implementation Details

### Backend Changes
1. **Authentication Middleware** (`auth.py`)
   - Created dependency for API key validation
   - Supports header-based authentication: `X-API-Key`
   - Environment-based configuration for valid API keys

2. **Protected Endpoints**
   - All `/explorer/*` endpoints require API key
   - All `/query/*` endpoints require API key
   - `/health` endpoint remains public

### Configuration
- Set `API_KEYS` environment variable with comma-separated keys
- Example: `API_KEYS=key1,key2,key3`
- If not set, authentication is disabled (dev mode)

### Security Features
- Constant-time comparison to prevent timing attacks
- Clear error messages for missing/invalid keys
- Easy to rotate keys via environment variables

## API Usage
```bash
# With API key
curl -H "X-API-Key: your-key-here" http://localhost:8000/explorer/stats

# Without API key (401 Unauthorized)
curl http://localhost:8000/explorer/stats
```

## Environment Setup
```bash
# In .env file
API_KEYS=my-secret-key-1,my-secret-key-2
```
