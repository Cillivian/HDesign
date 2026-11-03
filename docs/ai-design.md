# AI 设计工作流

AI 只负责「提议」，本地确定性引擎负责「执行」。所有模型输出都必须通过 zod 校验，且只能引用项目中真实存在的 id。

## 端点（apps/server）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/ai/brief` | 根据自然语言与项目摘要返回 1–3 套 `DesignBrief`（风格/房间/家具/材质/水电/预算/假设） |
| POST | `/api/ai/patch` | 自然语言微调 → 白名单 `DesignPatch` 操作 |
| POST | `/api/ai/style-from-image` | 参考图 → 风格令牌与材质建议（Vision） |
| POST | `/api/ai/chat` | SSE 流式对话，`data: {"delta":"…"}` … `data: [DONE]` |
| POST | `/api/ai/parse-plan` | 图纸 Vision 识别（见 recognition.md） |

契约集中在 `packages/domain/src/ai.ts`，服务端与前端共用。服务端 provider 位于
`apps/server/src/provider/`：`deepseek`（默认，OpenAI 兼容）与 `openai-compat`（不含
DeepSeek 专属字段）。结构化任务关闭 thinking、温度 0.3–0.8、90s 超时；JSON 空响应与
schema 失败各重试一次；失败返回标准错误信封，绝不伪造成功。

## 一键上图

1. 前端 `buildProjectSummary()` 生成紧凑项目摘要 + 家具短名单 + 风格/材质。
2. LLM 返回候选 `DesignBrief`；前端展示色板、家具数量、点位、预算、假设与待确认问题。
3. 选中候选后 `patch-executor` 在**一个** doc-store commit 中执行：
   - 风格令牌与材质（`applyStyleToProject`）
   - 家具重排（`@hdesign/autolayout` 的 `generateLayout`，replace / fill-empty / 指定房间）
   - 水电点位（`generateMep`，确保回路存在）
   - 校验尺寸、房间归属、SKU/材质存在性，非法操作进入 rejected 列表并给出原因
4. 应用前展示 diff，确认后写入；整次可一次撤销。AI 创建的实体带 `meta.source='ai'`。

自然语言微调同样走 `DesignPatch` → 本地校验 → 预览 → 应用。模型不写绝对坐标：
移动使用相对 `nudge`，新增家具由本地引擎放到房间内合适位置。

## 物料清单

`apps/web/src/services/bom.ts` 本地计算：地面面积与损耗（木地板 5%、瓷砖/石材 8%）、
墙面/顶面面积、踢脚线、家具参考价、水电点位与辅材、分房间小计与总价区间。AI 只提供
选材建议，不修改数量。可导出 CSV，并生成「物料清单」图纸。

## 配置与演示

```bash
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-flash        # 支持 Vision + JSON Output
AI_REASONING_MODEL=deepseek-v4-pro
AI_API_KEY=sk-...
```

- 未配置密钥：`/api/ai/*` 返回 503 `AI_NOT_CONFIGURED`；方案页仍可查看本地物料清单与引导。
- `AI_MOCK=1`：从 `fixtures/ai/{brief,patch,style,chat,parse}.json` 回放确定性数据，
  UI 标识「演示数据模式」；`pnpm e2e` 默认使用该模式。
- 隐私：AI 调用发送降采样图片与项目摘要，服务端不落盘内容、不记录提示词与密钥。

## 安全边界

- 外部文本（图纸文字、项目名、备注）一律按数据处理，不进入系统指令。
- 只接受白名单操作；未知 SKU/材质/房间 id 被拒绝或映射到最接近的真实条目。
- 尺寸夹取到合法范围、家具保持房间内、门扇开启区不被遮挡。
- 聊天以纯文本渲染，不接受 HTML/脚本。
