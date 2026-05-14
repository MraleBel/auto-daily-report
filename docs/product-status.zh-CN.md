# Auto Daily Report 需求与完成情况

## 产品目标

Auto Daily Report 是一个 Windows/macOS 桌面应用，用于根据 Git 提交活动生成纯文本日报。用户可以添加一个或多个远程 Git 仓库，选择分支、提交者和时间区间后，为每个仓库生成一份日报，也可以按仓库列表顺序一键汇总成一份文本。

## 当前需求

- 支持通过 Git URL 添加多个远程仓库。
- 应用在 Tauri 应用数据目录中托管本地 clone，不要求用户手动选择本地仓库目录。
- Git 访问复用系统 Git 凭据能力，包括 SSH Key、Windows Credential Manager、macOS Keychain 等。
- 每个仓库支持配置可选的项目名称。生成日报时优先使用项目名称；未填写时使用仓库名加分支。
- 支持刷新仓库、读取分支列表、读取作者列表、选择生成分支。
- 默认提交者读取全局 `git config user.name` 和 `git config user.email`，也允许用户手动选择或输入其他提交者。
- 默认日报时间范围为今天 00:00 到当前时间，用户可以手动修改开始和结束时间。
- 默认生成方式为 commit message 汇总。
- AI Diff 模式使用 OpenAI-compatible Chat Completions 接口，配置项包括 `baseUrl`、`apiKey`、`model`。
- AI Diff 模式会把 commit message 和截断后的 diff 内容发送给用户选择的模型服务。
- 模型配置支持新增、编辑、删除，API Key 支持显示/隐藏。
- 支持按需开启“一键时间格式化”。
- 时间格式化支持设置总工时，并选择分配策略：按条目平均、按提交数量加权、AI 估算。
- 支持单仓库生成日报。
- 支持批量生成所有仓库日报。
- 支持复制每个仓库的日报纯文本。
- 支持按仓库列表顺序一键汇总已生成日报。
- 已生成日报会保存到本地历史。
- 应用内提供更新检查、安装更新并重启的交互入口。
- Windows 安装包通过 NSIS 配置支持用户选择安装范围/目录。
- GitHub Actions 支持通过 `vX.Y.Z` tag 构建 Windows x64、macOS Intel、macOS Apple Silicon 产物。
- 当前默认不配置付费 Windows 代码签名证书，也不配置 Apple Developer 签名/公证。早期分发时出现 SmartScreen 或 Gatekeeper 风险提示属于预期。
- Tauri updater 使用项目生成的免费 key pair 做更新包校验，不依赖付费签名证书。

## 已完成内容

- 已搭建 Tauri v2 + Rust 后端 + React/TypeScript 前端项目。
- Rust 后端已实现以下命令：
  - `get_snapshot`
  - `add_repository`
  - `update_repository`
  - `remove_repository`
  - `refresh_repository`
  - `list_branches`
  - `list_authors`
  - `default_author`
  - `generate_report`
  - `save_model_config`
  - `delete_model_config`
  - `update_settings`
  - `delete_report`
  - `check_update_status`
- 使用 JSON 文件持久化仓库配置、模型配置、应用设置和日报历史。
- 仓库 clone 保存在应用数据目录中。
- Git 操作通过系统 `git` 命令执行。
- Windows 下 Git 子进程已设置 `CREATE_NO_WINDOW`，避免点击刷新、读取分支、生成日报时闪现终端窗口。
- 已实现基于 commit message 的日报生成：
  - 按分支、作者、时间区间过滤提交。
  - 支持常见英文/中文前缀分类，例如 `feat`、`fix`、`perf`、`refactor`、`docs`、`test`、`开发`、`修复`、`优化`、`测试`、`文档`。
  - 输出纯文本日报。
- 已实现 AI 生成：
  - 通过 OpenAI-compatible `/chat/completions` 调用模型。
  - 当前鉴权方式为 `Authorization: Bearer <apiKey>`。
  - 发送 diff 前会做长度截断。
  - AI 调用失败时回退保留 message 模式结果。
