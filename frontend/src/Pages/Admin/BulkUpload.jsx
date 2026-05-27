import React, { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, Download, Loader } from 'lucide-react';

const API_BASE = '/api';

const CARD = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 20,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
};

const STAT_BOX = (color, bg) => ({
  padding: 16,
  background: bg,
  borderRadius: 8,
  textAlign: 'center',
  border: `1px solid ${color}33`
});

export default function BulkUpload() {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState(null);
  const [validationPreview, setValidationPreview] = useState(null);
  const [error, setError] = useState(null);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setResult(null);
      setValidationPreview(null);
      setError(null);
    }
  }, []);

  const handleFileChange = useCallback((e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setValidationPreview(null);
      setError(null);
    }
  }, []);

  const validateFile = async () => {
    if (!file) return;
    setValidating(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_BASE}/bulk/validate`, { method: 'POST', body: formData });
      const data = await response.json();
      if (data.success) setValidationPreview(data);
      else setError(data.message || 'Validation failed');
    } catch (err) {
      setError(err.message);
    } finally {
      setValidating(false);
    }
  };

  const uploadFile = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_BASE}/bulk/upload`, { method: 'POST', body: formData });
      const data = await response.json();
      if (data.success) {
        setResult(data);
        setValidationPreview(null);
      } else setError(data.message || 'Upload failed');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetch(`${API_BASE}/bulk/template?type=visa`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'visa_application_template.xlsx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError('Failed to download template');
    }
  };

  const isValidFileType = file && /\.(csv|xlsx|xls)$/i.test(file.name);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <p style={{ color: '#6b7280', margin: 0, fontSize: '0.95rem' }}>Upload multiple visa applications via CSV or Excel.</p>
        <button
          onClick={downloadTemplate}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', background: '#055B75', color: '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600
          }}
        >
          <Download size={16} /> Download Template
        </button>
      </div>

      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input').click()}
        style={{
          border: `2px dashed ${dragActive ? '#055B75' : '#d1d5db'}`,
          borderRadius: 12,
          padding: 48,
          textAlign: 'center',
          background: dragActive ? '#F0FAFC' : '#ffffff',
          transition: 'all 0.2s',
          cursor: 'pointer'
        }}
      >
        <input id="file-input" type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} style={{ display: 'none' }} />
        <Upload size={48} style={{ color: '#9ca3af', marginBottom: 16 }} />
        <p style={{ fontSize: 16, margin: '0 0 8px', color: '#1f2937' }}>
          {file ? file.name : 'Drag and drop your file here, or click to browse'}
        </p>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
          Supported formats: CSV, XLSX, XLS (max 5MB)
        </p>
      </div>

      {file && !isValidFileType && (
        <div style={{ marginTop: 16, padding: 12, background: '#fee2e2', borderRadius: 8, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
          <XCircle size={16} /> Invalid file type. Please upload CSV, XLSX, or XLS.
        </div>
      )}

      {file && isValidFileType && (
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={validateFile}
            disabled={validating}
            style={{
              padding: '12px 24px', background: '#65B3CF', color: '#fff',
              border: 'none', borderRadius: 8, cursor: validating ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            {validating ? <Loader size={16} className="animate-spin" /> : <FileText size={16} />}
            Validate File
          </button>
          <button
            onClick={uploadFile}
            disabled={uploading}
            style={{
              padding: '12px 24px', background: '#10b981', color: '#fff',
              border: 'none', borderRadius: 8, cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            {uploading ? <Loader size={16} className="animate-spin" /> : <Upload size={16} />}
            Upload & Process
          </button>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 24, padding: 16, background: '#fee2e2', borderRadius: 8, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {validationPreview && (
        <div style={{ ...CARD, marginTop: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#1f2937' }}>Validation Preview</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
            <div style={STAT_BOX('#10b981', '#d1fae5')}>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#065f46' }}>{validationPreview.summary.valid}</div>
              <div style={{ fontSize: 14, color: '#6b7280' }}>Valid Rows</div>
            </div>
            <div style={STAT_BOX('#ef4444', '#fee2e2')}>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#991b1b' }}>{validationPreview.summary.invalid}</div>
              <div style={{ fontSize: 14, color: '#6b7280' }}>Invalid Rows</div>
            </div>
            <div style={STAT_BOX('#055B75', '#F0FAFC')}>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#055B75' }}>{validationPreview.summary.total}</div>
              <div style={{ fontSize: 14, color: '#6b7280' }}>Total Rows</div>
            </div>
          </div>
          {validationPreview.preview && validationPreview.preview.length > 0 && (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {validationPreview.preview.slice(0, 10).map((row, i) => (
                <div key={i} style={{
                  padding: 12, background: row.valid ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${row.valid ? '#bbf7d0' : '#fecaca'}`,
                  borderRadius: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <span style={{ color: '#1f2937' }}>Row {row.row}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: row.valid ? '#065f46' : '#991b1b' }}>
                    {row.valid ? <CheckCircle size={16} /> : <XCircle size={16} />}
                    {row.valid ? 'Valid' : row.errors.join(', ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {result && (
        <div style={{ ...CARD, marginTop: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 18, display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937' }}>
            <CheckCircle size={20} color="#10b981" /> Upload Complete
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
            <div style={STAT_BOX('#10b981', '#d1fae5')}>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#065f46' }}>{result.successful}</div>
              <div style={{ fontSize: 14, color: '#6b7280' }}>Successful</div>
            </div>
            <div style={STAT_BOX('#ef4444', '#fee2e2')}>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#991b1b' }}>{result.failed}</div>
              <div style={{ fontSize: 14, color: '#6b7280' }}>Failed</div>
            </div>
            <div style={STAT_BOX('#055B75', '#F0FAFC')}>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#055B75' }}>{result.processed}</div>
              <div style={{ fontSize: 14, color: '#6b7280' }}>Total Processed</div>
            </div>
          </div>
          {result.errors && result.errors.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#374151' }}>Errors:</h4>
              {result.errors.slice(0, 10).map((err, i) => (
                <div key={i} style={{
                  padding: 8, background: '#fef2f2', border: '1px solid #fecaca',
                  borderRadius: 6, marginBottom: 4, fontSize: 14, color: '#991b1b'
                }}>
                  Row {err.row}: {err.errors.join(', ')}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
