class SysScanApp {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.isScanning = false;
    this.scanResult = null;
    this.largeFiles = [];
    this.emptyDirs = [];
    
    this.initializeElements();
    this.initializeEventListeners();
    this.connectWebSocket();
  }

  initializeElements() {
    this.connectionStatus = document.getElementById('connectionStatus');
    this.statusDot = this.connectionStatus.querySelector('.status-dot');
    this.statusText = this.connectionStatus.querySelector('.status-text');
    
    this.scanPathInput = document.getElementById('scanPath');
    this.quickPathsSelect = document.getElementById('quickPaths');
    this.startBtn = document.getElementById('startBtn');
    this.stopBtn = document.getElementById('stopBtn');
    
    this.showHiddenCheckbox = document.getElementById('showHidden');
    this.enableThrottleCheckbox = document.getElementById('enableThrottle');
    this.maxDepthInput = document.getElementById('maxDepth');
    this.largeFileThresholdInput = document.getElementById('largeFileThreshold');
    
    this.progressSection = document.getElementById('progressSection');
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
    this.scanStatus = document.getElementById('scanStatus');
    this.currentPath = document.getElementById('currentPath');
    
    this.filesCount = document.getElementById('filesCount');
    this.dirsCount = document.getElementById('dirsCount');
    this.totalSize = document.getElementById('totalSize');
    this.scanSpeed = document.getElementById('scanSpeed');
    
    this.elapsedTime = document.getElementById('elapsedTime');
    this.remainingTime = document.getElementById('remainingTime');
    
    this.resultsSection = document.getElementById('resultsSection');
    this.resultsSummary = document.getElementById('resultsSummary');
    
    this.resultPath = document.getElementById('resultPath');
    this.resultFiles = document.getElementById('resultFiles');
    this.resultDirs = document.getElementById('resultDirs');
    this.resultSize = document.getElementById('resultSize');
    this.resultDuration = document.getElementById('resultDuration');
    this.resultErrors = document.getElementById('resultErrors');
    
    this.largeFilesList = document.getElementById('largeFilesList');
    this.emptyDirsList = document.getElementById('emptyDirsList');
    this.errorsList = document.getElementById('errorsList');
    
    this.logSection = document.getElementById('logSection');
    this.logContainer = document.getElementById('logContainer');
  }

  initializeEventListeners() {
    this.quickPathsSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        this.scanPathInput.value = e.target.value;
      }
      e.target.value = '';
    });
    
    this.startBtn.addEventListener('click', () => this.startScan());
    this.stopBtn.addEventListener('click', () => this.stopScan());
  }

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    console.log('[WebSocket] Connecting to:', wsUrl);
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[WebSocket] Connection established');
        this.setConnectionStatus(true);
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };
      
      this.ws.onclose = (event) => {
        console.log('[WebSocket] Connection closed:', event.code, event.reason);
        this.setConnectionStatus(false);
        
        if (!event.wasClean) {
          setTimeout(() => this.connectWebSocket(), 3000);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this.setConnectionStatus(false);
      };
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      this.setConnectionStatus(false);
      setTimeout(() => this.connectWebSocket(), 3000);
    }
  }

  setConnectionStatus(connected) {
    this.isConnected = connected;
    
    if (connected) {
      this.statusDot.classList.remove('disconnected');
      this.statusDot.classList.add('connected');
      this.statusText.textContent = '已连接';
    } else {
      this.statusDot.classList.remove('connected');
      this.statusDot.classList.add('disconnected');
      this.statusText.textContent = '未连接';
    }
  }

  handleMessage(message) {
    console.log('[WebSocket] Received:', message.type);
    
    switch (message.type) {
      case 'welcome':
      case 'connected':
        console.log('[WebSocket] Server welcome:', message.message);
        break;
        
      case 'start':
        this.handleScanStart(message.data);
        break;
        
      case 'progress':
        this.handleProgress(message.data);
        break;
        
      case 'complete':
        this.handleComplete(message.data);
        break;
        
      case 'error':
        this.handleError(message.data);
        break;
        
      case 'pong':
        break;
        
      case 'status':
        console.log('[WebSocket] Server status:', message.data);
        break;
        
      default:
        console.log('[WebSocket] Unknown message type:', message.type);
    }
  }

  handleScanStart(data) {
    console.log('[Scan] Started:', data.path);
    this.isScanning = true;
    this.scanResult = null;
    this.largeFiles = [];
    this.emptyDirs = [];
    
    this.startBtn.disabled = true;
    this.stopBtn.disabled = false;
    this.scanPathInput.disabled = true;
    this.quickPathsSelect.disabled = true;
    
    this.progressSection.style.display = 'block';
    this.resultsSection.style.display = 'none';
    this.logSection.style.display = 'block';
    
    this.clearLog();
    this.updateProgress({
      percentage: 0,
      filesScanned: 0,
      dirsScanned: 0,
      totalSize: 0,
      currentPath: data.path,
      elapsed: 0,
      speed: 0
    });
  }

  handleProgress(data) {
    if (!this.isScanning) return;
    
    this.updateProgress(data);
    
    if (data.recentFiles && data.recentFiles.length > 0) {
      const latestFile = data.recentFiles[data.recentFiles.length - 1];
      this.addLogEntry('file', latestFile.path, this.formatSize(latestFile.size));
    }
  }

  handleComplete(data) {
    console.log('[Scan] Completed:', data);
    this.isScanning = false;
    
    this.scanResult = data;
    
    this.analyzeResults(data);
    
    this.updateResults(data);
    
    this.progressSection.style.display = 'none';
    this.resultsSection.style.display = 'block';
    
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;
    this.scanPathInput.disabled = false;
    this.quickPathsSelect.disabled = false;
  }

  handleError(data) {
    console.error('[Scan] Error:', data);
    this.addLogEntry('error', `${data.type}: ${data.message}`, data.path || '');
  }

  updateProgress(data) {
    const percentage = Math.min(100, Math.round(data.percentage || 0));
    
    this.progressFill.style.width = `${percentage}%`;
    this.progressText.textContent = `${percentage}%`;
    
    if (data.currentPath) {
      this.currentPath.textContent = data.currentPath;
    }
    
    this.filesCount.textContent = this.formatNumber(data.filesScanned || 0);
    this.dirsCount.textContent = this.formatNumber(data.dirsScanned || 0);
    this.totalSize.textContent = this.formatSize(data.totalSize || 0);
    this.scanSpeed.textContent = data.speedFormatted || '0 文件/秒';
    
    this.elapsedTime.textContent = data.elapsedFormatted || '0 秒';
    this.remainingTime.textContent = data.estimatedTimeRemainingFormatted || '计算中...';
  }

  analyzeResults(data) {
    this.largeFiles = [];
    this.emptyDirs = [];
    
    const largeFileThresholdMB = parseInt(this.largeFileThresholdInput.value) || 100;
    const largeFileThreshold = largeFileThresholdMB * 1024 * 1024;
    
    console.log('[Analysis] Large file threshold:', this.formatSize(largeFileThreshold));
  }

  updateResults(data) {
    this.resultsSummary.textContent = `扫描完成 - ${data.duration} ms`;
    
    this.resultPath.textContent = data.path;
    this.resultFiles.textContent = this.formatNumber(data.totalFiles);
    this.resultDirs.textContent = this.formatNumber(data.totalDirs);
    this.resultSize.textContent = data.formattedSize || this.formatSize(data.totalSize);
    this.resultDuration.textContent = this.formatDuration(data.duration);
    this.resultErrors.textContent = this.formatNumber(data.errorCount || 0);
    
    this.updateLargeFilesList(this.largeFiles);
    this.updateEmptyDirsList(this.emptyDirs);
    this.updateErrorsList(data.errors || []);
  }

  updateLargeFilesList(files) {
    if (files.length === 0) {
      this.largeFilesList.innerHTML = '<p class="empty-message">暂无大文件数据</p>';
      return;
    }
    
    const sortedFiles = [...files].sort((a, b) => b.size - a.size);
    
    this.largeFilesList.innerHTML = sortedFiles.map(file => `
      <div class="file-item">
        <div class="file-info">
          <div class="file-name">${this.escapeHtml(file.name || file.path)}</div>
          <div class="file-path">${this.escapeHtml(file.path)}</div>
        </div>
        <div class="file-size">${this.formatSize(file.size)}</div>
      </div>
    `).join('');
  }

  updateEmptyDirsList(dirs) {
    if (dirs.length === 0) {
      this.emptyDirsList.innerHTML = '<p class="empty-message">暂无空文件夹数据</p>';
      return;
    }
    
    this.emptyDirsList.innerHTML = dirs.map(dir => `
      <div class="file-item">
        <div class="file-info">
          <div class="file-name">${this.escapeHtml(dir)}</div>
        </div>
      </div>
    `).join('');
  }

  updateErrorsList(errors) {
    if (errors.length === 0) {
      this.errorsList.innerHTML = '<p class="empty-message">暂无错误记录</p>';
      return;
    }
    
    this.errorsList.innerHTML = errors.map(error => `
      <div class="error-item">
        <div class="file-info">
          <div class="error-type">${this.escapeHtml(error.type || 'error')}</div>
          <div class="error-message">${this.escapeHtml(error.message)} - ${this.escapeHtml(error.path || '')}</div>
        </div>
      </div>
    `).join('');
  }

  addLogEntry(type, message, detail = '') {
    if (!this.logContainer) return;
    
    const placeholder = this.logContainer.querySelector('.log-placeholder');
    if (placeholder) {
      placeholder.remove();
    }
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    
    let typeClass = 'file';
    let typeLabel = 'FILE';
    
    if (type === 'dir') {
      typeClass = 'dir';
      typeLabel = 'DIR';
    } else if (type === 'error') {
      typeClass = 'error';
      typeLabel = 'ERR';
    }
    
    entry.innerHTML = `
      <span class="log-time">${timeStr}</span>
      <span class="log-type ${typeClass}">${typeLabel}</span>
      <span class="log-path">${this.escapeHtml(message)}${detail ? ` (${detail})` : ''}</span>
    `;
    
    this.logContainer.appendChild(entry);
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
    
    const entries = this.logContainer.querySelectorAll('.log-entry');
    if (entries.length > 200) {
      entries[0].remove();
    }
  }

  clearLog() {
    if (this.logContainer) {
      this.logContainer.innerHTML = '<p class="log-placeholder">等待扫描开始...</p>';
    }
  }

  startScan() {
    const scanPath = this.scanPathInput.value.trim();
    
    if (!scanPath) {
      alert('请输入要扫描的路径');
      return;
    }
    
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      alert('WebSocket 未连接，请稍后重试');
      return;
    }
    
    const config = {
      path: scanPath,
      showHidden: this.showHiddenCheckbox.checked,
      maxDepth: parseInt(this.maxDepthInput.value) || 0,
      largeFileThreshold: (parseInt(this.largeFileThresholdInput.value) || 100) * 1024 * 1024,
      enableThrottling: this.enableThrottleCheckbox.checked
    };
    
    console.log('[Scan] Starting with config:', config);
    
    this.ws.send(JSON.stringify({
      type: 'startScan',
      data: config
    }));
  }

  stopScan() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    console.log('[Scan] Sending stop command');
    this.ws.send(JSON.stringify({
      type: 'stopScan'
    }));
    
    this.isScanning = false;
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;
    this.scanPathInput.disabled = false;
    this.quickPathsSelect.disabled = false;
  }

  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  formatDuration(ms) {
    if (ms < 1000) {
      return `${ms} 毫秒`;
    }
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours} 小时 ${minutes % 60} 分钟 ${seconds % 60} 秒`;
    } else if (minutes > 0) {
      return `${minutes} 分钟 ${seconds % 60} 秒`;
    } else {
      return `${seconds} 秒`;
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

function toggleAdvanced() {
  const content = document.getElementById('advancedContent');
  const icon = document.getElementById('toggleIcon');
  
  if (content.classList.contains('expanded')) {
    content.classList.remove('expanded');
    icon.textContent = '▼';
  } else {
    content.classList.add('expanded');
    icon.textContent = '▲';
  }
}

function switchTab(tabName) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  
  tabBtns.forEach(btn => btn.classList.remove('active'));
  tabPanels.forEach(panel => panel.classList.remove('active'));
  
  const activeBtn = Array.from(tabBtns).find(btn => 
    btn.textContent.toLowerCase().includes(tabName.toLowerCase()) ||
    btn.onclick && btn.onclick.toString().includes(tabName)
  );
  
  if (activeBtn) {
    activeBtn.classList.add('active');
  } else {
    const index = ['overview', 'largeFiles', 'emptyDirs', 'errors'].indexOf(tabName);
    if (index !== -1) {
      tabBtns[index].classList.add('active');
    }
  }
  
  const panelId = tabName + 'Panel';
  const activePanel = document.getElementById(panelId);
  if (activePanel) {
    activePanel.classList.add('active');
  }
}

function clearLog() {
  if (window.sysScanApp) {
    window.sysScanApp.clearLog();
  }
}

function startScan() {
  if (window.sysScanApp) {
    window.sysScanApp.startScan();
  }
}

function stopScan() {
  if (window.sysScanApp) {
    window.sysScanApp.stopScan();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.sysScanApp = new SysScanApp();
});
