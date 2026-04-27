const fs = require('fs').promises;
const path = require('path');
const { constants } = require('fs');

class FSAsync {
  constructor(options = {}) {
    this.maxConcurrency = options.maxConcurrency || 50;
    this.activePromises = 0;
    this.queue = [];
  }

  async checkAccess(filePath, mode = constants.R_OK) {
    try {
      await fs.access(filePath, mode);
      return true;
    } catch (error) {
      return false;
    }
  }

  async safeStat(filePath) {
    try {
      const stat = await fs.stat(filePath);
      return {
        success: true,
        stat,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        stat: null,
        error: {
          code: error.code,
          message: error.message,
          path: filePath
        }
      };
    }
  }

  async safeReadDir(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      return {
        success: true,
        entries,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        entries: [],
        error: {
          code: error.code,
          message: error.message,
          path: dirPath
        }
      };
    }
  }

  async throttle(operation) {
    while (this.activePromises >= this.maxConcurrency) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    this.activePromises++;
    
    try {
      const result = await operation();
      return result;
    } finally {
      this.activePromises--;
      
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }

  static formatSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static isHidden(filePath) {
    const baseName = path.basename(filePath);
    return baseName.startsWith('.');
  }

  static joinPath(...paths) {
    return path.join(...paths);
  }

  static getExtension(filePath) {
    return path.extname(filePath).toLowerCase().slice(1);
  }
}

module.exports = FSAsync;
