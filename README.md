# ScyllaDB Web Client

A lightweight, modern web-based client for ScyllaDB/Cassandra with schema exploration, data viewing, and query execution capabilities.

## Features

- 🗂️ **Schema Browser**: Navigate keyspaces and tables with an intuitive tree view
- 📊 **Table Inspector**: View column definitions, types, and key constraints
- 📝 **Query Editor**: Execute custom CQL queries
- 💾 **Data Viewer**: Browse table data with pagination
- ⚡ **Fast & Modern**: Built with React, Vite, and Tailwind CSS

## Project Structure

```
scylla_db_web_client/
├── api/                    # FastAPI Backend
│   ├── main.py            # Entry point
│   ├── database.py        # ScyllaDB connection
│   ├── routers/           # API endpoints
│   │   ├── explorer.py    # Schema browsing
│   │   └── query.py       # Query execution
│   └── requirements.txt   # Python dependencies
│
└── apps/                   # Frontend
    └── scylla-client/     # React application
        ├── src/
        │   └── App.tsx    # Main UI
        └── package.json   # npm dependencies
```

## Getting Started

### Prerequisites

- Python 3.8 or higher
- Node.js 18 or higher
- Access to a ScyllaDB cluster

### Backend Setup

```bash
cd api

# Create and configure environment
cp .env.example .env

# For development (using proxy like recommender system):
# ENVIRONMENT=dev
# (Uses default proxy mapping: 64.71.146.81:9037-9039)

# For production (direct connection):
# ENVIRONMENT=prod
# SCYLLA_HOST=your-scylla-host
# SCYLLA_PORT=9042

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`  
Interactive API docs at `http://localhost:8000/docs`

### Frontend Setup

```bash
cd apps/scylla-client

# Configure API endpoint (optional if using default)
cp .env.example .env
# Edit .env if needed:
#   VITE_API_BASE=http://localhost:8000

# Start the development server  
npm run dev
```

The frontend will be available at `http://localhost:5173`

## Usage

1. **Browse Schema**: Click keyspaces to expand and view tables
2. **Inspect Tables**: Click a table to see its structure and data
3. **Execute Queries**: Use the query editor to run custom CQL statements

### Example Queries

```cql
-- List all data from a table
SELECT * FROM keyspace_name.table_name LIMIT 100;

-- Create a new keyspace
CREATE KEYSPACE test WITH replication = {
  'class': 'SimpleStrategy', 
  'replication_factor': 2
};

-- Insert data
INSERT INTO keyspace.table (id, name) VALUES ('123', 'test');
```

## API Endpoints

### Explorer
- `GET /explorer/keyspaces` - List all keyspaces
- `GET /explorer/keyspaces/{keyspace}/tables` - List tables
- `GET /explorer/keyspaces/{keyspace}/tables/{table}` - Get schema
- `GET /explorer/keyspaces/{keyspace}/tables/{table}/rows` - Get data

### Query
- `POST /query/execute` - Execute CQL statement

## Tech Stack

**Backend**: FastAPI, Python, cassandra-driver  
**Frontend**: React, TypeScript, Vite, Tailwind CSS, Axios  
**Icons**: Lucide React

## Development

The application is designed to work with proxy-based ScyllaDB connections. For advanced proxy configuration (like the one used in the recommender system), you can extend `database.py` with custom address translators and endpoint factories.

## Future Enhancements

- Cluster health monitoring
- Real-time metrics dashboard
- Advanced filtering and pagination
- Connection profile management
- Data export (CSV, JSON)

## License

MIT

