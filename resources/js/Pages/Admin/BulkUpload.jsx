import React, { useState, useCallback } from 'react';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, Download, Loader } from 'lucide-react';

const API_BASE = '/api';

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
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
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

      const response = await fetch(`${API_BASE}/bulk/validate`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (data.success) {
        setValidationPreview(data);
      } else {
        setError(data.message || 'Validation failed');
      }
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

      const response = await fetch(`${API_BASE}/bulk/upload`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (data.success) {
        setResult(data);
        setValidationPreview(null);
      } else {
        setError(data.message || 'Upload failed');
      }
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
    <div style={{ padding: '24px', color: '#f1f5f9', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', margin: 0 }}>Bulk Application Upload</h1>
          <p style={{ color: '#94a3b8', margin: '4px 0 0' }}>Upload multiple visa applications via CSV or Excel</p>
        </div>
        <button
          onClick={downloadTemplate}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 16px', background: '#3b82f6', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
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
        style={{
          border: `2px dashed ${dragActive ? '#3b82f6' : '#334155'}`,
          borderRadius: '12px', padding: '48px', textAlign: 'center',
          background: dragActive ? 'rgba(59, 130, 246, 0.1)' : '#1e293b',
          transition: 'all 0.2s', cursor: 'pointer'
        }}
        onClick={() => document.getElementById('file-input').click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <Upload size={48} style={{ color: '#64748b', marginBottom: '16px' }} />
        <p style={{ fontSize: '16px', margin: '0 0 8px' }}>
          {file ? file.name : 'Drag and drop your file here, or click to browse'}
        </p>
        <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
          Supported formats: CSV, XLSX, XLS (max 5MB)
        </p>
      </div>

      {file && !isValidFileType && (
        <div style={{ marginTop: '16px', padding: '12px', background: '#fef2f2', borderRadius: '8px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <XCircle size={16} /> Invalid file type. Please upload CSV, XLSX, or XLS.
        </div>
      )}

      {file && isValidFileType && (
        <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={validateFile}
            disabled={validating}
            style={{
              padding: '12px 24px', background: '#6366f1', color: 'white',
              border: 'none', borderRadius: '8px', cursor: validating ? 'not-allowed' : 'pointer',
              fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            {validating ? <Loader size={16} className="animate-spin" /> : <FileText size={16} />}
            Validate File
          </button>
          <button
            onClick={uploadFile}
            disabled={uploading}
            style={{
              padding: '12px 24px', background: '#10b981', color: 'white',
              border: 'none', borderRadius: '8px', cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            {uploading ? <Loader size={16} className="animate-spin" /> : <Upload size={16} />}
            Upload & Process
          </button>
        </div>
      )}

      {error && (
        <div style={{ marginTop: '24px', padding: '16px', background: '#fef2f2', borderRadius: '8px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {validationPreview && (
        <div style={{ marginTop: '24px', padding: '20px', background: '#1e293b', borderRadius: '12px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '18px' }}>Validation Preview</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
            <div style={{ padding: '16px', background: '#064e3b', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: '600', color: '#10b981' }}>{validationPreview.summary.valid}</div>
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>Valid Rows</div>
            </div>
            <div style={{ padding: '16px', background: '#7f1d1d', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: '600', color: '#ef4444' }}>{validationPreview.summary.invalid}</div>
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>Invalid Rows</div>
            </div>
            <div style={{ padding: '16px', background: '#1e3a5f', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: '600', color: '#3b82f6' }}>{validationPreview.summary.total}</div>
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>Total Rows</div>
            </div>
          </div>
          {validationPreview.preview && validationPreview.preview.length > 0 && (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {validationPreview.preview.slice(0, 10).map((row, i) => (
                <div key={i} style={{ padding: '12px', background: row.valid ? '#064e3b' : '#7f1d1d', borderRadius: '8px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Row {row.row}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {row.valid ? <CheckCircle size={16} color="#10b981" /> : <XCircle size={16} color="#ef4444" />}
                    {row.valid ? 'Valid' : row.errors.join(', ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '24px', padding: '20px', background: '#1e293b', borderRadius: '12px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={20} color="#10b981" /> Upload Complete
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
            <div style={{ padding: '16px', background: '#064e3b', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: '600', color: '#10b981' }}>{result.successful}</div>
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>Successful</div>
            </div>
            <div style={{ padding: '16px', background: '#7f1d1d', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: '600', color: '#ef4444' }}>{result.failed}</div>
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>Failed</div>
            </div>
            <div style={{ padding: '16px', background: '#1e3a5f', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: '600', color: '#3b82f6' }}>{result.processed}</div>
              <div style={{ fontSize: '14px', color: '#94a3b8' }}>Total Processed</div>
            </div>
          </div>
          {result.errors && result.errors.length > 0 && (
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#94a3b8' }}>Errors:</h4>
              {result.errors.slice(0, 10).map((err, i) => (
                <div key={i} style={{ padding: '8px', background: '#7f1d1d', borderRadius: '6px', marginBottom: '4px', fontSize: '14px' }}>
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
