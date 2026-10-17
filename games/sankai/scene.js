// 三界戦棋：戦場の 絵（空・地上・地下の 3 枚の 盤を ななめ上から 見た ところ）と、戦いの 演出。
// canvas 2D だけで 遠近法を 計算して 描く（3D の ライブラリは 使わない）。
(function (root) {
    "use strict";

    const Art = root.SankaiArt;

    // 世界の 座標：X 右、Y 上、Z 手前。1 マス ＝ 1。段の 高さの 差は LAYER_GAP
    const LAYER_GAP = 7.4;
    const SLAB = { 0: 0.9, 1: 0.6, 2: 0 }; // 盤の 厚み（空は 厚みなし）

    function create(canvasEl, E) {
        const ctx = canvasEl.getContext("2d");
        const view = {
            bottomSide: E.SENTE, // 手前に いる 側
            yaw: 0, // 回転（ラジアン）
            pitch: 0.66, // 見下ろす 角度
            focus: "all", // "all" か 段の 番号（その 段を 大きく 見せる）
            width: 0,
            height: 0,
            dpr: 1
        };
        let state = null;
        let highlights = { selected: -1, targets: [], last: [], check: -1, hover: -1 };
        let hitBoxes = [];
        const hidden = new Set(); // 演出中は 盤から 消して 動く 絵で 描く
        const floating = []; // { key, side, promoted, pos: [x,y,z], alpha, angle }
        const effects = [];
        const craters = []; // 爆発の あと（地上・地下）{ world, size, seed }
        let layerAlpha = 1; // 見る 段を しぼったとき、上の 段を うすく する
        let shakeUntil = 0;
        let shakePower = 0;
        const clouds = Array.from({ length: 9 }, (_, i) => ({ x: -6 + ((i * 37) % 13), z: -5 + ((i * 53) % 11), s: 0.9 + ((i * 7) % 5) * 0.2, speed: 0.12 + (i % 3) * 0.05 }));
        // 地面の まだら模様（マスごとに 決まった 色）
        const groundTone = Array.from({ length: 81 }, (_, i) => ((i * 9301 + 49297) % 233280) / 233280);
        // 地下の 岩の つぶ（マスごとに 決まった 位置）
        const pebbles = Array.from({ length: 81 }, (_, i) => [0, 1, 2].map(j => {
            const r = n => (((i * 7919 + j * 104729 + n * 1299709) % 10007) / 10007);
            return { dx: r(1) - 0.5, dz: r(2) - 0.5, s: 0.05 + r(3) * 0.07 };
        }));

        // ---------- 遠近法 ----------
        let cam = null;
        function setupCamera() {
            const yaw = view.yaw + (view.bottomSide === E.SENTE ? 0 : Math.PI);
            const dist = 30;
            const target = [0, 0.4, 0];
            const pos = [
                target[0] + Math.sin(yaw) * Math.cos(view.pitch) * dist,
                target[1] + Math.sin(view.pitch) * dist,
                target[2] + Math.cos(yaw) * Math.cos(view.pitch) * dist
            ];
            const f = norm(sub(target, pos));
            const r = norm(cross(f, [0, 1, 0]));
            const u = cross(r, f);
            const prev = cam;
            cam = { pos, f, r, u, focal: 1, scale: 1, ox: 0, oy: 0 };
            // 3 枚の 盤（focus なら その 段だけ）が ちょうど 入るように 大きさと 位置を 決める
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            (view.focus === "all" ? [0, 1, 2] : [view.focus]).forEach(layer => {
                const y = layerY(layer);
                [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]].forEach(([x, z]) => {
                    [y + (layer === 2 ? 1.6 : 1.3), y - SLAB[layer]].forEach(yy => {
                        const p = rawProject([x, yy, z]);
                        minX = Math.min(minX, p[0]);
                        maxX = Math.max(maxX, p[0]);
                        minY = Math.min(minY, p[1]);
                        maxY = Math.max(maxY, p[1]);
                    });
                });
            });
            const margin = view.focus === "all" ? 10 : 18;
            const scale = Math.min((view.width - margin * 2) / (maxX - minX), (view.height - margin * 2) / (maxY - minY));
            const target2 = { scale, ox: view.width / 2 - ((minX + maxX) / 2) * scale, oy: view.height / 2 - ((minY + maxY) / 2) * scale };
            // 見る 段を 切りかえたときは なめらかに 寄る
            if (prev && prev.goal && view.width === prev.w && view.height === prev.h) {
                const k = 0.2;
                cam.scale = prev.scale + (target2.scale - prev.scale) * k;
                cam.ox = prev.ox + (target2.ox - prev.ox) * k;
                cam.oy = prev.oy + (target2.oy - prev.oy) * k;
            } else {
                Object.assign(cam, target2);
            }
            cam.goal = target2;
            cam.w = view.width;
            cam.h = view.height;
        }

        const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const norm = a => {
            const l = Math.hypot(a[0], a[1], a[2]) || 1;
            return [a[0] / l, a[1] / l, a[2] / l];
        };

        function rawProject(p) {
            const d = sub(p, cam.pos);
            const z = dot(d, cam.f);
            return [dot(d, cam.r) / z, -dot(d, cam.u) / z, z];
        }

        // 世界の 点 → 画面の 点 [x, y, 1 マスの 大きさ（ピクセル）, 奥行き]
        function project(p) {
            const [x, y, z] = rawProject(p);
            return [cam.ox + x * cam.scale, cam.oy + y * cam.scale, cam.scale / z, z];
        }

        // 段の 高さ（地下は 地上の 厚みの ぶん 少し 深く）
        const layerY = layer => (layer === 2 ? LAYER_GAP * 0.92 : layer === 0 ? -LAYER_GAP * 1.08 : 0);
        // マスの 中心（世界の 座標）
        function cellCenter(sq) {
            const x = E.xOf(sq);
            const y = E.yOf(sq);
            return [x - 4, layerY(E.layerOf(sq)), y - 4];
        }

        function cellPolygon(layer, x, y, inset = 0) {
            const h = layerY(layer);
            const a = 0.5 - inset;
            return [[x - 4 - a, h, y - 4 - a], [x - 4 + a, h, y - 4 - a], [x - 4 + a, h, y - 4 + a], [x - 4 - a, h, y - 4 + a]].map(project);
        }

        function fillPoly(points, fill, stroke, width = 1) {
            ctx.beginPath();
            points.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
            ctx.closePath();
            if (fill) {
                ctx.fillStyle = fill;
                ctx.fill();
            }
            if (stroke) {
                ctx.strokeStyle = stroke;
                ctx.lineWidth = width;
                ctx.stroke();
            }
        }

        // ---------- 背景・盤 ----------
        function drawBackground() {
            const g = ctx.createLinearGradient(0, 0, 0, view.height);
            g.addColorStop(0, "#5d8fc9");
            g.addColorStop(0.45, "#a9c9e8");
            g.addColorStop(0.62, "#c8b48a");
            g.addColorStop(1, "#3b2a1e");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, view.width, view.height);
        }

        function drawSlab(layer, now) {
            const h = layerY(layer);
            const t = SLAB[layer];
            const corners = [[-4.5, -4.5], [4.5, -4.5], [4.5, 4.5], [-4.5, 4.5]];
            // 厚みの 側面（見える 面だけ）
            if (t > 0) {
                const sideColor = layer === 1 ? "#6b4f33" : "#3a2a1d";
                for (let i = 0; i < 4; i += 1) {
                    const [x1, z1] = corners[i];
                    const [x2, z2] = corners[(i + 1) % 4];
                    const face = [[x1, h, z1], [x2, h, z2], [x2, h - t, z2], [x1, h - t, z1]].map(project);
                    // 外向きの 面だけ 描く（画面の 上で 時計回りか）
                    const area = (face[1][0] - face[0][0]) * (face[2][1] - face[0][1]) - (face[2][0] - face[0][0]) * (face[1][1] - face[0][1]);
                    if (area < 0) {
                        fillPoly(face, sideColor, "rgba(0,0,0,0.3)");
                        if (layer === 1) {
                            // 地層の しま
                            const mid = [[x1, h - t * 0.35, z1], [x2, h - t * 0.35, z2]].map(project);
                            ctx.beginPath();
                            ctx.moveTo(mid[0][0], mid[0][1]);
                            ctx.lineTo(mid[1][0], mid[1][1]);
                            ctx.strokeStyle = "rgba(255,220,160,0.18)";
                            ctx.lineWidth = 2;
                            ctx.stroke();
                        }
                    }
                }
            }
            // マス
            for (let y = 0; y < 9; y += 1) {
                for (let x = 0; x < 9; x += 1) {
                    const poly = cellPolygon(layer, x, y);
                    fillPoly(poly, cellColor(layer, x, y, now), layer === 2 ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.18)");
                }
            }
            if (layer === 0) {
                drawRocks();
            }
            drawCraters(layer);
            // 本陣（地上の 両はしの まんなか）
            if (layer === 1) {
                [E.SENTE, E.GOTE].forEach(side => {
                    const hq = E.honjinOf(side);
                    const poly = cellPolygon(1, E.xOf(hq), E.yOf(hq), 0.06);
                    fillPoly(poly, null, Art.PALETTE[side].main, 3);
                });
            }
            // 段の 名前
            const label = project([-5.4, h, 0]);
            ctx.font = `bold ${Math.max(11, label[2] * 0.42)}px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
            ctx.textAlign = "center";
            ctx.fillStyle = layer === 2 ? "#ffffff" : "#ffe9c4";
            ctx.strokeStyle = "rgba(0,0,0,0.6)";
            ctx.lineWidth = 3;
            ctx.strokeText(E.LAYER_NAMES[layer], label[0], label[1]);
            ctx.fillText(E.LAYER_NAMES[layer], label[0], label[1]);
        }

        // 地下の 岩肌（つぶと ひび）
        function drawRocks() {
            const h = layerY(0);
            ctx.fillStyle = "rgba(20, 12, 6, 0.45)";
            for (let i = 0; i < 81; i += 1) {
                const x = i % 9 - 4;
                const z = Math.floor(i / 9) - 4;
                pebbles[i].forEach(pb => {
                    const c = project([x + pb.dx * 0.8, h, z + pb.dz * 0.8]);
                    ctx.beginPath();
                    ctx.ellipse(c[0], c[1], c[2] * pb.s, c[2] * pb.s * 0.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                });
            }
        }

        // 爆発の あと（焦げた 穴）。古いものほど うすい
        function drawCraters(layer) {
            craters.forEach((cr, i) => {
                if (cr.layer !== layer) {
                    return;
                }
                const c = project(cr.world);
                const r = c[2] * cr.size;
                const fade = 0.35 + 0.65 * ((i + 1) / craters.length);
                const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r);
                g.addColorStop(0, `rgba(25, 18, 12, ${0.7 * fade})`);
                g.addColorStop(0.6, `rgba(60, 42, 25, ${0.45 * fade})`);
                g.addColorStop(1, "rgba(60, 42, 25, 0)");
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.ellipse(c[0], c[1], r, r * 0.45, 0, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        function addCrater(world, big) {
            const layer = world[1] > LAYER_GAP / 2 ? 2 : world[1] < -LAYER_GAP / 2 ? 0 : 1;
            if (layer === 2) {
                return;
            }
            craters.push({ world: [world[0] + (Math.random() - 0.5) * 0.2, layerY(layer), world[2] + (Math.random() - 0.5) * 0.2], size: big ? 0.62 : 0.42, layer });
            if (craters.length > 28) {
                craters.shift();
            }
        }

        // 本陣の 砦（土のうの 囲いと 旗）。駒より 先に 描く 後ろ半分と、駒の 後に 描く 前半分に わける
        function drawFort(side, front) {
            const hq = E.honjinOf(side);
            const cx = E.xOf(hq) - 4;
            const cz = E.yOf(hq) - 4;
            const bags = [];
            for (let i = 0; i < 16; i += 1) {
                const a = (i / 16) * Math.PI * 2;
                bags.push([cx + Math.cos(a) * 0.5, cz + Math.sin(a) * 0.5]);
            }
            const depthOf = p => rawProject([p[0], 0, p[1]])[2];
            const center = depthOf([cx, cz]);
            bags.filter(b => (depthOf(b) < center) === front)
                .sort((a, b) => depthOf(b) - depthOf(a))
                .forEach(([x, z]) => {
                    const c = project([x, 0.06, z]);
                    const w = c[2] * 0.13;
                    ctx.fillStyle = "#b39a6b";
                    ctx.strokeStyle = "rgba(60, 45, 25, 0.8)";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.ellipse(c[0], c[1], w, w * 0.6, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                });
            if (!front) {
                // 旗（奥の すみ）
                const pole = [[0.42, 0.42], [-0.42, 0.42], [0.42, -0.42], [-0.42, -0.42]]
                    .map(([dx, dz]) => [cx + dx, 0, cz + dz])
                    .sort((p1, p2) => rawProject(p2)[2] - rawProject(p1)[2])[0];
                const a = project(pole);
                const b = project([pole[0], 1.5, pole[2]]);
                ctx.strokeStyle = "#3b2e20";
                ctx.lineWidth = Math.max(1.5, a[2] * 0.03);
                ctx.beginPath();
                ctx.moveTo(a[0], a[1]);
                ctx.lineTo(b[0], b[1]);
                ctx.stroke();
                const wave = Math.sin(performance.now() / 300) * 0.08;
                const f1 = project([pole[0] + 0.55, 1.38 + wave, pole[2]]);
                const f2 = project([pole[0], 1.15, pole[2]]);
                ctx.fillStyle = Art.PALETTE[side].main;
                ctx.beginPath();
                ctx.moveTo(b[0], b[1]);
                ctx.lineTo(f1[0], f1[1]);
                ctx.lineTo(f2[0], f2[1]);
                ctx.closePath();
                ctx.fill();
            }
        }

        // 地下の 駒の まわりの ランプの 明かり
        function drawLanterns() {
            if (!state) {
                return;
            }
            for (let i = 0; i < 81; i += 1) {
                if (state.board[i] !== 0 && !hidden.has(i)) {
                    const c = project(cellCenter(i));
                    const r = c[2] * 1.1;
                    const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r);
                    g.addColorStop(0, "rgba(255, 200, 110, 0.45)");
                    g.addColorStop(1, "rgba(255, 170, 70, 0)");
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.ellipse(c[0], c[1], r, r * 0.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        function cellColor(layer, x, y, now) {
            if (layer === 2) {
                return "rgba(190, 225, 255, 0.28)";
            }
            const tone = groundTone[y * 9 + x];
            if (layer === 0) {
                const l = 18 + tone * 8;
                return `hsl(28, 30%, ${l}%)`;
            }
            // 地上：草地。自陣・敵陣は うっすら 色づける
            let hue = 95 + tone * 12;
            let l = 40 + tone * 8;
            let s = 32;
            if (y <= 2 || y >= 6) {
                s = 26;
                l -= 2;
            }
            if ((x + y) % 2 === 0) {
                l += 2.5;
            }
            void now;
            return `hsl(${hue}, ${s}%, ${l}%)`;
        }

        function drawClouds(now) {
            clouds.forEach(c => {
                const x = ((c.x + now / 1000 * c.speed + 7) % 14) - 7;
                const p = project([x, LAYER_GAP - 0.6, c.z]);
                const r = p[2] * c.s * 0.7;
                ctx.globalAlpha = 0.2 * layerAlpha;
                ctx.fillStyle = "#ffffff";
                [[0, 0, 1], [-0.7, 0.15, 0.7], [0.7, 0.18, 0.75], [0.25, -0.3, 0.65]].forEach(([dx, dy, rr]) => {
                    ctx.beginPath();
                    ctx.ellipse(p[0] + dx * r, p[1] + dy * r * 0.5, r * rr, r * rr * 0.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                });
                ctx.globalAlpha = layerAlpha;
            });
        }

        // 柱（3 枚の 盤の 四すみを むすぶ 線）と、選んだ マスの 上下の つながり
        function drawPillars() {
            ctx.strokeStyle = "rgba(255,255,255,0.22)";
            ctx.lineWidth = 1.5;
            [[-4.5, -4.5], [4.5, -4.5], [4.5, 4.5], [-4.5, 4.5]].forEach(([x, z]) => {
                const a = project([x, layerY(0) - SLAB[0], z]);
                const b = project([x, layerY(2), z]);
                ctx.beginPath();
                ctx.moveTo(a[0], a[1]);
                ctx.lineTo(b[0], b[1]);
                ctx.stroke();
            });
        }

        function drawColumn(sq, color) {
            if (sq < 0) {
                return;
            }
            const x = E.xOf(sq);
            const y = E.yOf(sq);
            ctx.save();
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            const a = project([x - 4, layerY(0), y - 4]);
            const b = project([x - 4, layerY(2), y - 4]);
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
            ctx.stroke();
            ctx.restore();
            [0, 1, 2].forEach(layer => fillPoly(cellPolygon(layer, x, y, 0.02), null, color, 1.5));
        }

        // ---------- 光らせる マス ----------
        function drawHighlights(layer) {
            const inLayer = sq => sq >= 0 && E.layerOf(sq) === layer;
            highlights.last.filter(inLayer).forEach(sq => fillPoly(cellPolygon(layer, E.xOf(sq), E.yOf(sq), 0.04), "rgba(255, 214, 90, 0.38)"));
            if (inLayer(highlights.hover)) {
                fillPoly(cellPolygon(layer, E.xOf(highlights.hover), E.yOf(highlights.hover), 0.04), "rgba(255,255,255,0.22)");
            }
            if (inLayer(highlights.check)) {
                fillPoly(cellPolygon(layer, E.xOf(highlights.check), E.yOf(highlights.check), 0.02), "rgba(255, 40, 40, 0.5)", "#ff3b30", 3);
            }
            if (inLayer(highlights.selected)) {
                fillPoly(cellPolygon(layer, E.xOf(highlights.selected), E.yOf(highlights.selected), 0.02), "rgba(255, 230, 80, 0.45)", "#ffd23f", 3);
            }
            highlights.targets.filter(t => inLayer(t.sq)).forEach(t => {
                const poly = cellPolygon(layer, E.xOf(t.sq), E.yOf(t.sq), 0.12);
                if (t.kind === "capture") {
                    fillPoly(poly, "rgba(255, 70, 50, 0.38)", "#ff5a3c", 2.5);
                } else if (t.kind === "shot") {
                    fillPoly(poly, "rgba(255, 140, 0, 0.3)", "#ff9500", 2.5);
                    const c = project(cellCenter(t.sq));
                    const r = c[2] * 0.28;
                    ctx.strokeStyle = "#ffcc00";
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.ellipse(c[0], c[1], r, r * 0.55, 0, 0, Math.PI * 2);
                    ctx.moveTo(c[0] - r * 1.3, c[1]);
                    ctx.lineTo(c[0] + r * 1.3, c[1]);
                    ctx.moveTo(c[0], c[1] - r * 0.8);
                    ctx.lineTo(c[0], c[1] + r * 0.8);
                    ctx.stroke();
                } else {
                    const c = project(cellCenter(t.sq));
                    ctx.fillStyle = "rgba(120, 255, 140, 0.85)";
                    ctx.beginPath();
                    ctx.ellipse(c[0], c[1], c[2] * 0.14, c[2] * 0.08, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        }

        // ---------- 駒 ----------
        function drawPieceAt(info, world, alpha = 1, angle = 0, record = -1, chute = false) {
            const base = project(world);
            const size = base[2] * 1.15;
            const img = Art.piece(info.key, info.side, info.promoted);
            ctx.save();
            ctx.globalAlpha = alpha * layerAlpha;
            // 影
            if (E.isAir(info.kind) === false || world[1] < LAYER_GAP - 0.5) {
                ctx.fillStyle = "rgba(0,0,0,0.28)";
                ctx.beginPath();
                ctx.ellipse(base[0], base[1], size * 0.34, size * 0.12, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            // 台座（チームの 色）
            ctx.strokeStyle = Art.PALETTE[info.side].main;
            ctx.lineWidth = Math.max(1.5, size * 0.035);
            ctx.beginPath();
            ctx.ellipse(base[0], base[1], size * 0.38, size * 0.14, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.translate(base[0], base[1] - size * 0.08);
            if (angle) {
                ctx.rotate(angle);
            }
            ctx.drawImage(img, -size / 2, -size * 0.92, size, size);
            if (chute) {
                // 落下傘（援軍が 空から 降りてくる）
                const top = -size * 1.75;
                ctx.strokeStyle = "rgba(240, 240, 240, 0.85)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                [-0.42, 0, 0.42].forEach(dx => {
                    ctx.moveTo(dx * size, top + size * 0.05);
                    ctx.lineTo(0, -size * 0.62);
                });
                ctx.stroke();
                ctx.fillStyle = info.side === E.SENTE ? "#dfe9ff" : "#ffe1dc";
                ctx.beginPath();
                ctx.ellipse(0, top + size * 0.05, size * 0.48, size * 0.3, 0, Math.PI, 0);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = Art.PALETTE[info.side].main;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            ctx.restore();
            // 名前の 札
            if (alpha > 0.6 && !chute && layerAlpha > 0.5) {
                const fs = Math.max(9, size * 0.2);
                ctx.font = `bold ${fs}px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
                ctx.textAlign = "center";
                const w = fs * 1.35;
                const lx = base[0] + size * 0.36;
                const ly = base[1] - size * 0.05;
                ctx.fillStyle = info.side === E.SENTE ? "rgba(30, 64, 140, 0.92)" : "rgba(150, 30, 24, 0.92)";
                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(lx - w / 2, ly - fs * 0.85, w, fs * 1.15, fs * 0.25) : ctx.rect(lx - w / 2, ly - fs * 0.85, w, fs * 1.15);
                ctx.fill();
                ctx.fillStyle = info.promoted ? "#ffd84d" : "#ffffff";
                ctx.fillText(info.short, lx, ly + fs * 0.12);
            }
            if (record >= 0) {
                hitBoxes.push({ sq: record, x: base[0] - size * 0.42, y: base[1] - size * 1.0, w: size * 0.84, h: size * 1.05 });
            }
        }

        function drawLayerPieces(layer) {
            if (!state) {
                return;
            }
            const items = [];
            for (let y = 0; y < 9; y += 1) {
                for (let x = 0; x < 9; x += 1) {
                    const sq = E.idx(layer, x, y);
                    const p = state.board[sq];
                    if (p !== 0 && !hidden.has(sq)) {
                        const c = cellCenter(sq);
                        if (layer === 2) {
                            c[1] += 0.55; // 飛行機は 少し 浮かせる
                        }
                        items.push({ sq, info: E.pieceInfo(p), world: c, depth: rawProject(c)[2] });
                    }
                }
            }
            // 落下傘で 降りる 駒の 影（どこに 降りるか 分かるように）
            floating.filter(f => f.layer === layer && f.chute).forEach(f => {
                const c = project([f.pos[0], layerY(layer), f.pos[2]]);
                ctx.fillStyle = "rgba(0,0,0,0.3)";
                ctx.beginPath();
                ctx.ellipse(c[0], c[1], c[2] * 0.3, c[2] * 0.11, 0, 0, Math.PI * 2);
                ctx.fill();
            });
            floating.filter(f => f.layer === layer).forEach(f => items.push({ sq: -1, info: f.info, world: f.pos, depth: rawProject(f.pos)[2], alpha: f.alpha, angle: f.angle, chute: f.chute }));
            items.sort((a, b) => b.depth - a.depth);
            if (layer === 0) {
                drawLanterns();
            }
            if (layer === 1) {
                drawFort(E.SENTE, false);
                drawFort(E.GOTE, false);
            }
            items.forEach(item => drawPieceAt(item.info, item.world, item.alpha === undefined ? 1 : item.alpha, item.angle || 0, item.sq, Boolean(item.chute)));
            if (layer === 1) {
                drawFort(E.SENTE, true);
                drawFort(E.GOTE, true);
            }
        }

        // 飛行機の 影を 地上に 落とす（どの マスの 上に いるかが 分かる）
        function drawAirShadows() {
            if (!state) {
                return;
            }
            for (let y = 0; y < 9; y += 1) {
                for (let x = 0; x < 9; x += 1) {
                    const sq = E.idx(2, x, y);
                    if (state.board[sq] !== 0 && !hidden.has(sq)) {
                        const c = project([x - 4, 0, y - 4]);
                        ctx.fillStyle = "rgba(0,0,0,0.22)";
                        ctx.beginPath();
                        ctx.ellipse(c[0], c[1], c[2] * 0.36, c[2] * 0.14, 0, 0, Math.PI * 2);
                        ctx.fill();
                        // 爆撃機は 照準の 輪
                        if (E.kindOf(state.board[sq]) === E.BMB) {
                            ctx.strokeStyle = E.sideOf(state.board[sq]) === E.SENTE ? "rgba(90,150,255,0.6)" : "rgba(255,90,80,0.6)";
                            ctx.setLineDash([3, 3]);
                            ctx.lineWidth = 1.2;
                            ctx.beginPath();
                            ctx.ellipse(c[0], c[1], c[2] * 0.44, c[2] * 0.2, 0, 0, Math.PI * 2);
                            ctx.stroke();
                            ctx.setLineDash([]);
                        }
                    }
                }
            }
        }

        // ---------- 演出 ----------
        function addEffect(effect) {
            return new Promise(resolve => {
                effect.start = performance.now();
                effect.resolve = resolve;
                effects.push(effect);
            });
        }

        function particles(count, make) {
            return Array.from({ length: count }, (_, i) => make(i));
        }

        // 爆発（world の 位置。big で 大きく）
        function explosion(world, big = false) {
            const n = big ? 34 : 20;
            const parts = particles(n, i => {
                const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
                const sp = (big ? 2.2 : 1.4) * (0.4 + Math.random());
                return { vx: Math.cos(a) * sp, vy: 1 + Math.random() * (big ? 2.5 : 1.6), vz: Math.sin(a) * sp * 0.6, color: ["#fff3b0", "#ffb347", "#ff6a2a", "#c0392b"][i % 4], size: 0.08 + Math.random() * 0.1 };
            });
            const smoke = particles(big ? 10 : 6, () => ({ dx: (Math.random() - 0.5) * 0.8, dz: (Math.random() - 0.5) * 0.8, rise: 0.8 + Math.random() * 1.2, size: 0.35 + Math.random() * 0.35 }));
            if (big) {
                shake(9, 420);
            }
            addCrater(world, big);
            return addEffect({
                duration: big ? 1300 : 950,
                draw(t) {
                    const k = t / this.duration;
                    // 衝撃波の 輪（地面に 広がる）
                    if (big && k < 0.6) {
                        const c = project(world);
                        const r = c[2] * (0.3 + k * 3.2);
                        ctx.strokeStyle = `rgba(255, 240, 200, ${0.7 * (1 - k / 0.6)})`;
                        ctx.lineWidth = Math.max(1, c[2] * 0.08 * (1 - k));
                        ctx.beginPath();
                        ctx.ellipse(c[0], c[1], r, r * 0.42, 0, 0, Math.PI * 2);
                        ctx.stroke();
                    }
                    // 光
                    if (k < 0.25) {
                        const c = project(world);
                        const r = c[2] * (big ? 1.4 : 0.9) * (0.4 + k * 3);
                        const g = ctx.createRadialGradient(c[0], c[1] - r * 0.3, 0, c[0], c[1] - r * 0.3, r);
                        g.addColorStop(0, `rgba(255,255,220,${1 - k * 4})`);
                        g.addColorStop(1, "rgba(255,150,40,0)");
                        ctx.fillStyle = g;
                        ctx.beginPath();
                        ctx.arc(c[0], c[1] - r * 0.3, r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    // けむり
                    smoke.forEach(s => {
                        const c = project([world[0] + s.dx * k, world[1] + s.rise * k * 1.4, world[2] + s.dz * k]);
                        const r = c[2] * s.size * (0.6 + k);
                        ctx.fillStyle = `rgba(60,55,50,${0.55 * (1 - k)})`;
                        ctx.beginPath();
                        ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
                        ctx.fill();
                    });
                    // 火の粉
                    parts.forEach(p => {
                        const tt = k * 1.1;
                        const c = project([world[0] + p.vx * tt, world[1] + p.vy * tt - 2.4 * tt * tt, world[2] + p.vz * tt]);
                        ctx.fillStyle = p.color;
                        ctx.globalAlpha = Math.max(0, 1 - k * 1.2);
                        ctx.beginPath();
                        ctx.arc(c[0], c[1], c[2] * p.size, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalAlpha = 1;
                    });
                }
            });
        }

        // 砲弾（放物線）
        function shell(from, to, height = 2.2, duration = 650) {
            return addEffect({
                duration,
                draw(t) {
                    const k = Math.min(1, t / duration);
                    if (k < 0.18) {
                        // 砲口の 光
                        const c = project(from);
                        const r = c[2] * 0.5 * (1 - k / 0.18);
                        const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r);
                        g.addColorStop(0, "rgba(255, 250, 210, 0.95)");
                        g.addColorStop(1, "rgba(255, 160, 40, 0)");
                        ctx.fillStyle = g;
                        ctx.beginPath();
                        ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    const trail = [];
                    for (let i = 0; i < 8; i += 1) {
                        const kk = Math.max(0, k - i * 0.03);
                        trail.push(project([from[0] + (to[0] - from[0]) * kk, from[1] + (to[1] - from[1]) * kk + Math.sin(kk * Math.PI) * height, from[2] + (to[2] - from[2]) * kk]));
                    }
                    trail.forEach((c, i) => {
                        ctx.fillStyle = i === 0 ? "#fff6c8" : `rgba(255,200,120,${0.5 - i * 0.06})`;
                        ctx.beginPath();
                        ctx.arc(c[0], c[1], c[2] * (i === 0 ? 0.09 : 0.06), 0, Math.PI * 2);
                        ctx.fill();
                    });
                }
            });
        }

        // 対空砲の 弾（下から 上へ 何本も）
        function tracers(from, to, duration = 520) {
            const bursts = particles(7, i => ({ delay: i * 55, jitter: [(Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5] }));
            return addEffect({
                duration,
                draw(t) {
                    bursts.forEach(b => {
                        const k = (t - b.delay) / 260;
                        if (k < 0 || k > 1) {
                            return;
                        }
                        const p1 = project([from[0] + (to[0] + b.jitter[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] + b.jitter[1] - from[2]) * k]);
                        const k0 = Math.max(0, k - 0.12);
                        const p0 = project([from[0] + (to[0] + b.jitter[0] - from[0]) * k0, from[1] + (to[1] - from[1]) * k0, from[2] + (to[2] + b.jitter[1] - from[2]) * k0]);
                        ctx.strokeStyle = "#ffe066";
                        ctx.lineWidth = 2.5;
                        ctx.beginPath();
                        ctx.moveTo(p0[0], p0[1]);
                        ctx.lineTo(p1[0], p1[1]);
                        ctx.stroke();
                    });
                }
            });
        }

        // 爆弾（真下へ 落ちる）
        function bomb(from, to, duration = 720) {
            return addEffect({
                duration,
                draw(t) {
                    const k = Math.min(1, t / duration);
                    const kk = k * k;
                    const c = project([from[0], from[1] + (to[1] - from[1]) * kk, from[2]]);
                    const w = c[2] * 0.11;
                    ctx.fillStyle = "#2b2f33";
                    ctx.beginPath();
                    ctx.ellipse(c[0], c[1], w, w * 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // 尾の 羽根
                    ctx.beginPath();
                    ctx.moveTo(c[0] - w * 1.3, c[1] - w * 2.6);
                    ctx.lineTo(c[0] + w * 1.3, c[1] - w * 2.6);
                    ctx.lineTo(c[0], c[1] - w * 1.4);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = "rgba(255,255,255,0.35)";
                    ctx.beginPath();
                    ctx.ellipse(c[0] - w * 0.35, c[1] - w * 0.4, w * 0.25, w * 0.8, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = "rgba(255,255,255,0.4)";
                    ctx.lineWidth = 1;
                    const top = project([from[0], from[1] + (to[1] - from[1]) * Math.max(0, kk - 0.15), from[2]]);
                    ctx.beginPath();
                    ctx.moveTo(top[0], top[1]);
                    ctx.lineTo(c[0], c[1]);
                    ctx.stroke();
                }
            });
        }

        // 土けむり（工兵が 地面から 出る・援軍が 降りる）
        function dust(world, duration = 700) {
            const puffs = particles(12, i => ({ a: (i / 12) * Math.PI * 2, s: 0.25 + Math.random() * 0.2 }));
            return addEffect({
                duration,
                draw(t) {
                    const k = t / duration;
                    puffs.forEach(p => {
                        const c = project([world[0] + Math.cos(p.a) * 0.6 * k, world[1] + 0.2 * k, world[2] + Math.sin(p.a) * 0.6 * k]);
                        ctx.fillStyle = `rgba(150,120,85,${0.6 * (1 - k)})`;
                        ctx.beginPath();
                        ctx.arc(c[0], c[1], c[2] * p.s * (0.5 + k), 0, Math.PI * 2);
                        ctx.fill();
                    });
                }
            });
        }

        // 絵を 動かす（from → to を duration で。path で 曲げられる）
        function tween(info, layer, from, to, duration, opts = {}) {
            const f = { info, layer, pos: from.slice(), alpha: opts.alphaFrom === undefined ? 1 : opts.alphaFrom, angle: 0, chute: Boolean(opts.chute) };
            floating.push(f);
            return addEffect({
                duration,
                draw(t) {
                    const k = Math.min(1, t / duration);
                    const e = opts.linear ? k : k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
                    f.pos = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e + (opts.hop ? Math.sin(e * Math.PI) * opts.hop : 0), from[2] + (to[2] - from[2]) * e];
                    if (opts.alphaTo !== undefined) {
                        f.alpha = (opts.alphaFrom === undefined ? 1 : opts.alphaFrom) + (opts.alphaTo - (opts.alphaFrom === undefined ? 1 : opts.alphaFrom)) * k;
                    }
                    if (opts.spin) {
                        f.angle = opts.spin * k;
                    }
                },
                done() {
                    floating.splice(floating.indexOf(f), 1);
                }
            });
        }

        function shake(power, duration) {
            shakePower = power;
            shakeUntil = performance.now() + duration;
        }

        // 1 手を 演出つきで 見せる（before の 局面から after の 局面へ）
        async function playMove(move, before, after) {
            const mover = move.kind === "drop" ? null : before.board[move.from];
            const target = move.kind === "drop" ? 0 : before.board[move.to];
            const toWorld = cellCenter(move.to);
            const lift = sq => (E.layerOf(sq) === 2 ? 0.55 : 0);
            state = before;
            if (move.kind === "drop") {
                const info = E.pieceInfo(move.piece * before.turn);
                const layer = E.layerOf(move.to);
                hidden.add(move.to);
                state = after;
                const end = [toWorld[0], toWorld[1] + lift(move.to), toWorld[2]];
                if (layer === 2) {
                    // 自陣の 後ろから 飛んでくる
                    const from = [end[0], end[1] + 0.3, end[2] + 6 * before.turn];
                    await tween(info, layer, from, end, 700, { alphaFrom: 0, alphaTo: 1 });
                } else if (layer === 0) {
                    const from = [end[0], end[1] - 0.8, end[2]];
                    await tween(info, layer, from, end, 520, { alphaFrom: 0, alphaTo: 1 });
                } else {
                    const from = [end[0] + 0.4, end[1] + 4.2, end[2]];
                    await tween(info, layer, from, end, 1000, { alphaFrom: 0.6, alphaTo: 1, chute: true, linear: true });
                }
                hidden.delete(move.to);
                dust(toWorld);
                return;
            }
            if (move.kind === "shot") {
                const kind = E.kindOf(mover);
                const fromWorld = cellCenter(move.from);
                const victim = E.pieceInfo(target);
                if (kind === E.ART) {
                    await shell([fromWorld[0], fromWorld[1] + 0.5, fromWorld[2]], toWorld, 2.4, 700);
                    hidden.add(move.to);
                    explosion(toWorld, false);
                } else if (kind === E.AA) {
                    const skyTarget = [toWorld[0], toWorld[1] + 0.6, toWorld[2]];
                    await tracers([fromWorld[0], fromWorld[1] + 0.8, fromWorld[2]], skyTarget);
                    hidden.add(move.to);
                    explosion(skyTarget, false);
                    // 撃ち落とされた 機体が 落ちていく
                    tween(victim, 1, skyTarget, [skyTarget[0] + 0.8, 0.2, skyTarget[2] + 0.4], 900, { alphaTo: 0, spin: 1.6 });
                } else {
                    const from = [fromWorld[0], fromWorld[1] + 0.4, fromWorld[2]];
                    await bomb(from, toWorld);
                    hidden.add(move.to);
                    explosion(toWorld, true);
                }
                await sleep(420);
                state = after;
                hidden.delete(move.to);
                return;
            }
            // ふつうの 移動（取る ときは 着いた ところで 爆発）
            const info = E.pieceInfo(mover);
            const fromWorld = cellCenter(move.from);
            fromWorld[1] += lift(move.from);
            const end = [toWorld[0], toWorld[1] + lift(move.to), toWorld[2]];
            hidden.add(move.from);
            const vertical = E.xOf(move.from) === E.xOf(move.to) && E.yOf(move.from) === E.yOf(move.to);
            const jump = E.kindOf(mover) === E.CAV;
            await tween(info, Math.max(E.layerOf(move.from), E.layerOf(move.to)), fromWorld, end, vertical ? 620 : jump ? 520 : 420, { hop: jump ? 1 : 0 });
            if (target !== 0) {
                hidden.add(move.to);
                explosion(toWorld, E.layerOf(move.from) === 0);
            }
            if (vertical && E.layerOf(move.to) === 1) {
                dust(toWorld);
            }
            state = after;
            hidden.delete(move.from);
            hidden.delete(move.to);
            if (target !== 0) {
                await sleep(300);
            }
        }

        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

        // ---------- 描く ----------
        function render(now) {
            setupCamera();
            ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
            drawBackground();
            if (now < shakeUntil) {
                const k = (shakeUntil - now) / 400;
                ctx.translate((Math.random() - 0.5) * shakePower * k, (Math.random() - 0.5) * shakePower * k);
            }
            hitBoxes = [];
            drawPillars();
            const fade = layer => {
                layerAlpha = view.focus !== "all" && layer > view.focus ? 0.28 : 1;
                ctx.globalAlpha = layerAlpha;
            };
            fade(0);
            drawSlab(0, now);
            drawHighlights(0);
            drawLayerPieces(0);
            fade(1);
            drawSlab(1, now);
            drawHighlights(1);
            drawAirShadows();
            drawLayerPieces(1);
            fade(2);
            drawSlab(2, now);
            drawClouds(now);
            drawHighlights(2);
            drawLayerPieces(2);
            layerAlpha = 1;
            ctx.globalAlpha = 1;
            if (highlights.selected >= 0) {
                drawColumn(highlights.selected, "rgba(255, 220, 80, 0.85)");
            }
            for (let i = effects.length - 1; i >= 0; i -= 1) {
                const effect = effects[i];
                const t = now - effect.start;
                if (t >= effect.duration) {
                    effects.splice(i, 1);
                    if (effect.done) {
                        effect.done();
                    }
                    effect.resolve();
                    continue;
                }
                effect.draw(t);
            }
        }

        let running = false;
        function loop(now) {
            if (!document.hidden) {
                render(now);
            }
            if (running) {
                requestAnimationFrame(loop);
            }
        }

        function resize() {
            const rect = canvasEl.getBoundingClientRect();
            view.dpr = Math.min(2, window.devicePixelRatio || 1);
            view.width = rect.width;
            view.height = rect.height;
            canvasEl.width = Math.round(rect.width * view.dpr);
            canvasEl.height = Math.round(rect.height * view.dpr);
        }

        // 画面の 点 → マスの 番号（−1 は なし）。駒の 絵を 先に、次に マスを 調べる
        // preferred：行き先として 光っている マス（駒の 絵に 隠れていても こちらを 優先する）
        function pick(px, py, preferred = []) {
            for (const sq of preferred) {
                if (inside(cellPolygon(E.layerOf(sq), E.xOf(sq), E.yOf(sq)), px, py)) {
                    return sq;
                }
            }
            for (let i = hitBoxes.length - 1; i >= 0; i -= 1) {
                const b = hitBoxes[i];
                if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
                    return b.sq;
                }
            }
            for (const layer of [2, 1, 0]) {
                for (let y = 0; y < 9; y += 1) {
                    for (let x = 0; x < 9; x += 1) {
                        if (inside(cellPolygon(layer, x, y), px, py)) {
                            return E.idx(layer, x, y);
                        }
                    }
                }
            }
            return -1;
        }

        function inside(poly, px, py) {
            let hit = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
                const [xi, yi] = poly[i];
                const [xj, yj] = poly[j];
                if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
                    hit = !hit;
                }
            }
            return hit;
        }

        resize();
        window.addEventListener("resize", resize);
        running = true;
        requestAnimationFrame(loop);

        return {
            setState(next) {
                // 待った・新しい 対局では 爆発の あとも 消す
                if (!next || !state || next.ply < state.ply) {
                    craters.length = 0;
                }
                state = next;
            },
            setHighlights(next) {
                highlights = Object.assign({ selected: -1, targets: [], last: [], check: -1, hover: -1 }, next);
            },
            setView(next) {
                Object.assign(view, next);
            },
            get view() {
                return view;
            },
            pick,
            // マスの 中心の 画面の 位置（テストや 説明に 使う）
            screenOf(sq) {
                const p = project(cellCenter(sq));
                return [p[0], p[1]];
            },
            playMove,
            explosion: (sq, big) => explosion(cellCenter(sq), big),
            resize,
            renderOnce: () => render(performance.now())
        };
    }

    root.SankaiScene = { create };
})(typeof window !== "undefined" ? window : globalThis);
