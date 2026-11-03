"""Generate 1080x1440 Xiaohongshu-ready posters from docs/screenshots."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / 'docs' / 'screenshots'
OUT = Path(__file__).resolve().parent / 'images'
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1080, 1440
BG = (245, 246, 243)
INK = (23, 26, 23)
MUTED = (91, 99, 92)
FAINT = (111, 119, 111)
ACCENT = (184, 62, 38)
LINE = (220, 224, 216)
GRID = (233, 236, 228)

SONG_BOLD = '/System/Library/Fonts/Supplemental/Songti.ttc'
SANS = '/System/Library/Fonts/Hiragino Sans GB.ttc'


def font(path: str, size: int, index: int = 0):
    return ImageFont.truetype(path, size, index=index)


def song(size: int, bold: bool = True):
    return font(SONG_BOLD, size, 1 if bold else 3)


def sans(size: int, weight: int = 0):
    # 0 = W3, 2 = W6
    return font(SANS, size, 0 if weight == 0 else 2)


def draw_grid(draw: ImageDraw.ImageDraw):
    for x in range(0, W, 72):
        draw.line([(x, 0), (x, H)], fill=GRID, width=1)
    for y in range(0, H, 72):
        draw.line([(0, y), (W, y)], fill=GRID, width=1)


def text_width(draw, text, f):
    box = draw.textbbox((0, 0), text, font=f)
    return box[2] - box[0]


def wrap(draw, text, f, max_width):
    lines, current = [], ''
    for ch in text:
        candidate = current + ch
        if text_width(draw, candidate, f) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = ch
    if current:
        lines.append(current)
    return lines


def brand_mark(draw, x, y, s=24, color=INK):
    draw.rectangle([x, y, x + s, y + s], outline=color, width=2)
    draw.line([(x + 5, y + 4), (x + 5, y + s - 4)], fill=color, width=2)
    draw.line([(x + s - 5, y + 4), (x + s - 5, y + s - 4)], fill=color, width=2)
    draw.line([(x + 5, y + s / 2), (x + s - 5, y + s / 2)], fill=color, width=2)


def chips(draw, items, y, x=64):
    f = sans(19, 0)
    for item in items:
        tw = text_width(draw, item, f)
        w = tw + 28
        if x + w > W - 64:
            break
        draw.rounded_rectangle([x, y, x + w, y + 40], radius=2, outline=LINE, width=1, fill=(250, 251, 248))
        draw.text((x + 14, y + 9), item, font=f, fill=MUTED)
        x += w + 10


def poster(
    out_name: str,
    shot: str,
    label: str,
    title_lines: list[str],
    sub: str,
    caption: str,
    caption_sub: str,
    features: list[str],
    cover: bool = False,
):
    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)
    draw_grid(draw)

    brand_mark(draw, 64, 48)
    draw.text((100, 47), 'HDesign · 自用装修设计系统', font=sans(21, 2), fill=ACCENT)
    draw.text((W - 64 - 70, 50), f'{label}', font=sans(18, 0), fill=FAINT, anchor='ra')

    title_size = 78 if cover else 70
    title_font = song(title_size, True)
    y = 110
    line_height = int(title_size * 1.22)
    for index, line in enumerate(title_lines):
        color = ACCENT if index == 1 else INK
        draw.text((64, y), line, font=title_font, fill=color)
        y += line_height

    sub_y = y + 12
    sub_font = sans(27, 0)
    for line in wrap(draw, sub, sub_font, W - 128):
        draw.text((64, sub_y), line, font=sub_font, fill=MUTED)
        sub_y += 38

    shot_top = 480 if cover else 400
    source = Image.open(SHOTS / shot).convert('RGB')
    shot_w = W
    shot_h = int(source.height * shot_w / source.width)
    source = source.resize((shot_w, shot_h), Image.LANCZOS)
    img.paste(source, (0, shot_top))
    draw.line([(0, shot_top), (W, shot_top)], fill=LINE, width=2)
    draw.line([(0, shot_top + shot_h), (W, shot_top + shot_h)], fill=LINE, width=2)

    bottom = shot_top + shot_h + 42
    draw.text((64, bottom), caption, font=sans(27, 2), fill=INK)
    draw.text((64, bottom + 42), caption_sub, font=sans(22, 0), fill=FAINT)

    chips(draw, features, 1312)
    draw.line([(64, 1392), (W - 64, 1392)], fill=LINE, width=1)
    draw.text((64, 1404), 'HDesign · 本地优先 · 2D / 3D · 水电出图', font=sans(17, 0), fill=FAINT)
    draw.text((W - 64, 1404), label, font=sans(17, 0), fill=FAINT, anchor='ra')

    path = OUT / out_name
    img.save(path, optimize=True)
    print(path.relative_to(ROOT))


poster(
    '01-cover.png',
    'editor-3d.png',
    '01 / 06',
    ['装修方案太套路', '我干脆自己写了', '一个室内设计系统'],
    '新家要装修，设计师的方案改了又改；周末两天 vibe coding 了一个能自己改的系统。',
    '不替代设计师，只想少改几版图、少踩几个坑。',
    '从一张户型图开始：识别、方案、2D/3D、水电、出图。',
    ['户型识别', 'AI 方案', '2D / 3D', '水电出图'],
    cover=True,
)

poster(
    '02-import.png',
    'import-review.png',
    '02 / 06',
    ['把户型图丢进来', '墙体尺寸先认一遍'],
    '图片、PDF 都行；识别完对照原图校对，再用两点校准比例。',
    '识别是辅助，最后一定要自己核对。',
    '墙厚、门窗、房间名都能改，生成的是可编辑草图。',
    ['PNG / JPG / PDF', '墙体识别', '人工校对'],
)

poster(
    '03-ai.png',
    'ai-copilot.png',
    '03 / 06',
    ['一句话说清需求', '先出三套方案'],
    '风格、家具、材质、水电、预算一次看差异，选一套再一键上图。',
    '比如：89㎡两居、奶油风、15 万、有猫、客厅要投影。',
    '方案会标出预算、材质和待确认项，不会偷偷替你决定。',
    ['自然语言', '方案对比', '一键上图'],
)

poster(
    '04-mep.png',
    'sheets.png',
    '04 / 06',
    ['插座不够用？', '交底前自己先排一遍'],
    '按房间生成水位 / 电位，安装高度、回路都能改。',
    '厨房台面 1100mm、床头 700mm、空调 2200mm……',
    '平面、水位、电位、物料清单都能导出，交底时直接对。',
    ['水位图', '电位图', '回路负荷'],
)

poster(
    '05-layers.png',
    'editor-light.png',
    '05 / 06',
    ['颜色、尺寸、家具', '改到顺眼为止'],
    '图层可锁定、隐藏、调透明度；材质能换，改坏了直接撤销。',
    '客厅那面墙，我大概换了六次颜色。',
    '不用再“麻烦设计师改一版”，自己拖两下就能看效果。',
    ['图层管理', '材质替换', '单步撤销'],
)

poster(
    '06-local.png',
    'gallery.png',
    '06 / 06',
    ['方案只存在', '自己手里'],
    '本地优先：项目留在浏览器，也可以部署到自己的 NAS。',
    'AI 走自己的 DeepSeek Key，图纸和预算不出家门。',
    '从 3D 漫游到 `.hdz` 备份，自己的家自己盯。',
    ['本地存储', 'NAS 部署', 'AI 可关'],
)
