const EventEmitter = require('events');
const path = require('path');
const FSAsync = require('../../utils/fs-async');
const config = require('../../../config/default');

class Scanner extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      ...config.scan,
      ...options
    };
    
    this.fsAsync = new FSAsync({
      maxConcurrency: this.options.maxConcurrency || 30
    });
    
    this.isScanning = false;
    this.shouldStop = false;
    
    this.stats = {
      startTime: null,
      endTime: null,
      totalFiles: 0,
      totalDirs: 0,
      totalSize: 0,
      errors: [],
      currentPath: '',
      scanPaths: []
    };
    
    this._resetStats();
  }

  _resetStats() {
    this.stats = {
      startTime: null,
      endTime: null,
      totalFiles: 0,
      totalDirs: 0,
      totalSize: 0,
      errors: [],
      currentPath: '',
      scanPaths: []
    };
  }

  _shouldExclude(dirPath) {
    const baseName = path.basename(dirPath);
    
    if (this.options.excludeDirs && this.options.excludeDirs.includes(baseName)) {
      return true;
    }
    
    if (!this.options.showHidden && FSAsync.isHidden(dirPath)) {
      return true;
    }
    
    return false;
  }

  async _scanDirectory(dirPath, depth = 0) {
    if (this.shouldStop) return;
    
    if (this._shouldExclude(dirPath)) {
      return;
    }
    
    if (this.options.maxDepth > 0 && depth > this.options.maxDepth) {
      return;
    }

    const readResult = await this.fsAsync.safeReadDir(dirPath);
    
    if (!readResult.success) {
      this.stats.errors.push({
        type: 'readdir',
        ...readResult.error
      });
      this.emit('error', {
        type: 'readdir',
        ...readResult.error
      });
      return;
    }

    const entries = readResult.entries;
    const subDirs = [];

    for (const entry of entries) {
      if (this.shouldStop) return;
      
      const fullPath = path.join(dirPath, entry.name);
      
      this.stats.currentPath = fullPath;
      this.emit('file', {
        path: fullPath,
        name: entry.name,
        isDirectory: entry.isDirectory()
      });

      if (entry.isDirectory()) {
        this.stats.totalDirs++;
        subDirs.push(fullPath);
      } else if (entry.isFile()) {
        const statResult = await this.fsAsync.safeStat(fullPath);
        
        if (statResult.success) {
          this.stats.totalFiles++;
          this.stats.totalSize += statResult.stat.size;
          
          this.emit('fileInfo', {
            path: fullPath,
            name: entry.name,
            size: statResult.stat.size,
            extension: FSAsync.getExtension(fullPath),
            created: statResult.stat.birthtime,
            modified: statResult.stat.mtime
          });
        } else {
          this.stats.errors.push({
            type: 'stat',
            ...statResult.error
          });
        }
      }
    }

    for (const subDir of subDirs) {
      if (this.shouldStop) return;
      await this._scanDirectory(subDir, depth + 1);
    }
  }

  async scan(startPath) {
    if (this.isScanning) {
      throw new Error('Scanner is already running');
    }

    const absolutePath = path.resolve(startPath);
    
    const accessResult = await this.fsAsync.checkAccess(absolutePath);
    if (!accessResult) {
      throw new Error(`Cannot access path: ${absolutePath}`);
    }

    const statResult = await this.fsAsync.safeStat(absolutePath);
    if (!statResult.success) {
      throw new Error(`Cannot stat path: ${absolutePath}`);
    }

    if (!statResult.stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${absolutePath}`);
    }

    this.isScanning = true;
    this.shouldStop = false;
    this._resetStats();
    
    this.stats.startTime = Date.now();
    this.stats.scanPaths = [absolutePath];

    this.emit('start', {
      path: absolutePath,
      startTime: this.stats.startTime
    });

    try {
      await this._scanDirectory(absolutePath, 0);
    } catch (error) {
      this.emit('error', {
        type: 'scan',
        message: error.message,
        path: absolutePath
      });
    }

    this.stats.endTime = Date.now();
    this.isScanning = false;

    const result = {
      path: absolutePath,
      startTime: this.stats.startTime,
      endTime: this.stats.endTime,
      duration: this.stats.endTime - this.stats.startTime,
      totalFiles: this.stats.totalFiles,
      totalDirs: this.stats.totalDirs,
      totalSize: this.stats.totalSize,
      formattedSize: FSAsync.formatSize(this.stats.totalSize),
      errors: this.stats.errors,
      errorCount: this.stats.errors.length
    };

    this.emit('complete', result);
    
    return result;
  }

  stop() {
    this.shouldStop = true;
    this.emit('stopping');
  }

  getStats() {
    return {
      ...this.stats,
      isScanning: this.isScanning,
      percentage: 0
    };
  }
}

module.exports = Scanner;
