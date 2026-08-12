/**
 * PPT Viewer — Upload Page Module
 * Handles file selection, drag-and-drop, upload progress, session creation, and copy code functionality.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ── DOM References ──
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const fileInfo = document.getElementById('file-info');
  const fileName = document.getElementById('file-name');
  const fileSize = document.getElementById('file-size');
  const fileRemoveBtn = document.getElementById('file-remove-btn');
  
  const progressContainer = document.getElementById('progress-container');
  const progressStatusText = document.getElementById('progress-status-text');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const uploadBtn = document.getElementById('upload-btn');

  const uploadSection = document.getElementById('upload-section');
  const codeSection = document.getElementById('code-section');
  const sessionCode = document.getElementById('session-code');
  const copyBtn = document.getElementById('copy-btn');
  const slideCountMeta = document.getElementById('slide-count-meta');
  const startBtn = document.getElementById('start-btn');

  const joinCodeInput = document.getElementById('join-code-input');
  const joinBtn = document.getElementById('join-btn');

  // ── Constants & State ──
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
  const ALLOWED_EXTENSIONS = ['.ppt', '.pptx', '.pdf'];
  let selectedFile = null;
  let currentGeneratedCode = '';

  // ── Initialize Event Listeners ──
  init();

  function init() {
    // Clear file input on page load to prevent browser cache issues
    fileInput.value = '';

    // Drop Zone Click
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    // File Input Selection
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        processFile(e.target.files[0]);
      }
    });

    // Drag & Drop Events
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) {
        processFile(dt.files[0]);
      }
    });

    // Remove Selected File
    fileRemoveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearSelectedFile();
    });

    // Upload Button Click
    uploadBtn.addEventListener('click', handleUpload);

    // Copy Code Button
    copyBtn.addEventListener('click', copyCodeToClipboard);

    // Quick Join Session
    joinBtn.addEventListener('click', handleQuickJoin);
    joinCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleQuickJoin();
    });
  }

  // ── File Selection & Validation ──
  function processFile(file) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      showToast('Invalid File Type', 'Please upload a PowerPoint (.ppt, .pptx) or PDF file', 'error');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showToast('File Too Large', `Maximum allowed file size is 50 MB (Selected: ${formatBytes(file.size)})`, 'error');
      return;
    }

    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    
    fileInfo.hidden = false;
    uploadBtn.disabled = false;

    showToast('File Selected', `${file.name} ready to upload`, 'info');
  }

  function clearSelectedFile() {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.hidden = true;
    progressContainer.hidden = true;
    uploadBtn.disabled = true;
  }

  // ── File Upload Handler ──
  function handleUpload() {
    if (!selectedFile) return;

    // UI States
    uploadBtn.disabled = true;
    dropZone.style.pointerEvents = 'none';
    progressContainer.hidden = false;
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    progressStatusText.textContent = 'Uploading presentation...';

    const formData = new FormData();
    formData.append('file', selectedFile);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    // Progress Listener
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = percent + '%';
        progressText.textContent = percent + '%';
        if (percent >= 100) {
          progressStatusText.textContent = 'Preparing slides for display...';
        }
      }
    };

    // Completion Listener
    xhr.onload = () => {
      dropZone.style.pointerEvents = 'auto';

      if (xhr.status === 201) {
        try {
          const res = JSON.parse(xhr.responseText);
          currentGeneratedCode = res.code;

          // Render code and slide info
          sessionCode.textContent = res.code;
          slideCountMeta.textContent = res.slideCount;
          startBtn.href = `/viewer.html?code=${res.code}`;
          
          const pwaBtn = document.getElementById('pwa-controller-btn');
          if (pwaBtn) pwaBtn.href = `/controller.html?code=${res.code}`;

          codeSection.hidden = false;
          progressContainer.hidden = true;
          uploadBtn.hidden = true;
          showToast('Upload Successful!', `Session created with code ${res.code}`, 'success');

          // Scroll smoothly to code section
          codeSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (err) {
          showToast('Server Error', 'Failed to parse response from server', 'error');
          resetUploadState();
        }
      } else {
        let errMsg = 'Upload failed';
        try {
          const errRes = JSON.parse(xhr.responseText);
          if (errRes.error) errMsg = errRes.error;
        } catch (e) {}
        showToast('Upload Failed', errMsg, 'error');
        resetUploadState();
      }
    };

    // Network Error Listener
    xhr.onerror = () => {
      dropZone.style.pointerEvents = 'auto';
      showToast('Network Error', 'Could not connect to server. Check server status.', 'error');
      resetUploadState();
    };

    xhr.send(formData);
  }

  function resetUploadState() {
    progressContainer.hidden = true;
    uploadBtn.disabled = false;
  }

  // ── Copy Code to Clipboard ──
  function copyCodeToClipboard() {
    if (!currentGeneratedCode) return;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(currentGeneratedCode)
        .then(() => showCopyFeedback())
        .catch(() => fallbackCopy(currentGeneratedCode));
    } else {
      fallbackCopy(currentGeneratedCode);
    }
  }

  function fallbackCopy(text) {
    const tempInput = document.createElement('input');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
      document.execCommand('copy');
      showCopyFeedback();
    } catch (e) {
      showToast('Copy Failed', 'Please manually highlight and copy the code', 'error');
    }
    document.body.removeChild(tempInput);
  }

  function showCopyFeedback() {
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '✓ Copied!';
    copyBtn.style.color = 'var(--success)';
    showToast('Copied to Clipboard', `Session code ${currentGeneratedCode} copied`, 'success');
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
      copyBtn.style.color = '';
    }, 2000);
  }

  // ── Quick Join Session Handler ──
  function handleQuickJoin() {
    const code = joinCodeInput.value.trim().toUpperCase();
    if (!code || code.length !== 6) {
      showToast('Invalid Code', 'Please enter a valid 6-character session code', 'warning');
      return;
    }

    // Verify session existence via API before redirecting
    joinBtn.disabled = true;
    joinBtn.textContent = 'Verifying...';

    fetch(`/api/session/${code}`)
      .then(res => {
        if (res.ok) {
          window.location.href = `/viewer.html?code=${code}`;
        } else {
          return res.json().then(data => Promise.reject(data.error || 'Session not found'));
        }
      })
      .catch(err => {
        showToast('Cannot Join Session', typeof err === 'string' ? err : 'Session not found or expired', 'error');
        joinBtn.disabled = false;
        joinBtn.textContent = 'Join Session';
      });
  }

  // ── Utilities ──
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠️',
      info: 'ℹ️'
    };

    toast.innerHTML = `
      <div class="toast__icon">${icons[type] || 'ℹ️'}</div>
      <div>
        <div class="toast__title">${escapeHtml(title)}</div>
        <div class="toast__msg">${escapeHtml(message)}</div>
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
