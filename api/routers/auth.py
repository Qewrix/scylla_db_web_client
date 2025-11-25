from fastapi import APIRouter, HTTPException, Depends
from cassandra.cluster import Session

from auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
)
from database import get_session
from models import UserCreate, UserLogin, Token, User

router = APIRouter(prefix="/auth", tags=["authentication"])


def init_users_table(session: Session):
    """Initialize the users table in ScyllaDB."""
    # Create keyspace if not exists
    session.execute("""
        CREATE KEYSPACE IF NOT EXISTS scylla_client
        WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    """)
    
    # Create users table
    session.execute("""
        CREATE TABLE IF NOT EXISTS scylla_client.users (
            username text PRIMARY KEY,
            password_hash text
        )
    """)


@router.post("/signup", response_model=Token)
async def signup(user_data: UserCreate):
    """Register a new user."""
    session = get_session()
    
    # Ensure table exists
    init_users_table(session)
    
    # Check if user already exists
    result = session.execute(
        "SELECT username FROM scylla_client.users WHERE username = %s",
        [user_data.username]
    )
    if result.one():
        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )
    
    # Hash password and create user
    password_hash = get_password_hash(user_data.password)
    session.execute(
        "INSERT INTO scylla_client.users (username, password_hash) VALUES (%s, %s)",
        [user_data.username, password_hash]
    )


    
    # Create access token
    access_token = create_access_token(data={"sub": user_data.username})
    
    return Token(
        access_token=access_token,
        user=User(username=user_data.username)
    )


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    """Authenticate user and return JWT token."""
    session = get_session()
    
    # Get user from database
    result = session.execute(
        "SELECT username, password_hash FROM scylla_client.users WHERE username = %s",
        [credentials.username]
    )
    user_row = result.one()
    
    if not user_row:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )
    
    # Verify password
    if not verify_password(credentials.password, user_row.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )
    
    # Create access token
    access_token = create_access_token(data={"sub": credentials.username})
    
    return Token(
        access_token=access_token,
        user=User(username=credentials.username)
    )


@router.get("/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user."""
    return User(username=current_user["username"])
