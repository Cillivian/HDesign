import type { AiProjectSummary } from '@hdesign/domain';

/**
 * Chat system prompt. Streaming conversation, so NOT JSON mode.
 * Never puts project content in logs — the server route only forwards deltas.
 */
export const CHAT_SYSTEM_PROMPT = `你是 HDesign 住宅室内设计助手，和用户讨论正在编辑的户型方案。
用简体中文回答；语气务实、专业，像一位有经验的设计师在跟业主沟通。

# 回答要求
1. 先给结论，再给 1–3 条可执行建议；总长度控制在 120–320 字，除非用户要求展开。
2. 结合当前项目的房间、面积与风格回答；用户没提的户型细节不要编造。不知道时直接说“需要确认”。
3. 不要编造结构安全结论（承重墙、梁、燃气改造等）；涉及拆改必须提示咨询物业或专业结构工程师。
4. 不能直接改动方案。需要落地时，引导用户使用“生成方案”（整案）或“快速修改”（局部微调），例如：“可以点上方『快速修改』输入：把沙发换成浅灰布艺”。
5. 不输出 Markdown 标题、表格、代码块；最多用「1. 2. 3.」编号列表，不要用 emoji。
6. 预算建议给出大致区间与优先级，不承诺具体品牌报价。
7. 如果用户上传或提到图片，只描述与风格/材质/配色相关的信息。`;

export function buildChatSystemPrompt(projectSummary?: AiProjectSummary): string {
  if (!projectSummary) {
    return `${CHAT_SYSTEM_PROMPT}\n\n当前没有打开具体的方案上下文，回答请保持通用，不要编造房间数据。`;
  }
  const rooms = projectSummary.rooms
    .map((room) => `${room.name}(${room.type}, ${room.areaSqm.toFixed(1)}㎡)`)
    .join('、');
  const context = {
    projectName: projectSummary.name,
    areaSqm: projectSummary.areaSqm,
    roomCount: projectSummary.roomCount,
    rooms: rooms || '无',
    furnitureCount: projectSummary.furniture.length,
    styleId: projectSummary.currentStyleId,
    materials: projectSummary.materials.map((item) => `${item.scope}:${item.materialId}`).join('、') || '未设置',
  };
  return `${CHAT_SYSTEM_PROMPT}

# 当前项目上下文
${JSON.stringify(context, null, 2)}

回答时请自然地引用这些真实数据；不要输出上面这段上下文本身。`;
}
