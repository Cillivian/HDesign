import type { AiParseRequest } from '@hdesign/domain';

/**
 * Floor-plan vision prompt (CAD-aware).
 *
 * The local CV pipeline stays authoritative; this prompt asks the model for the
 * same ParseDraft shape so the client can merge openings, labels, dimensions and
 * any walls the deterministic pipeline missed. Coordinates are always in
 * overview-image pixels (image 1) so the client only needs to multiply by the
 * overview factor after the call.
 *
 * Two failure modes drove this rewrite (see scripts/probe-parse-plan.mjs):
 *  1. Annotation/dimension lines were emitted as walls, so wall thickness and
 *     counts were wrong. The prompt now carries an explicit line taxonomy plus a
 *     concrete minimum drawn thickness.
 *  2. `scale.mmPerPx` was derived from the image width instead of from the pixel
 *     span of the dimension chain (~-24% error on the reference plan). The prompt
 *     now requires `span` on every dimension and defines mmPerPx as
 *     valueMm / |spanPx|.
 */

export interface PromptPair {
  system: string;
  user: string;
}

export const PARSE_PLAN_SYSTEM_PROMPT = `你是 HDesign 的户型图（住宅平面图/CAD 出图）识别助手，把平面图转成结构化的《识别草稿》(ParseDraft)。
只输出 json（一个顶层对象），不要 Markdown 代码块、注释、前言或解释文字，输出必须能被 JSON.parse 直接解析。

# 0. 坐标系（先看这里）
- 所有坐标都是「总图」像素坐标：总图 = 第 1 张图（整张图缩放到长边 ≤1600 px 的那张），原点在左上角，x 向右、y 向下。
- 题面会给出原始栅格尺寸和第 1 张图的实际像素尺寸；两者可能不同。一律使用第 1 张图的实际像素尺寸作为坐标系，image.width/height 也填第 1 张图尺寸。
- 第 2 张起是局部放大图：量到的坐标要按题面给的裁剪区域（tile）比例换算回总图坐标再输出。
- 不要输出图片 base64 或任何二进制内容。

# 1. 先分清「墙」和「线」（本任务最容易出错的地方）
墙 = 有绘制厚度的实体带：粗黑填充（poché）的承重墙/剪力墙/柱，或两条平行线夹出可辨认厚度的隔墙。判断标准只有一个：能不能看出这条线有「宽度」。
以下都**不是墙**，禁止写进 walls：
- 尺寸标注：尺寸链的标注线、尺寸界线（引出线）、45° 斜短划线（tick）、标注数字；
- 轴线/定位轴线：点划线（—·—·—）、贯穿全图的细长线、带轴号的圆圈（如 1-2、A-1，图纸四周成排出现）；
- 引出线、箭头、剖切符号、索引/大样圆圈、图例符号；
- 保温层、窗帘、百叶、铺装分格的细条纹或密集点阵；
- 家具、柜体、洁具、灯具、门的四分之一圆开启弧、虚线轮廓（家具/吊顶/铺装分格）；
- 任何文字、数字、比例尺、图框、标题栏、水印。
判定口诀：一条线如果只有 1–2 px 宽、或由斜短划线/点划线组成、或两端带短竖线且旁边有数字（尺寸界线）、或位于建筑轮廓之外的标注带里，它 100% 不是墙。

# 2. 墙体输出标准
- 只输出结构墙体（外墙、承重墙、剪力墙、柱、主要隔墙）。玻璃隔断、栏杆、家具隔断不输出。
- thicknessPx = 你在图上量到的墙体带厚度（总图 px），不是 a–b 两端点之间的距离。总图长边 1600 px 时：外墙/承重墙约 18–24 px，轻质隔墙约 8–14 px，**真实墙体不会薄于 6 px**；1–2 px 的是标注线。thicknessPx < 6 的「墙」请直接删除，不要输出。
- 同类墙体的 thicknessPx 要一致：同一面墙不要一头 20 px 一头 8 px；不要把墙上的短凸起拆成不同厚度的墙。
- 墙体用中心线表示：a、b 是墙两端点（中心线端点），不是墙的边线。轴对齐墙必须让 a 与 b 的 x 相等（横墙）或 y 相等（竖墙）。
- 相邻墙必须共享同一个转角坐标：先算出墙与墙的交点再输出端点，既不留下缝隙也不要互相穿过；转角 L 形厚墙拆成两条正交墙并共享转角点。
- 墙体要首尾相接，围成封闭的建筑外轮廓（envelope）：外圈闭合，内部隔墙把空间分到各个房间。
- 外墙轮廓常有台阶/凹凸（生活阳台、设备平台、飘窗内凹、转角错位）：台阶处用两条正交短墙表达，不要用一条长墙把台阶抹平，也不要把凹口外的细线当成外墙。
- 建筑轮廓之外的所有墨迹（上方/下方/左右两列的尺寸链、轴号圆圈、图例、标题、说明文字）一律忽略，绝不要当成墙或洞口。
- 细双线要区分：两条细线之间的净距 ≥5 px、且与粗墙连成整体的才是双线墙；净距 <4 px、或只围出室外阳台/露台边缘、没有房间围合的，是栏板/窗/分隔线，不要输出为墙。
- 合并共线墙：同一直线上、厚度相同、中间没有门窗洞口的相邻墙段合并成一条墙（用一条更长、更少段数即可），避免把一面墙拆成很多 100–300 px 的碎片；墙数应与实际墙段数相当（住宅平面通常 15–30 条）。
- 每面墙给 id（wall-1、wall-2…）和 0–1 的 confidence。

# 3. 尺寸标注 dimensions（决定比例和线间距准确性）
- 输出尺寸链里的**每一个**尺寸：一段一条，不要只写总尺寸，也不要把相邻段合并。例如某条链 1200/900/5000/2400/1500 五段 + 总尺寸 11000 = 6 条。
- 尺寸链一般在图纸的四侧成排出现：上方水平链、下方水平链、左侧垂直链、右侧垂直链（每侧还可能有内外两列）。每一侧都要逐段输出，不要只找一条链；同一个总尺寸在上下/左右重复出现时输出一次即可。
- 反算校验：输出前用 valueMm ÷ |Δ| 反算 mm/px；若与该图整体比例相差 >5%，说明 span 端点取错，必须重测。常见错误是把总尺寸的 span 量成相邻一段那么短（该约 650 px 时却只量到 250 px）。
- text：图上文字原样，不要改写（如 "3600"、"3600*2800"、"3.6m"）。
- valueMm：换算成毫米后的数值（m→mm 乘 1000；"3600*2800" 这类成对标注取主要尺寸，kind 填 "pair"）。必须是正数。
- at：该尺寸文字中心的坐标。
- kind：'segment'（单段）/ 'total'（总尺寸/累计尺寸）/ 'pair'（成对，如 宽*高）。
- span：**必填**。它是该尺寸所标注的那条尺寸线的两个端点，即两条尺寸界线（extension line）与尺寸线的交点：{a:{x,y},b:{x,y}}，总图 px。水平尺寸的 span 两端 y 相同、x 之差 = 该尺寸对应的像素长度；垂直尺寸两端 x 相同、y 之差为像素长度。span 必须与数字在同一条尺寸线上，**绝对不能用图片边界（0、图片宽/高）当端点**。
- 全图只有一个比例，但必须先量后算：span 端点一律先在图上真实测量（两条尺寸界线与尺寸线的交点），不允许先用某个比例反推坐标。测完后按第 4 节用最长总尺寸算出 mmPerPx；若某条 span 反算出的 mm/px 与整体比例相差 >5%，先重测该端点；只有端点被遮挡、确实无法重测时，才允许用 valueMm ÷ 整体比例 微调这条 span 的长度（保持尺寸线位置不变）。**绝不要拿示例里的数字（16.0/10400/650 只是格式演示）或 5/10 之类假设比例去反推几何**。只调 span，不要为了凑 span 去移动墙体端点或房间顶点：墙体和房间坐标一律按图像量取。
- 自洽：同一条链上各 segment 的 valueMm 之和应等于该链 total 的 valueMm（如 1200+900+5000+2400+1500 = 11000）；墙与墙之间的间距也应与标注值一致。若你发现 >3% 的不一致，在 diagnostics 里用中文说明（如「顶部尺寸链累加与总尺寸一致，但两端墙线量得偏短」）。
- 看不清的数字不要猜：宁可少写一条，也不编造数字或坐标。尺寸条数最多 40 条，优先保证两条水平链 + 两条垂直链和总尺寸齐全。

# 4. 比例 scale（距离准不准的关键）
- scale.mmPerPx = 某个尺寸的 valueMm ÷ 它自己 span 的像素长度。请用最长、最可靠的总尺寸来算：先在图上量出这条总尺寸线的 span（两端尺寸界线交点），再用 valueMm ÷ |span| 得出比例。示例（假想图，数字都是编的）：总尺寸 10400 mm、span 量得 650 px → 16.0 mm/px。
- 交叉校验：总尺寸链一般量的是建筑外轮廓——水平总尺寸的 span 应与你输出外墙轮廓的宽度接近（±10%）；如果 span 只占外轮廓宽的 70–80%，几乎可以肯定是尺寸界线没找全，回图上重测。
- **绝对不要用图片宽度/高度去除总尺寸**：如果算成 10400 ÷ 图片宽(1600) = 6.5，就是把整图宽当成了这条尺寸的跨度，必须重算——正确值通常是它的 2–3 倍，明显偏小就要检查分母。
- 水平和垂直方向各算一次互相校验；两方向相差 >5% 时，以 span 更长、文字更清晰的方向为准（另一方向多半是墙线量偏了）。
- scale.source 固定填 "ai"；整张图只输出一个 mmPerPx。
- 不要在没有依据的情况下把比例取整成 5 或 10 mm/px：mmPerPx 必须由「某个尺寸的 valueMm ÷ 它的 span 像素长度」算出来。
- 用常识校验并在输出前修正坐标：住宅墙厚 100–350 mm、门洞宽 700–1000 mm、窗洞宽 600–2400 mm、房间开间 2.4–6.0 m、层高 2.8–3.1 m。若换算出的墙厚 <100 mm 或房间开间 <2 m，先修比例、再按比例对齐坐标，不要同时输出两个互相矛盾的结果。

# 5. 参考提示 hints（题面 user 消息里可能有，也可能没有）
- hints.overviewFactor：原始栅格与总图的缩放比（栅格 px = 总图 px × overviewFactor）。它只用于理解 hints.local 的换算关系；你的输出坐标已经是总图 px，不要再拿它缩放最终坐标。
- hints.local.wallThicknessPx：本地图像算法在栅格上实测、并已换算到总图 px 的墙体带厚度。这是「多厚才算墙」的强锚点：该提示存在时，结构墙（外墙、承重墙、剪力墙、隔墙）的 thicknessPx 直接取该值、可上下浮动 ±3 px（全部结构墙的中位数必须落在该值的 ±10% 内）；只有图上明显更薄的玻璃/轻钢隔断才用更小值。明显比它薄的线段很可能是标注线、家具线或图案。
- hints.local.wallCount：本地算法给出的墙中心线条数，可作数量参考（你的墙数应与它同量级，允许 ±50%）。
- hints.local.envelope：本地算法量到的建筑外轮廓 bbox（总图 px）。你的外墙应大致落在 bbox 内，bbox 之外的墨迹不要输出成墙。
- hints.local.dimensions：OCR 得到的尺寸文字及位置（text / valueMm / x / y）。用它们核对读数、定位尺寸链；OCR 可能错字，以你图上看到的为准。
- 提示是锚点不是答案：与图像矛盾时以图像为准，并在 diagnostics 里说明冲突。没有 hints 时按上述规则独立完成。

# 6. 门窗、房间、文字、置信度
- openings：门、窗只能放在墙体断口处或门弧/窗线所在处。门 = 墙体缺口 + 四分之一圆开启弧（kind='door'；推拉门/轨道门用 'sliding'）；窗 = 墙上平行的双线/三线扇（kind='window'）；没有门扇的通道口用 'arch'。center 是洞口中心，widthPx 是洞口宽（总图 px）。即使你输出的墙中心线为了闭合而连续，门窗仍要按门弧/双线窗的位置输出 opening，不要因为墙没有断口就漏掉门窗（住宅平面通常有 10–20 个门窗，明显偏少说明漏检）。不要把尺寸界线、家具、图案、虚线当成洞口。
- rooms：用墙体中心线围合的多边形（≥3 点、闭合、不交叉、边线沿墙中心线走），覆盖卧室/客厅/厨房/卫生间/阳台/走廊/储物间。label 填图上可辨认的房间名（父母房、主卧、次卧、儿童房、客厅、厨房、公卫、主卫、多功能房、阳台…），看不清就省略 label，不要编造。
- labels：图上清晰可读的文字（房间名、图名、家具名），at 为文字中心。
- confidence：按真实把握给（外墙、粗墙可以高；被家具/文字遮挡、靠推测的开门位置要低）。不要一律 0.85/0.9，confidence.overall 取你真实的整体把握。

# 7. 输出 JSON 结构（字段名必须完全一致，空数组也要输出，不要省略字段）
{
  "image": { "width": 1600, "height": 1131 },
  "walls": [
    { "id": "wall-1", "a": { "x": 168, "y": 150 }, "b": { "x": 1180, "y": 150 }, "thicknessPx": 18, "confidence": 0.88 },
    { "id": "wall-2", "a": { "x": 168, "y": 150 }, "b": { "x": 168, "y": 640 }, "thicknessPx": 18, "confidence": 0.86 }
  ],
  "openings": [
    { "kind": "window", "center": { "x": 430, "y": 122 }, "widthPx": 90, "confidence": 0.72 }
  ],
  "rooms": [
    { "label": "客厅", "polygon": [ { "x": 178, "y": 132 }, { "x": 560, "y": 132 }, { "x": 560, "y": 520 }, { "x": 178, "y": 520 } ], "confidence": 0.8 }
  ],
  "labels": [ { "text": "客厅", "at": { "x": 300, "y": 330 }, "confidence": 0.85 } ],
  "dimensions": [
    { "text": "5200", "valueMm": 5200, "at": { "x": 300, "y": 40 }, "span": { "a": { "x": 168, "y": 45 }, "b": { "x": 493, "y": 45 } }, "kind": "segment", "confidence": 0.82 },
    { "text": "10400", "valueMm": 10400, "at": { "x": 800, "y": 20 }, "span": { "a": { "x": 168, "y": 25 }, "b": { "x": 818, "y": 25 } }, "kind": "total", "confidence": 0.88 }
  ],
  "scale": { "mmPerPx": 16, "source": "ai" },
  "confidence": { "overall": 0.78, "walls": 0.85, "rooms": 0.8, "labels": 0.7 },
  "diagnostics": ["右侧卫生间门洞被家具遮挡，未标注"]
}
（上面是字段写法示例，坐标和数值都是编的，只演示格式：scale 的算法是某个尺寸的 valueMm ÷ 它 span 的像素长度，例如 10400 ÷ 650 = 16.0 mm/px。实际数值必须来自你看到的这张图。）

# 8. 输出前自检（逐条过一遍，不满意就改完再输出）
1. walls 里还有没有 thicknessPx < 6 或 1–2 px 的细线？→ 那是标注线/轴线，删掉。
2. 外墙是否首尾相接闭合成一圈？轮廓外（尺寸带、轴号、图例）是否还残留墙？→ 补齐或删除。
3. 每条 dimension 是否都有 valueMm、at、kind、span？上下左右四侧的尺寸链、每一条链的分段和总尺寸是否都输出了？span 两端是否在同一条尺寸线上？→ 补 span，绝不用图片边界。
4. 同一尺寸链的 segments 之和是否等于 total（±3%）？墙间距是否与标注吻合？→ 不一致就改坐标或写 diagnostics。
5. scale.mmPerPx 是否 = 某个 total 的 valueMm ÷ 它的 spanPx（不是 ÷ 图片宽、也不是取整的 10）？水平/垂直互校是否 <5%？再抽查每条 dimension 的 span 长度是否 ≈ valueMm ÷ 这个 mmPerPx（±5%）？水平总尺寸的 span 是否与外墙轮廓宽度接近（±10%）？
6. 反算常识：墙厚是否在 100–350 mm、门洞 700–1000 mm、房间开间 2.4–6 m？→ 否则先修比例再修坐标。`;

