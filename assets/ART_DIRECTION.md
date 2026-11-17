# NEON OVERCLOCK — キャラクターアート仕様

制作にはOpenAI内蔵の画像生成ツールを使用。キャラクターと装着パーツはRGBA透過PNGに保存し、戦闘ではアトラスから各セルを描画する。取得アイコンは品目ごとの透過PNGに切り出す。

## 共通テイスト

- オリジナルのサイバーパンク・アニメ調。角のある繊細な線画、セル塗りと金属の描き込みを組み合わせる。
- 黒いテックウェア、アイボリーのセラミック装甲、小さな蛍光イエローのユーティリティ部品を共通素材にする。
- ランナーはシアン、サムライは橙、エンジニアは紫。マゼンタのリムライトを共通にする。
- 成人の自然な体型。キャラごとの髪型、顔、武装、コートのシルエットを固定する。
- 立ち絵は全身・3/4正面、戦闘素材は上から見下ろした視点。文字・ロゴ・背景は入れない。
- 改造は同じ装甲言語で制作し、色だけでなく部品の形と装着位置で区別する。

## 素材一覧

| ファイル | 内容 | 用途 |
| --- | --- | --- |
| `characters/runner.png` | 銀髪・片目バイザー・電磁SMGのARC RUNNER | タイトル、HUD、BODY LAB |
| `characters/samurai.png` | 黒髪に赤いメッシュ・半面マスク・プラズマ刀のHEAT SAMURAI | タイトル、HUD、BODY LAB |
| `characters/summoner.png` | フード・薄紫のボブ・ドローン制御装置のGHOST ENGINEER | タイトル、HUD、BODY LAB |
| `sprites/actors.png` | 3×3の戦闘ユニット9種 | 主人公、敵、ボス、ドローン |
| `sprites/players.png` | 4×3の主人公方向別12フレーム | 3人それぞれ右・下・左・上向き |
| `sprites/augments.png` | 3×2の追加装備6系統 | 改造後の主人公、試着プレビュー |
| `sprites/items/<id>.png` | 改造19種と共用装備4種。それぞれ192×192 | 宝箱・制圧報酬の選択カード、所持HUD、共用装備ショップ |

アクターアトラスは左上から行優先で runner / samurai / summoner / rush / shooter / tank / elite / boss / drone。パーツアトラスは lightning / heat / drone / virus / armor / mobility。

## 生成プロンプトセット（共通仕様と各画像への指示）

### 取得アイコン

Generate a 6-column by 4-row transparent inventory atlas. Center one isolated object per cell. Use hand-inked Japanese sci-fi game art, dark navy metal, ivory highlights, broad areas of bright enamel, and distinct silhouettes readable at HUD scale. Omit labels, frames and grid lines. In row order:

1. Cyan interlocked chain links, forked blue lightning bolt, spiked violet germ, branching magenta circuit, orange tachometer, red finned heat amplifier.
2. Blue U-shaped coolant hose, molten crystal in metal claws, teal thruster, blue heraldic shield, green medical repair crab, lilac robotic assembly arm.
3. Magenta beam emitter, violet satellite dish, crossed pink blades, lavender optical lens, yellow horseshoe magnet, upright yellow battery.
4. Crimson mechanical heart, copper Tesla coil, single orange thermal knife, ivory layered pauldron, blue radiator fan, empty cell.

### 共通仕様

Use case: stylized-concept. Finished original game character assets for NEON OVERCLOCK. Meticulously inked angular Japanese animation key visual, refined cel shading, 2.5D painted metal surfaces, graphic dark shapes, precise adult anatomy, confident cool attitude. Graphite black segmented techwear, ivory ceramic armor, neon circuitry, acid-yellow small utility tabs, subtle magenta rim light. No text, logos, watermark or frames. Genuine transparent background. Entire subject inside frame.

### ARC RUNNER

One original adult female cybernetic street mercenary. Short asymmetric silver-white hair with a single black undercut, pale recognizable face, narrow cyan electronic visor over one eye. Black split jacket with cyan piping, prosthetic forearms, armored boots, compact electromagnetic SMG pointed diagonally down. Full-body three-quarter front standing pose with generous transparent margins; complete hair, weapon, coat and boots. Portrait orientation. This image establishes the reference art direction for every later image.

### HEAT SAMURAI

Use ARC RUNNER only as the exact art-direction reference. A different adult Japanese male cybernetic swordsman. Short black hair with one scarlet streak, serious face above a black half-face respirator, ivory segmented shoulders, black split coat, orange-red heated seams. One orange plasma katana diagonally down and sheath at hip. Full-body three-quarter frontal stance. Same linework, materials and lighting. Transparent background; entire figure and sword fit with margins.

### GHOST ENGINEER

Use ARC RUNNER only as the art-direction reference. A different androgynous adult, slightly dark skin, pale lavender bob beneath a charcoal hood, violet visor, black techwear and ivory shoulders. Compact drone-control backpack with angular folded antenna fins, small holographic interface over an open palm, two matching drones beside the shoulders. Violet circuitry and acid-lime status LEDs. Full-body three-quarter frontal pose. Same rendering and materials, transparent background, all equipment inside frame.

### 戦闘ユニットアトラス

Use all three character portraits as identity and style references. One square production atlas, exactly three equal columns by three equal rows, isolated centered sprites with transparent gutters. Strict top-down orthographic camera for all units; humanoids and weapons face right/east. Row 1: ARC RUNNER with cyan SMG; HEAT SAMURAI with orange katana; GHOST ENGINEER with violet control backpack. Row 2: light corporate assault trooper with red visor/electroblade; corporate gunner with magenta rifle; heavy biped tank mech with orange reactor and twin cannons. Row 3: elite corporate hunter with coat and magenta blades; CERBERUS circular six-limbed black/ivory command mech with three magenta reactors; triangular ivory/black violet support drone. Readable overhead silhouettes, restrained glow, no labels, no shadows outside sprites, no cell overlaps.

### 改造パーツアトラス

Use the ARC RUNNER portrait as the shared material and linework reference. Exactly three columns by two rows of centered cybernetic equipment assemblies, all overhead and aligned for a humanoid facing right. Transparent open centers leave the base character visible beneath. Row 1: cyan induction coils with spinal harness and antenna fins; orange furnace backpack/radiator with twin exhausts; violet drone-control harness with launch arms. Row 2: acid-lime virus injector spine with three canisters and cables; ice-blue ivory heavy armor with hex shield generator; magenta swept wing/blade thruster pair. Shared scale, clear transparent gutters, no figures, no labels or border.

### 主人公の方向別アトラス

Use all three portraits as identity and style references. Exactly four equal columns and three equal rows. Rows: ARC RUNNER, HEAT SAMURAI, GHOST ENGINEER. Columns: east/right, south/front, west/left, north/back. Elevated three-quarter tactical game view, complete figures, same scale, true transparent background. Keep all weapons and glow inside each cell. No labels or grid lines. A refinement pass requested uniform size reduction and centered sprites with generous transparent gutters, preserving all identities and directions.

## 改造の表示規則

`appearance.js` が全19改造を6系統へ割り当てる。同系統1個でTier I、2個でTier II、3個以上でTier III。合計1個／3個／5個で全体の改造段階も上がる。異なる系統は排他的にせず、装備パーツを同時に描く。

新しいランを始めると改造パーツを初期状態へ戻す。BODY LABでの試着は戦闘の所持改造や能力値を変更しない。
