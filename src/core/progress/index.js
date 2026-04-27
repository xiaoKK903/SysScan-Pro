const EventEmitter = require('events');

class ProgressTracker extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      throttleInterval: options.throttleInterval || 100,
      debounceWindow: options.debounceWindow || 50,
      maxBufferSize: options.maxBufferSize || 1000,
      enableThrottling: options.enableThrottling !== false
    };
    
    this.stats = {
      startTime: null,
      currentPath: '',
      filesScanned: 0,
      dirsScanned: 0,
      totalSize: 0,
      errors: 0,
      isRunning: false,
      estimatedTotal: null
    };
    
    this._lastEmitTime = 0;
    this._pendingUpdates = [];
    this._updateTimer = null;
    this._fileInfoBuffer = [];
  }

  reset() {
    this.stats = {
      startTime: null,
      currentPath: '',
      filesScanned: 0,
      dirsScanned: 0,
      totalSize: 0,
      errors: 0,
      isRunning: false,
      estimatedTotal: null
    };
    
    this._lastEmitTime = 0;
    this._pendingUpdates = [];
    this._fileInfoBuffer = [];
    
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
      this._updateTimer = null;
    }
  }

  start() {
    this.stats.startTime = Date.now();
    this.stats.isRunning = true;
    this._lastEmitTime = Date.now();
    
    this.emit('start', {
      timestamp: this.stats.startTime
    });
  }

  stop() {
    this.stats.isRunning = false;
    
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
      this._updateTimer = null;
    }
    
    this._flushUpdates();
    
    this.emit('stop', {
      timestamp: Date.now(),
      stats: this.getStats()
    });
  }

  updateFile(path, size = 0) {
    this.stats.filesScanned++;
    this.stats.totalSize += size;
    this.stats.currentPath = path;
    
    this._queueUpdate({
      type: 'file',
      path,
      size,
      timestamp: Date.now()
    });
  }

  updateDirectory(path) {
    this.stats.dirsScanned++;
    this.stats.currentPath = path;
    
    this._queueUpdate({
      type: 'directory',
      path,
      timestamp: Date.now()
    });
  }

  updateError(error) {
    this.stats.errors++;
    
    this._queueUpdate({
      type: 'error',
      error: {
        code: error.code,
        message: error.message,
        path: error.path
      },
      timestamp: Date.now()
    });
  }

  setEstimatedTotal(total) {
    this.stats.estimatedTotal = total;
  }

  _queueUpdate(update) {
    if (!this.options.enableThrottling) {
      this._emitProgress();
      return;
    }
    
    this._pendingUpdates.push(update);
    
    if (update.type === 'file') {
      this._fileInfoBuffer.push({
        path: update.path,
        size: update.size
      });
      
      if (this._fileInfoBuffer.length > this.options.maxBufferSize) {
        this._fileInfoBuffer.shift();
      }
    }
    
    const now = Date.now();
    const elapsed = now - this._lastEmitTime;
    
    if (elapsed >= this.options.throttleInterval) {
      this._flushUpdates();
    } else if (!this._updateTimer) {
      this._updateTimer = setTimeout(() => {
        this._flushUpdates();
        this._updateTimer = null;
      }, this.options.throttleInterval - elapsed);
    }
  }

  _flushUpdates() {
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
      this._updateTimer = null;
    }
    
    this._emitProgress();
    this._pendingUpdates = [];
    this._lastEmitTime = Date.now();
  }

  _emitProgress() {
    const stats = this.getStats();
    const recentFiles = this._fileInfoBuffer.slice(-10);
    
    this.emit('progress', {
      ...stats,
      recentFiles,
      timestamp: Date.now()
    });
  }

  getStats() {
    const now = Date.now();
    const elapsed = this.stats.startTime ? (now - this.stats.startTime) : 0;
    
    let speed = 0;
    let estimatedTimeRemaining = null;
    
    if (elapsed > 0 && this.stats.filesScanned > 0) {
      speed = (this.stats.filesScanned * 1000) / elapsed;
      
      if (this.stats.estimatedTotal && this.stats.estimatedTotal > 0) {
        const remainingFiles = this.stats.estimatedTotal - this.stats.filesScanned;
        estimatedTimeRemaining = remainingFiles > 0 ? (remainingFiles / speed) : 0;
      }
    }
    
    return {
      ...this.stats,
      elapsed,
      elapsedFormatted: this._formatDuration(elapsed),
      speed,
      speedFormatted: `${Math.round(speed)} 文件/秒`,
      estimatedTimeRemaining,
      estimatedTimeRemainingFormatted: estimatedTimeRemaining !== null 
        ? this._formatDuration(estimatedTimeRemaining * 1000) 
        : null,
      percentage: this.stats.estimatedTotal 
        ? Math.min(100, (this.stats.filesScanned / this.stats.estimatedTotal) * 100) 
        : 0
    };
  }

  _formatDuration(ms) {
    if (ms < 1000) {
      return `${Math.round(ms)} 毫秒`;
    }
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours} 小时 ${minutes % 60} 分钟`;
    } else if (minutes > 0) {
      return `${minutes} 分钟 ${seconds % 60} 秒`;
    } else {
      return `${seconds} 秒`;
    }
  }

  bindToScanner(scanner) {
    scanner.on('start', (data) => {
      this.start();
    });
    
    scanner.on('file', (data) => {
      if (data.isDirectory) {
        this.updateDirectory(data.path);
      }
    });
    
    scanner.on('fileInfo', (data) => {
      this.updateFile(data.path, data.size);
    });
    
    scanner.on('error', (error) => {
      this.updateError(error);
    });
    
    scanner.on('complete', (result) => {
      this.emit('complete', result);
      this.stop();
    });
    
    scanner.on('stopping', () => {
      this.stop();
    });
    
    return this;
  }
}

module.exports = ProgressTracker;
