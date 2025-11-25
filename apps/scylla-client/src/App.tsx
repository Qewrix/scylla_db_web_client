import { useState, useEffect } from 'react';
import { Database, Table, Play, ChevronRight, ChevronDown } from 'lucide-react';
import axios from 'axios';
import './index.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

interface TableSchema {
  keyspace: string;
  table: string;
  columns: Array<{ name: string; type: string; kind: string }>;
  partition_keys: string[];
  clustering_keys: string[];
}

interface TableRow {
  [key: string]: any;
}

function App() {
  const [keyspaces, setKeyspaces] = useState<string[]>([]);
  const [expandedKeyspaces, setExpandedKeyspaces] = useState<Set<string>>(new Set());
  const [tables, setTables] = useState<Record<string, string[]>>({});
  const [selectedTable, setSelectedTable] = useState<TableSchema | null>(null);
  const [tableRows, setTableRows] = useState<TableRow[]>([]);
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch keyspaces on mount
  useEffect(() => {
    fetchKeyspaces();
  }, []);

  const fetchKeyspaces = async () => {
    try {
      const response = await axios.get(`${API_BASE}/explorer/keyspaces`);
      setKeyspaces(response.data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchTables = async (keyspace: string) => {
    try {
      const response = await axios.get(`${API_BASE}/explorer/keyspaces/${keyspace}/tables`);
      setTables(prev => ({ ...prev, [keyspace]: response.data }));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchTableSchema = async (keyspace: string, table: string) => {
    setLoading(true);
    setError(null);
    try {
      const [schemaRes, rowsRes] = await Promise.all([
        axios.get(`${API_BASE}/explorer/keyspaces/${keyspace}/tables/${table}`),
        axios.get(`${API_BASE}/explorer/keyspaces/${keyspace}/tables/${table}/rows`)
      ]);
      setSelectedTable(schemaRes.data);
      setTableRows(rowsRes.data.rows);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleKeyspace = (keyspace: string) => {
    const newExpanded = new Set(expandedKeyspaces);
    if (newExpanded.has(keyspace)) {
      newExpanded.delete(keyspace);
    } else {
      newExpanded.add(keyspace);
      if (!tables[keyspace]) {
        fetchTables(keyspace);
      }
    }
    setExpandedKeyspaces(newExpanded);
  };

  const executeQuery = async () => {
    setLoading(true);
    setError(null);
    setQueryResult(null);
    try {
      const response = await axios.post(`${API_BASE}/query/execute`, { cql: query });
      setQueryResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Database className="w-6 h-6 text-blue-600" />
            ScyllaDB Client
          </h1>
        </div>
        <div className="p-2">
          {keyspaces.map(keyspace => (
            <div key={keyspace}>
              <button
                onClick={() => toggleKeyspace(keyspace)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 rounded"
              >
                {expandedKeyspaces.has(keyspace) ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <Database className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-gray-700">{keyspace}</span>
              </button>
              {expandedKeyspaces.has(keyspace) && tables[keyspace] && (
                <div className="ml-6">
                  {tables[keyspace].map(table => (
                    <button
                      key={table}
                      onClick={() => fetchTableSchema(keyspace, table)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 rounded"
                    >
                      <Table className="w-4 h-4 text-green-600" />
                      <span className="text-gray-600">{table}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Query Editor */}
        <div className="border-b border-gray-200 bg-white p-4">
          <div className="flex gap-2">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter CQL query..."
              className="flex-1 p-3 border border-gray-300 rounded font-mono text-sm resize-none"
              rows={3}
            />
            <button
              onClick={executeQuery}
              disabled={loading || !query}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Execute
            </button>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-auto p-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-4">
              {error}
            </div>
          )}

          {loading && (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          )}

          {queryResult && (
            <div className="bg-white rounded border border-gray-200 p-4 mb-4">
              <h3 className="font-semibold text-gray-700 mb-2">Query Result</h3>
              {queryResult.type === 'select' && queryResult.rows && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {queryResult.columns.map((col: string) => (
                          <th key={col} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {queryResult.rows.map((row: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          {queryResult.columns.map((col: string) => (
                            <td key={col} className="px-4 py-2 whitespace-nowrap text-gray-700">
                              {row[col]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {queryResult.type === 'modification' && (
                <p className="text-green-600">{queryResult.message}</p>
              )}
            </div>
          )}

          {selectedTable && !queryResult && (
            <div className="bg-white rounded border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                {selectedTable.keyspace}.{selectedTable.table}
              </h2>

              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-600 mb-2">Schema</h3>
                <div className="space-y-1">
                  {selectedTable.columns.map(col => (
                    <div key={col.name} className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-blue-600">{col.name}</span>
                      <span className="text-gray-500">{col.type}</span>
                      {col.kind === 'partition_key' && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">PK</span>
                      )}
                      {col.kind === 'clustering' && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">CK</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {tableRows.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-600 mb-2">Data ({tableRows.length} rows)</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {selectedTable.columns.map(col => (
                            <th key={col.name} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                              {col.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {tableRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            {selectedTable.columns.map(col => (
                              <td key={col.name} className="px-4 py-2 whitespace-nowrap text-gray-700">
                                {row[col.name]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
