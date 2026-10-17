// 三界戦棋：駒の 絵（兵士・戦車・飛行機…）を その場で 描く。画像ファイルは 使わない。
// 絵は 128×128 の canvas に 描いて とっておき、盤の 上で 大きさを 変えて 使う。
// 先手は 青、後手は 赤。先手の 駒は 右を、後手の 駒は 左を 向く（画面の 上で 向かい合う）。
(function (root) {
    "use strict";

    const SIZE = 128;
    const PALETTE = {
        1: { main: "#3f6db3", dark: "#243f6e", light: "#7fa6e6", uniform: "#4d6f8f", vehicle: "#4b6a86", mark: "#dbe8ff" },
        "-1": { main: "#c0453a", dark: "#6e231d", light: "#ee8a7f", uniform: "#8a5a4a", vehicle: "#8c5647", mark: "#ffe2dc" }
    };
    const SKIN = "#e8c39e";
    const METAL = "#5d636b";
    const METAL_DARK = "#33373d";
    const GOLD = "#f2c94c";

    const cache = new Map();

    function canvas(w = SIZE, h = SIZE) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return c;
    }

    function ellipse(ctx, x, y, rx, ry, fill) {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
    }

    function roundRect(ctx, x, y, w, h, r, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.stroke();
        }
    }

    function poly(ctx, points, fill, stroke, width = 2) {
        ctx.beginPath();
        points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        if (stroke) {
            ctx.lineWidth = width;
            ctx.strokeStyle = stroke;
            ctx.stroke();
        }
    }

    function line(ctx, x1, y1, x2, y2, color, width) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.stroke();
    }

    function shade(ctx, x, y, w, h, top, bottom) {
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, top);
        g.addColorStop(1, bottom);
        return g;
    }

    function star(ctx, x, y, r, fill) {
        ctx.beginPath();
        for (let i = 0; i < 10; i += 1) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const rr = i % 2 === 0 ? r : r * 0.45;
            ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
    }

    // ---------- 人 ----------
    // 立っている 兵士（右向き）。hat は "helmet" / "cap" / "hardhat"
    function soldier(ctx, p, { hat = "helmet", x = 64, scale = 1, gear = "rifle", elite = false } = {}) {
        ctx.save();
        ctx.translate(x, 0);
        ctx.scale(scale, scale);
        ctx.translate(-64, 0);
        // 足
        poly(ctx, [[54, 92], [62, 92], [60, 118], [52, 118]], p.dark);
        poly(ctx, [[66, 92], [74, 92], [78, 118], [70, 118]], p.dark);
        roundRect(ctx, 49, 115, 13, 6, 2, "#2a2420");
        roundRect(ctx, 68, 115, 13, 6, 2, "#2a2420");
        // 胴
        poly(ctx, [[50, 58], [78, 58], [80, 94], [48, 94]], shade(ctx, 48, 58, 32, 36, p.uniform, p.dark), "rgba(0,0,0,0.35)", 1.5);
        line(ctx, 49, 82, 79, 82, "#3a2f24", 4); // ベルト
        // 腕
        line(ctx, 52, 62, 46, 84, p.uniform, 7);
        // 首と 顔
        ellipse(ctx, 64, 47, 10, 11, SKIN);
        ellipse(ctx, 69, 46, 1.6, 1.6, "#2b2b2b");
        // 帽子
        if (hat === "helmet") {
            ctx.beginPath();
            ctx.arc(64, 42, 13, Math.PI, 0);
            ctx.fillStyle = p.dark;
            ctx.fill();
            roundRect(ctx, 49, 40, 30, 4, 2, p.dark);
        } else if (hat === "cap") {
            roundRect(ctx, 53, 31, 22, 9, 3, p.dark);
            roundRect(ctx, 52, 38, 26, 4, 2, "#1f1f1f");
            roundRect(ctx, 70, 39, 12, 3, 1.5, "#1f1f1f");
            star(ctx, 64, 35, 3.5, GOLD);
        } else if (hat === "hardhat") {
            ctx.beginPath();
            ctx.arc(64, 42, 13, Math.PI, 0);
            ctx.fillStyle = "#e0b23c";
            ctx.fill();
            roundRect(ctx, 48, 40, 32, 4, 2, "#c99a2a");
            ellipse(ctx, 70, 34, 3, 3, "#fff6c2"); // ランプ
        }
        // 持ち物
        if (gear === "rifle") {
            line(ctx, 58, 88, 92, 54, "#5a3b22", 4);
            line(ctx, 80, 66, 97, 49, METAL_DARK, 3);
            if (elite) {
                line(ctx, 96, 50, 104, 42, "#d7dde4", 2); // 銃剣
            }
            line(ctx, 76, 62, 82, 74, p.uniform, 7);
        } else if (gear === "pick") {
            line(ctx, 60, 90, 90, 52, "#7a5230", 4);
            ctx.beginPath();
            ctx.moveTo(78, 46);
            ctx.quadraticCurveTo(92, 44, 102, 58);
            ctx.lineWidth = 5;
            ctx.strokeStyle = METAL;
            ctx.stroke();
            line(ctx, 76, 62, 82, 74, p.uniform, 7);
        } else if (gear === "flag") {
            line(ctx, 88, 18, 88, 118, "#6b4a2a", 3);
            poly(ctx, [[89, 19], [118, 26], [89, 34]], p.main, p.dark, 1.5);
            star(ctx, 100, 26, 4, "#fff");
            line(ctx, 76, 62, 88, 70, p.uniform, 7);
        }
        // 肩の しるし（精鋭・司令官）
        if (elite) {
            poly(ctx, [[56, 62], [64, 57], [72, 62], [72, 66], [64, 61], [56, 66]], GOLD);
        }
        ctx.restore();
    }

    // ---------- 乗り物 ----------
    function tracks(ctx, x, y, w, h) {
        roundRect(ctx, x, y, w, h, h / 2, "#2b2d30");
        for (let i = 0; i < 5; i += 1) {
            ellipse(ctx, x + h / 2 + (i * (w - h)) / 4, y + h / 2, h * 0.32, h * 0.32, "#6b7077");
            ellipse(ctx, x + h / 2 + (i * (w - h)) / 4, y + h / 2, h * 0.12, h * 0.12, "#2b2d30");
        }
    }

    function tank(ctx, p, heavy) {
        tracks(ctx, 14, 86, 100, 22);
        // 車体
        poly(ctx, [[12, 88], [20, 70], [104, 70], [116, 88]], shade(ctx, 12, 70, 104, 18, p.light, p.vehicle), "rgba(0,0,0,0.4)", 1.5);
        // 砲塔
        poly(ctx, [[38, 70], [44, 50], [84, 50], [92, 70]], shade(ctx, 38, 50, 54, 20, p.light, p.vehicle), "rgba(0,0,0,0.4)", 1.5);
        // 砲身（右＝前）
        roundRect(ctx, 84, 55, heavy ? 44 : 36, heavy ? 8 : 6, 2, METAL_DARK);
        if (heavy) {
            roundRect(ctx, 120, 53, 8, 12, 2, METAL_DARK);
            roundRect(ctx, 22, 74, 16, 10, 2, p.dark); // 追加装甲
        }
        // 国の しるし
        ellipse(ctx, 64, 60, 6, 6, p.mark);
        ellipse(ctx, 64, 60, 3.5, 3.5, p.main);
        roundRect(ctx, 54, 44, 14, 6, 2, p.dark); // ハッチ
    }

    function horse(ctx, p, dragoon) {
        // 体
        ellipse(ctx, 60, 82, 30, 13, "#6b4a2f");
        // 脚
        [[38, 90], [48, 92], [70, 92], [82, 90]].forEach(([x, y], i) => line(ctx, x, y, x + (i % 2 ? 3 : -3), 118, "#5a3d26", 5));
        // 首と 頭（右）
        poly(ctx, [[80, 76], [94, 52], [104, 54], [92, 82]], "#6b4a2f");
        poly(ctx, [[96, 50], [116, 60], [112, 67], [94, 60]], "#6b4a2f");
        ellipse(ctx, 104, 56, 1.8, 1.8, "#111");
        line(ctx, 94, 52, 86, 70, "#2a1d12", 4); // たてがみ
        // しっぽ
        ctx.beginPath();
        ctx.moveTo(31, 78);
        ctx.quadraticCurveTo(18, 86, 22, 104);
        ctx.lineWidth = 5;
        ctx.strokeStyle = "#2a1d12";
        ctx.stroke();
        // 鞍
        roundRect(ctx, 50, 68, 20, 8, 3, p.main);
        // 乗り手
        poly(ctx, [[54, 48], [70, 48], [72, 72], [52, 72]], shade(ctx, 52, 48, 20, 24, p.uniform, p.dark));
        ellipse(ctx, 62, 40, 8, 9, SKIN);
        ctx.beginPath();
        ctx.arc(62, 36, 10, Math.PI, 0);
        ctx.fillStyle = p.dark;
        ctx.fill();
        if (dragoon) {
            line(ctx, 62, 26, 62, 18, GOLD, 3); // 兜の 飾り
        }
        // 槍（前へ）
        line(ctx, 52, 70, 120, 34, "#7a5230", 3);
        poly(ctx, [[117, 32], [126, 28], [121, 37]], "#d7dde4");
        poly(ctx, [[100, 44], [110, 38], [104, 50]], p.main); // 旗
    }

    function wheel(ctx, x, y, r) {
        ellipse(ctx, x, y, r, r, "#3b2a1c");
        ellipse(ctx, x, y, r * 0.75, r * 0.75, "#7a5a3a");
        for (let i = 0; i < 6; i += 1) {
            const a = (i * Math.PI) / 3;
            line(ctx, x, y, x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, "#3b2a1c", 2);
        }
        ellipse(ctx, x, y, r * 0.2, r * 0.2, METAL_DARK);
    }

    function cannon(ctx, p, heavy) {
        // 脚（後ろ）
        poly(ctx, [[20, 110], [56, 86], [62, 92], [28, 116]], "#5a4030");
        // 防盾
        poly(ctx, [[54, 62], [70, 58], [72, 94], [56, 96]], shade(ctx, 54, 58, 18, 38, p.light, p.vehicle), "rgba(0,0,0,0.35)", 1.5);
        // 砲身（右上へ）
        ctx.save();
        ctx.translate(64, 78);
        ctx.rotate(-0.42);
        roundRect(ctx, -8, -6, heavy ? 66 : 56, heavy ? 14 : 11, 4, shade(ctx, 0, -6, 10, 12, "#7d848c", METAL_DARK));
        roundRect(ctx, heavy ? 54 : 44, -8, 8, heavy ? 18 : 15, 2, METAL_DARK);
        ctx.restore();
        wheel(ctx, 64, 98, 16);
        ellipse(ctx, 62, 72, 4, 4, p.mark);
    }

    function aaGun(ctx, p) {
        // 土のう
        for (let i = 0; i < 6; i += 1) {
            roundRect(ctx, 14 + i * 17, 100, 18, 12, 5, i % 2 ? "#a8936a" : "#b9a479", "rgba(0,0,0,0.25)");
        }
        for (let i = 0; i < 5; i += 1) {
            roundRect(ctx, 22 + i * 17, 90, 18, 12, 5, i % 2 ? "#b9a479" : "#a8936a", "rgba(0,0,0,0.25)");
        }
        // 台
        poly(ctx, [[40, 92], [48, 72], [80, 72], [88, 92]], shade(ctx, 40, 72, 48, 20, p.light, p.vehicle));
        // 2 本の 砲身（右上へ 高く）
        [[-4, 0], [6, 4]].forEach(([dx, dy]) => {
            ctx.save();
            ctx.translate(64 + dx, 72 + dy);
            ctx.rotate(-1.05);
            roundRect(ctx, 0, -3, 58, 6, 2, METAL_DARK);
            roundRect(ctx, 50, -4.5, 9, 9, 2, "#1f2226");
            ctx.restore();
        });
        ellipse(ctx, 64, 80, 5, 5, p.mark);
        ellipse(ctx, 64, 80, 3, 3, p.main);
    }

    function plane(ctx, p, bomber) {
        const body = shade(ctx, 0, 50, 10, 30, p.light, p.vehicle);
        if (bomber) {
            // 大きな 胴体
            poly(ctx, [[8, 66], [24, 54], [104, 52], [124, 62], [112, 72], [24, 76]], body, "rgba(0,0,0,0.4)", 1.5);
            // 主翼（奥）
            poly(ctx, [[48, 58], [70, 30], [82, 30], [72, 58]], p.dark);
            // エンジン 2 つ
            roundRect(ctx, 56, 40, 20, 8, 3, METAL_DARK);
            roundRect(ctx, 52, 70, 22, 9, 3, METAL_DARK);
            // 主翼（手前）
            poly(ctx, [[46, 70], [68, 102], [82, 102], [74, 70]], shade(ctx, 46, 70, 30, 30, p.light, p.vehicle), "rgba(0,0,0,0.35)", 1.5);
            // 尾翼
            poly(ctx, [[12, 62], [4, 36], [16, 36], [28, 58]], p.vehicle, "rgba(0,0,0,0.35)", 1.5);
            // 操縦席・爆弾
            poly(ctx, [[104, 54], [114, 56], [118, 62], [106, 60]], "#bfe3ff");
            for (let i = 0; i < 3; i += 1) {
                ellipse(ctx, 40 + i * 14, 80, 5, 3, "#3a3a3a");
            }
            ellipse(ctx, 92, 64, 6, 6, p.mark);
            ellipse(ctx, 92, 64, 3.5, 3.5, p.main);
            return;
        }
        // 戦闘機
        poly(ctx, [[14, 64], [26, 56], [96, 56], [116, 63], [96, 70], [26, 70]], body, "rgba(0,0,0,0.4)", 1.5);
        poly(ctx, [[54, 58], [66, 34], [76, 34], [72, 58]], p.dark); // 奥の 翼
        poly(ctx, [[52, 66], [64, 92], [76, 92], [72, 66]], shade(ctx, 52, 66, 24, 26, p.light, p.vehicle), "rgba(0,0,0,0.35)", 1.5);
        poly(ctx, [[16, 62], [10, 42], [20, 42], [30, 58]], p.vehicle, "rgba(0,0,0,0.35)", 1.5);
        poly(ctx, [[76, 56], [86, 48], [94, 50], [92, 57]], "#bfe3ff", "rgba(0,0,0,0.3)", 1);
        // プロペラ
        roundRect(ctx, 115, 60, 5, 7, 2, METAL_DARK);
        ctx.globalAlpha = 0.45;
        ellipse(ctx, 121, 63, 3, 18, "#d9d9d9");
        ctx.globalAlpha = 1;
        ellipse(ctx, 46, 63, 5, 5, p.mark);
        ellipse(ctx, 46, 63, 3, 3, p.main);
    }

    function commander(ctx, p) {
        // 指揮所の テント
        poly(ctx, [[8, 112], [34, 60], [60, 112]], shade(ctx, 8, 60, 52, 52, "#8f8a63", "#5f5b3e"), "rgba(0,0,0,0.35)", 1.5);
        poly(ctx, [[30, 112], [34, 78], [40, 112]], "#2b2a1e");
        soldier(ctx, p, { hat: "cap", gear: "flag", x: 70, elite: true });
        // マント
        poly(ctx, [[60, 60], [52, 100], [62, 96]], p.dark);
    }

    // ---------- 駒の 絵 ----------
    const DRAW = {
        cmd: (ctx, p) => commander(ctx, p),
        inf: (ctx, p, promoted) => soldier(ctx, p, { elite: promoted }),
        tnk: (ctx, p, promoted) => tank(ctx, p, promoted),
        cav: (ctx, p, promoted) => horse(ctx, p, promoted),
        art: (ctx, p, promoted) => cannon(ctx, p, promoted),
        aa: (ctx, p) => aaGun(ctx, p),
        eng: (ctx, p) => soldier(ctx, p, { hat: "hardhat", gear: "pick" }),
        ftr: (ctx, p) => plane(ctx, p, false),
        bmb: (ctx, p) => plane(ctx, p, true)
    };

    // 駒の 絵（side は 1 か −1）。後手は 左右を 反転して 左を 向かせる
    function piece(key, side, promoted = false) {
        const id = `${key}:${side}:${promoted ? 1 : 0}`;
        if (cache.has(id)) {
            return cache.get(id);
        }
        const c = canvas();
        const ctx = c.getContext("2d");
        if (side < 0) {
            ctx.translate(SIZE, 0);
            ctx.scale(-1, 1);
        }
        DRAW[key](ctx, PALETTE[side], promoted);
        if (promoted) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            star(ctx, 112, 14, 9, GOLD);
        }
        cache.set(id, c);
        return c;
    }

    root.SankaiArt = { piece, PALETTE, SIZE, star };
})(typeof window !== "undefined" ? window : globalThis);
