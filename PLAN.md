# Metal Icon Studio — Build Plan

A browser tool that turns Phosphor icons (or any SVG) into extruded, beveled, polished-metal 3D renders at a customizable 3/4 angle, with film grain and an optional pixel-mosaic background. Static site, hosted on GitHub Pages.

> **For Claude Code:** read this whole file before writing code. Build in the phase order below and stop at the end of each phase so it can be reviewed in the browser. Sample icons are in `samples/`.

---

## 1. The look we're matching

The reference is a three-quarter perspective tilt, not true isometric. These are the traits that make it read as "engineered":

| Trait | Spec |
|---|---|
| Form | A flat glyph extruded to a deep solid, **or** a rounded-square "key" slab with the glyph engraved into its face |
| Edges | A clear chamfer or bevel on every edge that catches a bright highlight line |
| Material | Polished chrome or brushed aluminum: metalness 1, low roughness |
| Lighting | Studio strip lights. The front faces read bright and silvery; the side faces fall to near black. That contrast is the whole look. |
| Camera | Perspective at roughly 20–35° yaw and 10–25° pitch, often with a slight roll; low-to-moderate perspective distortion |
| Finish | Fine monochrome film grain over the whole frame |
| Background | Transparent, or a photo smeared horizontally and broken into an irregular pixel/block mosaic, with grain |

---

## 2. Stack and hosting

- **Vite + TypeScript, vanilla.** No UI framework; the controls panel is small. (Lit or Preact is fine if the panel grows.)
- **three.js** (`three@0.186.x`): `SVGLoader`, `ExtrudeGeometry`, `MeshPhysicalMaterial`, `PMREMGenerator`, `EffectComposer`.
- **three-bvh-csg** for engraving the glyph into the tile.
- **@phosphor-icons/core** (`2.1.1`, MIT) as a dependency, which gives 1,512 icons × 6 weights as raw SVGs.
- **fflate** to zip batch exports.
- **GitHub Pages**, deployed by a GitHub Actions workflow on push to `main`. Set `base: '/<repo-name>/'` in `vite.config.ts`.
- Everything runs client-side. No backend and no secrets.

### Phosphor SVG facts (already verified)

- Each icon is `viewBox="0 0 256 256"` and made of **filled outline paths**. There are no strokes, so `SVGLoader.createShapes()` can turn them into extrudable shapes directly.
- Files live at `assets/<weight>/<name>.svg` for regular, and `assets/<weight>/<name>-<weight>.svg` for the other weights.
- The paths use the nonzero fill rule, with holes defined by winding direction. Test that holes come out right (for example the `browser` window bar and `gear-six` center).
- The **duotone** weight has two layers. The `opacity="0.2"` path is the background shape and the second path is the line art. This maps directly onto a two-depth "stepped" mode (see Modes).
- Which weight suits which mode:
  - **fill** for Solid mode
  - **regular** or **bold** for Tile-engrave mode, since the line art reads as cut grooves
  - **duotone** for Stepped mode

---

## 3. Features

### 3.1 Icon input
- A Phosphor picker with search by name, a weight toggle, and a grid of results. Lazy-load the SVGs with `import.meta.glob('…/assets/**/*.svg', { query: '?raw', import: 'default' })` so they aren't all bundled up front.
- Upload or paste a custom SVG. Show a clear warning if it contains strokes; Phase 5 adds stroke-to-outline conversion.
- A recent-icons strip.

### 3.2 Modes
1. **Solid:** extrude the glyph as a single deep solid with a bevel.
2. **Tile (engraved):** a rounded-square slab with the glyph cut into the face by a CSG subtraction, giving a small chamfer inside the grooves. This matches the left icon in the reference.
3. **Tile (embossed):** the same slab with the glyph raised slightly off the face. It's cheaper than engraving because it needs no CSG, so use it as the fallback.
4. **Stepped (duotone):** the background layer is extruded shallow and the line art deeper on top.

### 3.3 Geometry controls
- Extrude depth, bevel size, bevel thickness and bevel segments. Use 1–2 segments for a chamfer and 4–8 for a rounded edge.
- `curveSegments` for curve smoothness.
- Tile: size padding around the glyph, corner radius, slab depth and slab bevel.
- Engrave or emboss depth, plus glyph scale within the tile.

### 3.4 Camera (custom angle)
- Sliders for **yaw, pitch and roll** in degrees.
- A **Perspective** slider that maps to field of view while moving the camera to compensate, so the object keeps the same framed size. Low values look near-orthographic (close to isometric); high values look dramatic.
- Drag-to-orbit on the canvas. Hold Shift to snap to 5° steps.
- Angle presets:

