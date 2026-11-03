# 参与贡献

欢迎提交 Issue 与 Pull Request。项目采用 MIT 协议开源。

## 本地开发

```bash
pnpm install
pnpm dev          # web http://localhost:5173 + api http://localhost:8791
pnpm typecheck
pnpm lint
pnpm test
pnpm e2e          # 首次会构建生产包并在 8793 启动 AI_MOCK 服务
```

环境要求：Node ≥ 22.12、pnpm 11、支持 WebGL2 的现代浏览器。AI 相关功能可选配置
`AI_API_KEY`（见 `.env.example`），未配置时本地识别、编辑与出图全部可用。

## 代码约定

- TypeScript 严格模式；包内纯逻辑不依赖 DOM（`packages/*` 可在 Worker/Node 中运行）。
- UI 使用 `apps/web/src/design-system/` 的 token 与基础组件，不硬编码调色板颜色。
- 移动端断点：`< 768px` 为手机布局（底部导航 + 抽屉 + 简化工具），`768–1179px` 为紧凑布局，
  `≥ 1180px` 为桌面三栏。改动 UI 时请同时检查 390×844 与 1024×768 视口。
- 识别相关的提示词/合并逻辑改动，请附上 `node scripts/probe-parse-plan.mjs` 的前后指标。

## 提交 PR

1. 从最新 `main` 拉出分支，提交信息说明「改了什么、为什么」。
2. PR 描述里写清验证方式（`pnpm typecheck && pnpm lint && pnpm test`，UI 改动附截图）。
3. 涉及图纸识别或出图数值的改动，请说明对已有夹具测试的影响。
4. 不要提交 `.env`、真实 AI 密钥或用户项目数据（`.hdz`、IndexedDB 导出、真实户型 PDF）。

## 许可

贡献的代码默认以 MIT 协议随本项目发布，详见 [LICENSE](LICENSE)。
