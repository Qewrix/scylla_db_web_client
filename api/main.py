from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import close_session
from routers import explorer, query


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: database connection is lazy-loaded on first request
    yield
    # Shutdown: clean up resources
    close_session()


app = FastAPI(title="ScyllaDB Web Client API", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(explorer.router)
app.include_router(query.router)


@app.get("/")
async def root():
    return {"message": "ScyllaDB Web Client API is running"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}