- 已实现前端界面：
  - 左侧仓库列表。
  - 添加远程仓库表单。
  - 分支、作者、开始时间、结束时间控制。
  - Message / AI Diff 模式切换。
  - 模型选择。
  - 工时格式化控制。
  - 每个仓库独立日报卡片。
  - 批量生成。
  - 一键汇总和复制。
  - 本地历史页面。
  - 模型管理和设置页面。
  - 应用更新检查/安装入口。
- 已完成发布与更新基础配置：
  - `src-tauri/tauri.conf.json` 已写入 updater 公钥。
  - 本地私钥生成在 `.tauri/auto-daily-report.key`，并已通过 `.gitignore` 忽略。
  - GitHub Actions release workflow 位于 `.github/workflows/release.yml`。
  - 发布说明位于 `docs/release.md`。
- 已完成本地 Windows 构建验证：
  - `cargo check -q` 通过。
  - 已生成 Windows NSIS 和 MSI 安装包。

## 本地构建产物

最近一次本地 Windows 构建产物：

- `src-tauri/target/release/bundle/nsis/Auto Daily Report_0.1.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Auto Daily Report_0.1.0_x64_en-US.msi`

这些文件位于 `src-tauri/target/`，不会提交到 Git 仓库。

## 配置说明

- updater endpoint 已配置为 `https://github.com/MraleBel/auto-daily-report/releases/latest/download/latest.json`。
- updater 公钥已提交在 `src-tauri/tauri.conf.json`。
- updater 私钥不会提交。后续如果要让 GitHub Actions 正式生成可更新产物，需要把 `.tauri/auto-daily-report.key` 的内容配置到 GitHub Secret：`TAURI_SIGNING_PRIVATE_KEY`。
- 当前私钥没有设置密码，所以 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 可以为空。
- 小米 MiMo Token Plan 或类似平台可以按 OpenAI-compatible 方式接入：
  - `Base URL` 填 Token Plan 页面提供的 OpenAI 兼容地址。
  - `API Key` 填 Token Plan 订阅管理中创建的 Key。
  - `模型名` 填套餐可用模型。
  - 应用会自动在 `Base URL` 后追加 `/chat/completions`。

## 已知问题与待完善

- 目前没有配置付费 Windows 代码签名证书。
- 目前没有配置 Apple Developer 签名和公证。
- GitHub Release 还没有正式发布，因此应用内更新检查在发布第一个 Release 前不会发现更新。
- API Key 目前为 MVP 简化处理，保存在应用本地 JSON 数据中，还没有接入系统钥匙串。
- 日报历史目前使用 JSON 持久化，还没有切到 SQLite。
- AI 鉴权目前只支持 Bearer 方式；部分平台可能需要 `api-key` 请求头，后续应增加“认证方式”配置。
- `commitWeighted` 工时分配策略目前仍是简化实现，需要改成严格按提交数量加权并保证总工时一致。
- AI 估算工时模式目前会收集 diff，但最终分配质量依赖模型输出。
- 仓库排序字段 `sortOrder` 已存在，但 UI 尚未提供拖拽或上移/下移排序。
- GitHub Actions release workflow 尚未在远端实际跑过。
- macOS Intel 和 Apple Silicon 安装包尚未实机验证。

## 建议的下一步开发

1. 推送 `vX.Y.Z` tag，跑一次 GitHub Actions release，验证 Windows/macOS 产物。
2. 给模型配置增加认证方式：`Bearer` / `api-key`。
3. 将 API Key 存储迁移到系统凭据或钥匙串。
4. 完善工时分配算法，确保每种策略的总工时严格等于用户设置值。
5. 增加仓库排序 UI。
6. 增加模型供应商预设，例如小米 MiMo Token Plan、OpenAI、DeepSeek、自定义 OpenAI-compatible。
7. 增加基于临时 Git 仓库 fixture 的集成测试。
8. 验证 macOS Intel 和 Apple Silicon 构建产物。

## 常用开发命令

```powershell
npm install
npm run build
```

Windows 本地 Tauri 检查和构建需要 Rust 与 Visual Studio C++ Build Tools：

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cmd /d /s /c '"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" && cargo check -q'
cmd /d /s /c '"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" && npm run tauri:build'
```
