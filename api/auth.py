import os
import secrets
from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader
from dotenv import load_dotenv

load_dotenv()

# API Key configuration
API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

# Load valid API keys from environment
_api_keys_str = os.getenv("API_KEYS", "")
VALID_API_KEYS = set(key.strip() for key in _api_keys_str.split(",") if key.strip())


async def get_api_key(api_key: str = Security(api_key_header)) -> str:
    """
    Validate API key from request header.
    If no API keys are configured, authentication is disabled.
    """
    # If no API keys configured, allow all requests (dev mode)
    if not VALID_API_KEYS:
        return "dev-mode"
    
    # Check if API key is provided
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="Missing API key. Include 'X-API-Key' header."
        )
    
    # Validate API key using constant-time comparison
    if not any(secrets.compare_digest(api_key, valid_key) for valid_key in VALID_API_KEYS):
        raise HTTPException(
            status_code=401,
            detail="Invalid API key"
        )
    
    return api_key
