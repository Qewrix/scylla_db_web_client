from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Dict, Any

from database import get_session
from auth import get_current_user

router = APIRouter(prefix="/query", tags=["query"])


class QueryRequest(BaseModel):
    cql: str


@router.post("/execute")
async def execute_query(request: QueryRequest, current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """Execute a raw CQL query."""
    session = get_session()
    
    try:
        result = session.execute(request.cql)
        
        # Check if this is a SELECT query (has results)
        if result.has_more_pages is not None or result.current_rows:
            rows = []
            columns = []
            
            for row in result:
                row_dict = {}
                if not columns and hasattr(row, '_fields'):
                    columns = list(row._fields)
                
                for key in row._fields:
                    value = getattr(row, key)
                    # Convert non-serializable types to strings
                    row_dict[key] = str(value) if value is not None else None
                rows.append(row_dict)
            
            return {
                "success": True,
                "type": "select",
                "columns": columns,
                "rows": rows,
                "count": len(rows)
            }
        else:
            # DML/DDL query (INSERT, UPDATE, DELETE, CREATE, etc.)
            return {
                "success": True,
                "type": "modification",
                "message": "Query executed successfully"
            }
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": str(e)
            }
        )
