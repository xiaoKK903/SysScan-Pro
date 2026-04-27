# SysScan-Pro - 系统级磁盘分析与审计引擎

一个基于 Node.js 的高性能 Windows 磁盘空间深度分析工具，用于精准定位大文件与空文件夹。

## 项目定位

SysScan-Pro 是专为 Windows 系统设计的磁盘空间分析引擎，通过高性能的异步 I/O 架构，帮助用户快速了解磁盘空间使用情况，精准定位大文件和空文件夹，为系统优化和磁盘清理提供数据支持。

## 技术特点

- **非阻塞异步 I/O 架构**：采用 Node.js 原生异步文件系统 API，避免阻塞主线程，提升扫描性能
- **递归目录树遍历**：支持深度递归遍历目录结构，全面扫描所有文件
- **文件元数据提取**：提取文件大小、创建时间、修改时间等关键元数据
- **实时进度上报**：扫描过程中实时上报进度，便于监控和 UI 展示
- **纯插件化设计**：核心功能模块化，支持灵活扩展和二次开发

## 架构设计

### 模块解耦

SysScan-Pro 采用纯插件化、多模块设计，将核心功能彻底解耦：

- **扫描逻辑**：独立的扫描器模块，负责目录遍历和文件元数据提取
- **数据格式化**：可插拔的格式化插件，支持 JSON、CSV 等多种输出格式
- **实时通信**：WebSocket 通信模块，支持实时数据传输和进度推送

### 目录结构

```
SysScan-Pro/
├── src/                          # 源代码目录
│   ├── core/                     # 核心模块
│   │   ├── scanner/              # 扫描器模块
│   │   │   └── index.js          # 负责递归目录树遍历和文件元数据提取
│   │   ├── analyzer/             # 分析器模块
│   │   │   └── index.js          # 负责文件大小分析、空文件夹检测等
│   │   └── progress/             # 进度管理模块
│   │       └── index.js          # 负责实时进度上报和状态管理
│   ├── plugins/                  # 插件系统
│   │   ├── formatters/           # 数据格式化插件
│   │   │   ├── json-formatter.js # JSON 格式化插件
│   │   │   └── csv-formatter.js  # CSV 格式化插件
│   │   └── communicators/        # 通信插件
│   │       └── websocket-server.js # WebSocket 通信插件
│   └── utils/                    # 工具函数
│       ├── fs-async.js           # 异步文件系统工具
│       └── logger.js             # 日志工具
├── config/                       # 配置文件目录
│   └── default.js                # 默认配置
├── tests/                        # 测试目录
│   └── unit/                     # 单元测试
│       ├── scanner.test.js       # 扫描器测试
│       └── analyzer.test.js      # 分析器测试
├── examples/                     # 示例目录
│   ├── basic-scan.js             # 基础扫描示例
│   └── websocket-monitor.js      # WebSocket 监控示例
└── README.md                     # 项目说明文档
```

## 核心功能

### 1. 高性能磁盘扫描

- 采用非阻塞异步 I/O 架构，避免阻塞主线程
- 支持深度递归目录遍历，全面扫描所有文件
- 智能跳过系统保护目录，提升扫描效率
- 可配置的扫描深度和排除规则

### 2. 精准文件分析

- 大文件定位：可配置阈值，自动识别大文件
- 空文件夹检测：快速找出所有空文件夹
- 重复文件识别：（可选扩展）基于哈希值检测重复文件
- 文件类型统计：按扩展名分类统计文件数量和大小

### 3. 实时进度上报

- 扫描过程中实时上报进度信息
- 支持进度回调函数，便于集成到 UI 界面
- 可通过 WebSocket 实时推送进度到前端

### 4. 插件化扩展

- 格式化插件：支持自定义输出格式
- 通信插件：支持多种实时通信方式
- 分析插件：可扩展自定义分析规则

## 安装与使用

### 环境要求

- Node.js 14.0+
- Windows 操作系统（测试通过 Windows 10/11）

### 安装步骤

1. 克隆项目到本地
2. 安装依赖：`npm install`
3. 配置参数：根据需要修改 `config/default.js`
4. 运行示例：`node examples/basic-scan.js`