| Preset | Yaw | Pitch | Roll | Perspective |
|---|---|---|---|---|
| Hero | -28° | 18° | -6° | 30° |
| Lean right | 32° | 14° | 4° | 30° |
| Top down | -15° | 45° | 0° | 25° |
| Front flat | 0° | 0° | 0° | 20° |
| True iso | 45° | 35.264° | 0° | ortho |

  "True iso" is included for reference only.
- A **"Lock to brand angle"** toggle that hides the sliders and forces the saved angle, so everyone on the team gets the same tilt.

### 3.5 Material
- `MeshPhysicalMaterial` with metalness 1.
- Material presets:
  - **Chrome:** roughness 0.08, clearcoat 1
  - **Aluminum:** roughness 0.28
  - **Brushed:** roughness 0.35, with `anisotropy` around 0.6 and anisotropy rotation set so the brushing lines run horizontally
  - **Graphite:** dark tint, roughness 0.3
  - **Gunmetal:** blue-grey tint
- Exposed controls: tint color, roughness, clearcoat and anisotropy.

### 3.6 Lighting (the most important part)
- Build a **procedural studio environment** rather than shipping an HDRI. Make a small scene of emissive planes in a black void:
  - two tall softbox strips (left and top)
  - one wide overhead panel
  - a dim floor bounce

  Render it into a cubemap with `PMREMGenerator.fromScene()`. The black void is what makes the side faces go dark like in the reference.
- Lighting presets: **Studio**, **Top strip**, **Rim** and **Soft**. Each one is a set of panel positions and intensities.
- Controls: environment rotation (to slide highlights across the faces), intensity and contrast.
- Tone mapping: ACES Filmic or AgX. Leave exposure adjustable.
- Contact shadow: optional and off by default. The reference shows the object floating.

### 3.7 Post-processing
- Film grain as a custom `ShaderPass`: monochrome, adjustable amount and size, and seeded so exports are reproducible.
- Optional slight chromatic aberration (off by default).
- Apply the same grain to exports, not only the preview.

### 3.8 Background
- Options: **Transparent**, **Solid color**, **Gradient**, and **Mosaic from photo**.
- Mosaic pipeline (2D canvas, behind the WebGL canvas, composited at export):
  1. Upload a photo.
  2. Apply a strong horizontal motion blur.
  3. Quantize it into an irregular grid of blocks with mixed widths, where each block takes the average color of its area.
  4. Lightly re-blur inside some of the blocks.
  5. Add grain.
- Controls: block size range, irregularity, blur amount and seed (re-roll).

### 3.9 Export
- **PNG**, with transparent or composited background, at 1×, 2× or 4×, or a custom pixel size. Render to an offscreen `WebGLRenderTarget` at the target size rather than upscaling the canvas.
- Aspect ratios: square, 3:2 (matches the reference), 16:9, and custom.
- **Batch export:** pick several icons and render each with identical settings into a zip via fflate. Name the files `<icon>-<weight>-<preset>.png`.
- **Settings as JSON:** copy or download the current settings, and import them back.
- **Share link:** encode the full state in the URL hash, so a link reproduces the exact render.

### 3.10 Brand presets
- A `src/presets/brand.json` file in the repo holds the house angle, material, lighting, grain and background. Anyone can change the brand look in one PR.
- The app loads it as the default state, and a "Reset to brand" button returns to it.

---

## 4. Suggested file structure

```
/
├─ index.html
├─ vite.config.ts            # base: '/<repo>/'
├─ .github/workflows/deploy.yml
├─ src/
│  ├─ main.ts                # boot, state wiring
│  ├─ state.ts               # single typed state object + URL-hash (de)serialize
│  ├─ scene/
│  │  ├─ renderer.ts         # WebGLRenderer, composer, resize
│  │  ├─ camera.ts           # yaw/pitch/roll/perspective → camera transform, orbit
│  │  ├─ environment.ts      # procedural studio env → PMREM
│  │  ├─ materials.ts        # material presets
│  │  └─ grain.ts            # grain ShaderPass
│  ├─ geometry/
│  │  ├─ svgToShapes.ts      # parse, normalize (center, flip Y, scale to unit box)
│  │  ├─ solid.ts
│  │  ├─ tile.ts             # rounded-rect slab + engrave (CSG) / emboss
│  │  └─ stepped.ts          # duotone layers
│  ├─ background/mosaic.ts
│  ├─ export/
│  │  ├─ png.ts              # offscreen render at size, composite bg
│  │  └─ batch.ts            # zip
│  ├─ icons/phosphor.ts      # glob index, search, lazy load
│  ├─ ui/                    # panel, sliders, picker, preset menus
│  └─ presets/brand.json
└─ samples/                  # test SVGs (from this starter)
```

