import os
import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException, Security, Depends
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from jose import JWTError, jwt
import bcrypt

load_dotenv()

# API Key configuration
API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

# Load valid API keys from environment
_api_keys_str = os.getenv("API_KEYS", "")
VALID_API_KEYS = set(key.strip() for key in _api_keys_str.split(",") if key.strip())

# JWT configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Bearer token scheme
bearer_scheme = HTTPBearer(auto_error=False)


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


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a bcrypt hash."""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt."""
    # Bcrypt automatically handles the 72-byte limit
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    """Get current user from JWT token."""
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated"
        )
    
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )
    
    username = payload.get("sub")
    if not username:
        raise HTTPException(
            status_code=401,
            detail="Invalid token payload"
        )
    
    return {"username": username}


async def get_optional_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> Optional[dict]:
    """Get current user from JWT token, returns None if not authenticated (for optional auth)."""
    if not credentials:
        return None
    
    payload = decode_access_token(credentials.credentials)
    if not payload:
        return None
    
    username = payload.get("sub")
    if not username:
        return None
    
    return {"username": username}
