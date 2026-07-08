import { useEffect, useState } from 'react';
import { api, getStoredToken } from '../../api/client';

export default function ImportExportTab() {
  const [modules, setModules] = useState([]);
  const [selectedModules, setSelectedModules] = useState([]);
  const [format, setFormat] = useState('json');
  const [history, setHistory] = useState([]);

  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [conflictResolution, setConflictResolution] = useState('skip');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get('/modules').then((res) => setModules(res.modules));
    loadHistory();
  }, []);

  const loadHistory = () => {
    api.get('/import-export/history').then((res) => setHistory(res.history));
  };

  const doExport = async () => {
    const params = new URLSearchParams({ format });
    if (selectedModules.length) params.set('moduleIds', selectedModules.join(','));
    const token = getStoredToken();
    const res = await fetch(`/api/import-export/export?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Export failed.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disposition = res.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="(.+)"/);
    a.download = match ? match[1] : `export.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    loadHistory();
  };

  const doPreview = async () => {
    setError('');
    setResult(null);
    if (files.length === 0) {
      setError('Select at least one file.');
      return;
    }
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    try {
      const res = await api.postForm('/import-export/import/preview', formData);
      setPreview(res);
    } catch (err) {
      setError(err.message);
    }
  };

  const doCommit = async () => {
    setError('');
    try {
      const res = await api.post('/import-export/import/commit', {
        rows: preview.rows,
        conflictResolution,
        fileName: files.map((f) => f.name).join(', '),
        fileFormat: files[0]?.name.split('.').pop(),
      });
      setResult(res);
      setPreview(null);
      setFiles([]);
      loadHistory();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-semibold mb-2">Export</h3>
        <div className="flex flex-wrap gap-2 items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <select
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="xml">XML</option>
            <option value="pdf">PDF</option>
          </select>
          <select
            multiple
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm min-w-[200px] h-9"
            value={selectedModules}
            onChange={(e) => setSelectedModules(Array.from(e.target.selectedOptions, (o) => o.value))}
          >
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400">(leave empty for all modules)</span>
          <button onClick={doExport} className="ml-auto bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3 py-1.5 text-sm">
            Export
          </button>
        </div>
      </section>

      <section>
        <h3 className="font-semibold mb-2">Import</h3>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-3">
          <input
            type="file"
            multiple
            accept=".json,.csv,.xlsx,.xml"
            onChange={(e) => setFiles(Array.from(e.target.files))}
            className="text-sm"
          />
          <button onClick={doPreview} className="bg-gray-800 hover:bg-gray-900 text-white rounded-lg px-3 py-1.5 text-sm">
            Preview Import
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {preview && (
            <div className="space-y-2">
              <p className="text-sm">
                {preview.validCount} valid, {preview.invalidCount} invalid, {preview.conflictCount} serial conflicts
                (of {preview.totalRows} total rows)
              </p>
              {preview.invalidRows.length > 0 && (
                <div className="text-xs text-red-600 max-h-32 overflow-y-auto">
                  {preview.invalidRows.map((r) => (
                    <div key={r.index}>
                      Row {r.index + 1}: {r.errors.join(', ')}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="text-sm">On serial number conflict:</label>
                <select
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1 text-sm"
                  value={conflictResolution}
                  onChange={(e) => setConflictResolution(e.target.value)}
                >
                  <option value="skip">Skip duplicates</option>
                  <option value="overwrite">Overwrite / merge</option>
                  <option value="renumber">Re-number sequentially</option>
                </select>
                <button
                  onClick={doCommit}
                  disabled={preview.validCount === 0}
                  className="ml-auto bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-sm"
                >
                  Confirm Import ({preview.validCount} rows)
                </button>
              </div>
            </div>
          )}

          {result && (
            <p className="text-sm text-green-600">
              Imported {result.imported}, skipped {result.skipped}, overwritten {result.overwritten}.
            </p>
          )}
        </div>
      </section>

      <section>
        <h3 className="font-semibold mb-2">History</h3>
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Format</th>
                <th className="px-3 py-2">Records</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-3 py-2 capitalize">{h.action}</td>
                  <td className="px-3 py-2">{h.fileName}</td>
                  <td className="px-3 py-2 uppercase text-xs">{h.fileFormat}</td>
                  <td className="px-3 py-2">{h.recordCount}</td>
                  <td className="px-3 py-2">{h.status}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{new Date(h.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
