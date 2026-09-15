# quality-inspection-system
本项目为公司内部实际使用的**质检协作云端平台**，由本人独立主导开发（采用 Vibe Coding 模式）。
## 核心功能与技术栈
- **跨端开发**：使用 Capacitor 打包 Web 应用，支持 Android 及 Mobile Web 端。
- **云端同步**：基于 Supabase 实现多端数据实时同步与用户认证。
- **核心逻辑**：`index.html` 为前端交互主入口，`main.js` 为 Electron 桌面端主进程，`cloud-sync.js` 负责云端数据映射与 CRUD 逻辑。
## 仓库说明
出于公司商业数据安全及隐私保护，本仓库**仅提取并展示项目的核心源代码骨架**，去除了所有公司内部真实业务数据。