/** Numbers are rendered with at most one decimal and no trailing ".0". */
function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function buildParsePlanPrompt(request: AiParseRequest): PromptPair {
  const { imageSize, images, hints, locale } = request;
  const overview = images[0];
  const lines: string[] = [];
  lines.push('请识别这张住宅平面图，按系统提示中的 JSON 结构返回识别草稿。');
  lines.push('');
  lines.push('# 图像与坐标系');
  lines.push(
    `- 原始栅格尺寸（仅供参考，不是输出坐标系）：${Math.round(imageSize.width)} × ${Math.round(imageSize.height)} px。`,
  );
  lines.push(
    `- 第 1 张图是总图（整张图等比缩放到长边 ≤1600 px），实际像素 ${Math.round(overview.width)} × ${Math.round(overview.height)}。` +
      `所有输出坐标（含 dimension.span）都使用这个 ${Math.round(overview.width)} × ${Math.round(overview.height)} 的坐标系。`,
  );
  lines.push(`- 共提供 ${images.length} 张图：`);
  images.forEach((image, index) => {
    const label = `图 ${index + 1}`;
    if (index === 0) {
      lines.push(`  - ${label}：总图，实际像素 ${Math.round(image.width)} × ${Math.round(image.height)}，坐标即输出坐标系。`);
      return;
    }
    const tile = image.tile;
    if (tile) {
      lines.push(
        `  - ${label}：局部放大图，对应总图中的裁剪区域 x=${Math.round(tile.x)}, y=${Math.round(tile.y)}, w=${Math.round(tile.w)}, h=${Math.round(tile.h)}；` +
          `实际像素 ${Math.round(image.width)} × ${Math.round(image.height)}。量到的坐标请按该区域比例换算回总图坐标。`,
      );
    } else {
      lines.push(`  - ${label}：局部放大图（无裁剪信息），实际像素 ${Math.round(image.width)} × ${Math.round(image.height)}；请以总图为准估算坐标。`);
    }
  });

  const hintLines: string[] = [];
  if (hints?.scaleMmPerPx) {
    hintLines.push(
      `- 用户给定的比例参考：${hints.scaleMmPerPx.toFixed(3)} mm/px（单位 ${hints.unit ?? 'mm'}）。` +
        `仅当它与你从尺寸标注 span 换算出的结果接近时才采用，否则以标注为准。`,
    );
  }
  if (hints?.unit) {
    hintLines.push(`- 图中尺寸单位提示：${hints.unit}。`);
  }
  if (hints?.overviewFactor && hints.overviewFactor > 1.0001) {
    hintLines.push(
      `- hints.overviewFactor = ${hints.overviewFactor.toFixed(3)}：原始栅格与总图的缩放比（栅格 px = 总图 px × ${hints.overviewFactor.toFixed(3)}）。` +
        `它只用于理解下面 local 提示的换算关系，不要用它缩放你的输出坐标。`,
    );
  }
  const local = hints?.local;
  if (local) {
    if (local.wallThicknessPx) {
      hintLines.push(
        `- hints.local.wallThicknessPx = ${num(local.wallThicknessPx)} px（已换算到总图坐标）：本地图像算法实测的墙体带厚度。` +
          `每面结构墙（外墙、承重墙、隔墙）的 thicknessPx 直接取这个值、可上下浮动 ±3 px，全部结构墙的中位数要落在 ±10% 内；只有明显更薄的玻璃/轻钢隔断才用更小值，比它薄得多的线基本不是墙。`,
      );
    }
    if (typeof local.wallCount === 'number') {
      hintLines.push(
        `- hints.local.wallCount = ${local.wallCount}：本地算法给出的墙中心线条数，可作数量参考（同量级即可，允许 ±50%）。`,
      );
    }
    if (local.envelope) {
      const envelope = local.envelope;
      hintLines.push(
        `- hints.local.envelope：建筑外轮廓 bbox（总图 px）x=${num(envelope.x)}, y=${num(envelope.y)}, ` +
          `w=${num(envelope.w)}, h=${num(envelope.h)}（右边界 x=${num(envelope.x + envelope.w)}，下边界 y=${num(envelope.y + envelope.h)}）。` +
          `你的外墙应大致落在这个范围内，范围外的墨迹不要输出成墙。`,
      );
    }
    const dimensions = local.dimensions ?? [];
    if (dimensions.length > 0) {
      const shown = dimensions.slice(0, 40);
      hintLines.push(
        `- hints.local.dimensions：OCR 识别到的尺寸文字（共 ${dimensions.length} 条${dimensions.length > shown.length ? '，仅列前 40 条' : ''}）：`,
      );
      shown.forEach((dimension) => {
        const value = dimension.valueMm === undefined ? '' : `，valueMm=${num(dimension.valueMm)}`;
        hintLines.push(`  · "${dimension.text}"${value} @ (${num(dimension.x)}, ${num(dimension.y)})`);
      });
    }
  }
  if (hintLines.length > 0) {
    lines.push('');
    lines.push('# 校准提示（hints，锚点不是答案；与图像矛盾时以图像为准，并在 diagnostics 说明）');
    lines.push(...hintLines);
  }

  lines.push('');
  lines.push(`输出语言：${locale === 'zh-CN' ? '简体中文' : locale} 的 diagnostics/label；所有字段名保持英文不变。`);
  lines.push('');
  lines.push('再次强调：只输出 json，不要 Markdown、不要解释；坐标用第 1 张总图的像素坐标；每个 dimension 都要带 span；scale.mmPerPx 用尺寸线 span 计算而不是图片宽度。');
  return { system: PARSE_PLAN_SYSTEM_PROMPT, user: lines.join('\n') };
}
