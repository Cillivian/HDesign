# Reference drawing fixture

`cad-plan-2400.png` is a raster of a real CAD-style marketing floor plan
(one page, rendered at 2400 px long edge, flattened onto white). It exists to
regression-test the parts of the recognition pipeline that synthetic fixtures do
not exercise:

- filled wall poché mixed with **thin annotation ink**: dimension chains above
  and below the plan, extension lines, dot-dash axis/grid lines, circled axis
  labels (`1-2`, `A-1`), leader lines, hatch/legend fills, furniture and door
  swing arcs;
- large solid shear-wall / column blocks that merge with wall bands;
- dimension chains that span the whole building (top chain segments
  `1300 / 1000 / 6000 / 2800 / 1500 / 2100`, total `14700`).

Known measurements at this resolution (2400 x 1696 px):

| fact | value |
| --- | --- |
| drawing width between the outermost axis lines | 14700 mm |
| top dimension-chain line span | x = 250 … 2075 (1825 px) |
| implied scale | **≈ 8.05 mm/px** |
| wall poché thickness | 28–34 px (thin annotation lines are 1–2 px) |
| building outline | left/right axis ≈ x 250 / 2075 |

Regenerate from the source PDF on macOS (requires `sips`):

```bash
sips -s format png --resampleWidth 2400 plan.pdf --out /tmp/plan.png
# pdf renders have a transparent background: flatten onto white before use
python3 - <<'PY'
from PIL import Image
im = Image.open('/tmp/plan.png').convert('RGBA')
bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
Image.alpha_composite(bg, im).convert('RGB').save('fixtures/reference/cad-plan-2400.png')
PY
```
