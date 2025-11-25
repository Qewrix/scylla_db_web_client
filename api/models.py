from pydantic import BaseModel, Field
from typing import Optional


class UserCreate(BaseModel):
    """Model for user signup request."""
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    """Model for user login request."""
    username: str
    password: str


class User(BaseModel):
    """Model for user response."""
    username: str


class Token(BaseModel):
    """Model for authentication token response."""
    access_token: str
    token_type: str = "bearer"
    user: User
