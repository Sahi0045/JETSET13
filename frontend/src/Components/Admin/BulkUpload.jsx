import React, { useState, useRef } from 'react';
import './BulkUpload.css';

const BulkUpload = ({ 
  endpoint = '/api/bulk-upload', 
  acceptedTypes = ['.csv', '.xlsx', '.xls'],
  maxFileSize = 10 * 1024 * 1024, // 10MB
  onSuccess,
  onError,
  templateUrl,
  title = 'Bulk Upload',
  description = 'Drag and drop your file here, or click to browse'
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateFile = (selectedFile) => {
    const extension = '.' + selectedFile.name.split('.').pop().toLowerCase();
    if (!acceptedTypes.includes(extension)) {
      throw new Error(`Invalid file type. Accepted: ${acceptedTypes.join(', ')}`);
    }
    if (selectedFile.size > maxFileSize) {
      throw new Error(`File too large. Maximum size: ${maxFileSize / 1024 / 1024}MB`);
    }
    return true;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      try {
        validateFile(e.dataTransfer.files[0]);
        setFile(e.dataTransfer.files[0]);
        setResult(null);
      } catch (err) {
        setResult({ success: false, message: err.message });
        onError?.(err);
      }
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      try {
        validateFile(e.target.files[0]);
        setFile(e.target.files[0]);
        setResult(null);
      } catch (err) {
        setResult({ success: false, message: err.message });
        onError?.(err);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setUploading(true);
    setProgress(0);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
      
      const xhr = new XMLHttpRequest();
      
      await new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch {
              resolve({ success: true, message: 'Upload completed' });
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });
        
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
        
        xhr.open('POST', endpoint);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      });

      const successResult = { success: true, message: 'File uploaded successfully!' };
      setResult(successResult);
      onSuccess?.(successResult);
      setFile(null);
    } catch (err) {
      const errorResult = { success: false, message: err.message };
      setResult(errorResult);
      onError?.(err);
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="bulk-upload-container">
      <div className="bulk-upload-header">
        <h3>{title}</h3>
        {templateUrl && (
          <a href={templateUrl} className="download-template-link" download>
            <span className="material-symbols-outlined">download</span>
            Download Template
          </a>
        )}
      </div>
      
      {description && <p className="bulk-upload-description">{description}</p>}

      <div
        className={`bulk-upload-dropzone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          onChange={handleChange}
          style={{ display: 'none' }}
        />

        {uploading ? (
          <div className="upload-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">{progress}%</span>
          </div>
        ) : file ? (
          <div className="file-info">
            <span className="material-symbols-outlined file-icon">description</span>
            <div className="file-details">
              <span className="file-name">{file.name}</span>
              <span className="file-size">{formatFileSize(file.size)}</span>
            </div>
            <button 
              className="remove-file-btn"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        ) : (
          <div className="dropzone-content">
            <span className="material-symbols-outlined upload-icon">cloud_upload</span>
            <p>Drag & drop your file here</p>
            <span className="or-text">or</span>
            <button className="browse-btn">Browse Files</button>
            <span className="file-types">Accepted: {acceptedTypes.join(', ')}</span>
          </div>
        )}
      </div>

      {file && !uploading && (
        <button className="upload-btn" onClick={handleUpload}>
          <span className="material-symbols-outlined">upload</span>
          Upload & Process
        </button>
      )}

      {result && (
        <div className={`upload-result ${result.success ? 'success' : 'error'}`}>
          <span className="material-symbols-outlined">
            {result.success ? 'check_circle' : 'error'}
          </span>
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
};

export default BulkUpload;