### 快速开始

#### 基础扫描示例

```javascript
const { Scanner, Analyzer } = require('./src/core');
const config = require('./config/default');

// 创建扫描器实例
const scanner = new Scanner(config.scan);

// 监听进度事件
scanner.on('progress', (progress) => {
  console.log(`扫描进度: ${progress.percentage}%`);
  console.log(`已扫描文件数: ${progress.filesScanned}`);
  console.log(`已扫描目录数: ${progress.dirsScanned}`);
});

// 监听完成事件
scanner.on('complete', (results) => {
  console.log('扫描完成！');
  console.log(`总文件数: ${results.totalFiles}`);
  console.log(`总大小: ${results.totalSize} bytes`);
  
  // 创建分析器实例
  const analyzer = new Analyzer(config.analyzer);
  
  // 分析大文件
  const largeFiles = analyzer.findLargeFiles(results, config.scan.largeFileThreshold);
  console.log(`大文件数量: ${largeFiles.length}`);
  
  // 分析空文件夹
  const emptyDirs = analyzer.findEmptyDirectories(results);
  console.log(`空文件夹数量: ${emptyDirs.length}`);
});

// 开始扫描
scanner.scan('C:\\');
```

#### WebSocket 实时监控示例

```javascript
const { WebSocketServer } = require('./src/plugins/communicators/websocket-server');
const { Scanner } = require('./src/core');
const config = require('./config/default');

// 启用 WebSocket
config.websocket.enabled = true;

// 创建 WebSocket 服务器
const wsServer = new WebSocketServer(config.websocket);
wsServer.start();

// 创建扫描器并连接到 WebSocket
const scanner = new Scanner(config.scan);
scanner.setProgressReporter(wsServer.getProgressReporter());

// 开始扫描
scanner.scan('D:\\');
```

## 配置说明

### 默认配置项

```javascript
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
```

## 插件开发

### 格式化插件开发

格式化插件需要实现以下接口：

```javascript
class MyFormatter {
  // 格式化数据为字符串
  format(data) {
    // 实现格式化逻辑
    return JSON.stringify(data);
  }
  
  // 获取输出文件扩展名
  getExtension() {
    return 'json';
  }
}

module.exports = MyFormatter;
```

### 通信插件开发

通信插件需要实现以下接口：

```javascript
class MyCommunicator {
  constructor(config) {
    this.config = config;
  }
  
  // 启动通信服务
  start() {
    // 实现启动逻辑
  }
  
  // 停止通信服务
  stop() {
    // 实现停止逻辑
  }
  
  // 发送消息
  send(message) {
    // 实现发送逻辑
  }
  
  // 获取进度报告器
  getProgressReporter() {
    return {
      report: (progress) => {
        this.send({ type: 'progress', data: progress });
      }
    };
  }
}

module.exports = MyCommunicator;
```

## 性能优化建议

1. **异步 I/O 利用**：充分利用 Node.js 的异步 I/O 特性，避免同步阻塞
2. **并发控制**：对文件系统操作进行并发控制，避免过多的文件句柄
3. **缓存策略**：对重复访问的目录结构进行缓存
4. **增量扫描**：支持增量扫描，只扫描变更的文件
5. **内存管理**：对大型目录结构采用流式处理，避免内存溢出

## 测试

运行单元测试：

```bash
npm test
```

运行特定测试文件：

```bash
npm test -- tests/unit/scanner.test.js
```

## 二次开发

### 扩展分析功能

1. 在 `src/core/analyzer/index.js` 中添加新的分析方法
2. 更新类型定义（如果使用 TypeScript）
3. 添加相应的单元测试

### 添加新的格式化插件

1. 在 `src/plugins/formatters/` 目录下创建新文件
2. 实现格式化插件接口
3. 在需要的地方引入并使用

### 集成到现有项目

1. 将 `src/` 目录复制到项目中
2. 根据需要调整配置
3. 引入核心模块并使用

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目。

## 联系方式

如有问题或建议，请通过 GitHub 联系我们。

---

**注意**：本项目仅用于学习和研究目的，请谨慎使用于生产环境。在对系统目录进行操作前，请确保备份重要数据。