---

## 5. Technical notes and gotchas

- **SVG normalization:**
  - Flip Y, because SVG's y axis points down and three.js's points up.
  - Center the glyph on its bounding box and scale it to a unit box, so depth and bevel values feel the same for every icon.
  - Base the scale on the 256 viewBox, not on the tight bounds. That keeps icons consistently sized relative to each other.
- **Bevels and small holes:** if the bevel size is too large, it overruns thin strokes and small holes and makes self-intersecting geometry. Clamp the bevel to a fraction of the glyph's minimum feature size, or just cap it in the UI and test against `circuitry` and `git-branch`.
- **Normals:** after creating the extrusion, call `computeVertexNormals()` only where it's safe. `ExtrudeGeometry`'s own normals usually give crisper bevel highlights. Compare both.
- **CSG engraving:**
  - Use `three-bvh-csg` `Evaluator` with `SUBTRACTION`. The cutter is the glyph extruded with a small bevel and pushed into the slab face.
  - Cache the result and only recompute when geometry inputs change, not on camera moves.
  - Run it on change with a debounce of about 150 ms.
- **Transparent PNG export:**
  - Use `alpha: true` and `premultipliedAlpha: false` on the renderer, or un-premultiply before encoding.
  - Check for dark fringes on the bevel highlights.
- **Grain on transparent exports:** apply grain only where alpha > 0, or the transparent area fills with noise.
- **Determinism:** the same settings plus the same seed must give the same pixels. That's what keeps a batch of brand icons consistent.
- **Performance:** cap `devicePixelRatio` at 2 for the preview. Keep the environment PMREM cached per lighting preset.
- **Pages base path:** asset URLs must respect `import.meta.env.BASE_URL`.

---

## 6. Phases and acceptance criteria

**Phase 1 — Scaffold and deploy**
- A Vite + TS + three.js project that renders a spinning placeholder cube.
- GitHub Actions deploys it to Pages.
- ✅ Done when the live Pages URL loads.

**Phase 2 — Solid mode and the look**
- SVG → extruded solid with bevel.
- Procedural studio environment, chrome material, camera sliders and presets, grain.
- ✅ Done when `browser-fill.svg` at the Hero preset reads clearly like the reference: bright faces, near-black sides, a crisp bevel highlight.

**Phase 3 — Tile modes**
- Rounded slab with emboss, then CSG engrave.
- ✅ Done when `browser.svg` (regular) engraved in a tile resembles the left icon in the reference, and the holes and grooves are clean for all 8 samples.

**Phase 4 — Picker, export and state**
- Phosphor search and weight picker.
- PNG export (transparent, 1–4×) and batch zip.
- URL-hash state, JSON import/export, and `brand.json` defaults.
- ✅ Done when a share link reproduces the render exactly and the 8 samples export as a zip with identical settings.

**Phase 5 — Background and polish**
- Mosaic background, stepped duotone mode, custom-SVG upload with stroke detection, keyboard shortcuts, and a mobile-friendly panel.
- ✅ Done when a full 3:2 composition with a mosaic background closely resembles the reference image.

---

## 7. Test icons in `samples/`

These 8 icons come in `regular`, `fill` and `duotone` weights: `browser`, `cpu`, `gear-six`, `terminal-window`, `cube`, `circuitry`, `database`, `git-branch`. They're chosen to cover the cases that need testing:

- simple frames (`browser`, `terminal-window`)
- many small holes (`cpu`, `circuitry`)
- curves and teeth (`gear-six`)
- thin strokes (`git-branch`)
- stacked shapes (`database`, `cube`)

Phosphor is MIT-licensed; its license is in `samples/PHOSPHOR-LICENSE`.

---

## 8. Open decisions (defaults assumed)

- **Repo name and URL:** placeholder `metal-icon-studio`. Update `base` in `vite.config.ts` when the repo is created.
- **Brand angle:** the Hero preset. Tune it in Phase 2 and save it to `brand.json`.
- **Custom domain** (for example `tools.monograph.com/…`): optional. Add a `CNAME` file later.
- **Who can access it:** GitHub Pages on a public repo is public. If the tool should stay internal, use a private repo with Pages access control (needs GitHub Enterprise Cloud) or host it elsewhere.

---

## 9. Kickoff prompt for Claude Code

> Read `PLAN.md`. Build Phase 1 and Phase 2 only. Use Vite + TypeScript + three.js 0.186.x. Test with `samples/fill/browser-fill.svg` at the Hero preset. When Phase 2 is running locally, stop and tell me how to view it so I can review the look before we continue.
