import { useEffect, useState } from 'react';
import { api, getStoredToken } from '../../api/client';
import { useAuth, isAdmin } from '../../context/AuthContext';
import PasswordInput from '../../components/PasswordInput';
import { emit } from '../../utils/events';

async function downloadFromApi(path, defaultFilename) {
  const token = getStoredToken();
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Download failed.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="(.+)"/);
  a.download = match ? match[1] : defaultFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ImportExportTab() {
  const { user } = useAuth();
  const admin = isAdmin(user);

  const [nodes, setNodes] = useState([]);
  const [selectedNodes, setSelectedNodes] = useState([]);
  const [format, setFormat] = useState('json');
  const [history, setHistory] = useState([]);

  const [files, setFiles] = useState([]);
  const [preview, setPreview] = useState(null);
  const [conflictResolution, setConflictResolution] = useState('skip');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [fullExportOpen, setFullExportOpen] = useState(false);
  const [fullExportPassword, setFullExportPassword] = useState('');
  const [fullExportError, setFullExportError] = useState('');
  const [fullExportBusy, setFullExportBusy] = useState(false);

  useEffect(() => {
    api.get('/nodes').then((res) => setNodes(res.nodes)).catch(() => {});
    loadHistory();
  }, []);

  const loadHistory = () => {
    api.get('/import-export/history').then((res) => setHistory(res.history)).catch(() => {});
  };

  const doExport = async () => {
    setError('');
    const params = new URLSearchParams({ format });
    if (selectedNodes.length) params.set('nodeIds', selectedNodes.join(','));
    try {
      await downloadFromApi(`/import-export/export?${params.toString()}`, `export.${format}`);
      loadHistory();
    } catch (err) {
      setError(err.message);
    }
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
      emit('questions:changed');
    } catch (err) {
      setError(err.message);
    }
  };

  const doFullExport = async (e) => {
    e.preventDefault();
    setFullExportError('');
    setFullExportBusy(true);
    try {
      const token = getStoredToken();
      const res = await fetch('/api/import-export/export/full-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: fullExportPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Full export failed.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `full-database-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setFullExportOpen(false);
      setFullExportPassword('');
      loadHistory();
    } catch (err) {
      setFullExportError(err.message);
    } finally {
      setFullExportBusy(false);
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
            <option value="md">Markdown</option>
            <option value="xml">XML</option>
            <option value="pdf">PDF</option>
          </select>
          <select
            multiple
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5 text-sm min-w-[220px] h-9"
            value={selectedNodes}
            onChange={(e) => setSelectedNodes(Array.from(e.target.selectedOptions, (o) => o.value))}
          >
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400">(leave empty for everything; selecting a node includes its whole subtree)</span>
          <button onClick={doExport} className="ml-auto bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-3 py-1.5 text-sm">
            Export
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
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

      {admin && (
        <section>
          <h3 className="font-semibold mb-2">Full Database Export</h3>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 space-y-3">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ This downloads <strong>every</strong> table — including user accounts and password hashes. Handle the
              file like a credential. Every use is recorded in the audit log.
            </p>
            {!fullExportOpen ? (
              <button onClick={() => setFullExportOpen(true)} className="bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg px-3 py-1.5 text-sm">
                Export Full Database…
              </button>
            ) : (
              <form onSubmit={doFullExport} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px]">
                  <label className="block text-xs font-medium mb-1">Confirm your password</label>
                  <PasswordInput value={fullExportPassword} onChange={(e) => setFullExportPassword(e.target.value)} required />
                </div>
                <button type="submit" disabled={fullExportBusy} className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-60 text-white rounded-lg px-3 py-2 text-sm">
                  {fullExportBusy ? 'Exporting…' : 'Confirm & Download'}
                </button>
                <button type="button" onClick={() => setFullExportOpen(false)} className="px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700">
                  Cancel
                </button>
              </form>
            )}
            {fullExportError && <p className="text-sm text-red-600">{fullExportError}</p>}
          </div>
        </section>
      )}

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
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-xs text-gray-400">
                    No import/export activity yet.
                  </td>
                </tr>
              )}
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
