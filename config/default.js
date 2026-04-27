// 默认配置文件
module.exports = {
  // 扫描配置
  scan: {
    // 是否显示隐藏文件
    showHidden: false,
    // 最大递归深度（0 表示不限制）
    maxDepth: 0,
    // 大文件阈值（字节）
    largeFileThreshold: 100 * 1024 * 1024, // 100MB
    // 排除目录列表
    excludeDirs: [
      '$RECYCLE.BIN',
      'System Volume Information',
      'node_modules'
    ]
  },
  
  // WebSocket 配置
  websocket: {
    enabled: false,
    port: 8080
  },
  
  // 日志配置
  logger: {
    level: 'info',
    enabled: true
  }
};
