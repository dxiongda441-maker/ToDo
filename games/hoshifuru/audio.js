// ほしふるクエスト：音（ファミコン風の曲と効果音を Web Audio で その場で鳴らす。音のファイルは使わない）
//
// 曲は MML（音符を文字で書く方法）で書く：
//   c d e f g a b … 音名（+ でシャープ、- でフラット）  r … 休み
//   数字 … 長さ（4 = 4 分音符、8 = 8 分音符。「.」で 1.5 倍）
//   o4 … オクターブ  > < … オクターブを上げる・下げる  l8 … 長さを省いたときの長さ
//   [ … ]2 … くり返し
// くり返す曲は、どのパートも同じ長さにする（tools/test-hoshifuru.js で確かめている）。
(function (root) {
    "use strict";
    const HF = root.HF = root.HF || {};

    const SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

    function expandRepeats(text) {
        let previous;
        do {
            previous = text;
            text = text.replace(/\[([^[\]]*)\](\d*)/g, (_, body, times) => body.repeat(Number(times) || 2));
        } while (text !== previous);
        return text;
    }

    // MML を 音符の並び（拍で数える）にする
    function parseMml(text) {
        const src = expandRepeats(text).replace(/\s+/g, "").toLowerCase();
        const notes = [];
        let i = 0;
        let octave = 4;
        let length = 8;
        let beat = 0;
        const readNumber = () => {
            const match = /^\d+/.exec(src.slice(i));
            if (!match) {
                return null;
            }
            i += match[0].length;
            return Number(match[0]);
        };
        while (i < src.length) {
            const ch = src[i];
            i += 1;
            if (ch === "o") {
                octave = readNumber();
            } else if (ch === "l") {
                length = readNumber();
            } else if (ch === ">") {
                octave += 1;
            } else if (ch === "<") {
                octave -= 1;
            } else if (ch === "r" || SEMITONE[ch] !== undefined) {
                let semitone = SEMITONE[ch] || 0;
                while (src[i] === "+" || src[i] === "-") {
                    semitone += src[i] === "+" ? 1 : -1;
                    i += 1;
                }
                let beats = 4 / (readNumber() || length);
                if (src[i] === ".") {
                    beats *= 1.5;
                    i += 1;
                }
                if (ch !== "r") {
                    // A4（o4 a）= 440Hz
                    notes.push({ at: beat, beats, freq: 440 * Math.pow(2, (octave * 12 + semitone - 57) / 12) });
                }
                beat += beats;
            } else {
                throw new Error(`MML に読めない文字があります：${ch}`);
            }
        }
        return { notes, beats: beat };
    }

    // ---------- 曲 ----------
    // wave：pulse25（細い四角波）・pulse50（四角波）・pulse12（とても細い四角波）・triangle（三角波）
    const TRACKS = {
        title: {
            tempo: 96, loop: true,
            voices: [
                { wave: "pulse25", volume: 0.5, mml: "o5 c4.g8g4e4 f4a4g2 e4.f8g4>c4< b4a8b8g2 a4.b8>c4<a4 g4e8f8g2 f4e4d4g4 c2r2" },
                { wave: "pulse12", volume: 0.25, mml: "o4 [e8g8]4 [f8a8]4 [e8g8]4 [d8g8]4 [f8a8]4 [e8g8]4 [d8f8]2[d8g8]2 [e8g8]2r2" },
                { wave: "triangle", volume: 0.8, mml: "o3 c2g2 f2>c2< c2g2 g2d2 f2>c2< c2g2 f2g2 c1" }
            ]
        },
        town: {
            tempo: 120, loop: true,
            voices: [
                { wave: "pulse25", volume: 0.45, mml: "o5 g8a8b8>d8<b4g4 a8b8a8g8e4d4 e8g8a8b8>c4<b4 a4.g8a2 g8a8b8>d8e4d4< >c8<b8a8g8a4b4 a8g8e8d8e4f+4 g2.r4" },
                { wave: "pulse12", volume: 0.2, mml: "o4 [r8b8]4 [r8a8]4 [r8g8]4 [r8a8]4 [r8b8]4 [r8g8]4 [r8f+8]4 [r8b8]2r2" },
                { wave: "triangle", volume: 0.8, mml: "o3 g4>d4<g4>d4< d4a4d4a4 c4g4c4g4 d4a4d4a4 g4>d4<g4>d4< c4g4c4g4 d4a4d4a4 g4>d4<g2" }
            ]
        },
        field: {
            tempo: 132, loop: true,
            voices: [
                { wave: "pulse50", volume: 0.35, mml: "o5 c4g8g8a8g8e8c8 d4a8a8b8a8f8d8 e4>c8<b8a8g8f8e8 d4.e8d4<g4> c4g8g8a8g8e8c8 f4a8>c8d8c8<a8f8 g4e8c8d4<b4> c2r4<g4>" },
                { wave: "pulse12", volume: 0.2, mml: "o4 [e8g8]4 [f8a8]4 [g8b8]4 [d8g8]4 [e8g8]4 [f8a8]4 [d8g8]4 [e8g8]2r2" },
                { wave: "triangle", volume: 0.8, mml: "o3 c4g4c4g4 d4a4d4a4 e4b4e4b4 g4>d4<g4>d4< c4g4c4g4 f4>c4<f4>c4< g4>d4<g4>d4< c4g4c2" }
            ]
        },
        dungeon: {
            tempo: 88, loop: true,
            voices: [
                { wave: "pulse25", volume: 0.35, mml: "o4 a4r8a8>c4<b4 a4r8e8f2 e4r8e8g4f4 e2.r4 a4r8a8>c4d4 e4r8d8c4<b4 a4g+4a4b4 a2r2" },
                { wave: "triangle", volume: 0.8, mml: "o3 a2>e2< f2>c2< c2g2 e2g+2 a2>e2< f2>c2< d2e2 a1" }
            ]
        },
        castle: {
            tempo: 104, loop: true,
            voices: [
                { wave: "pulse50", volume: 0.3, mml: "o4 d8d8d8f8a4g4 f8f8e8d8c+2 d8d8d8f8a4>c4< b-4a4g2 a8a8b-8a8g4f4 e8f8g8e8c+4<a4> d4e4f4e4 d2r2" },
                { wave: "pulse12", volume: 0.18, mml: "o4 [a8r8]4 [a8r8]4 [a8r8]4 [b-8r8]4 [a8r8]4 [a8r8]4 [b-8r8]2[a8r8]2 [f8r8]2r2" },
                { wave: "triangle", volume: 0.85, mml: "o3 d4a4d4a4 a4>e4<a4>c+4< d4a4d4a4 g4>d4<g4>d4< f4>c4<f4>c4< a4>e4<a4>e4< b-4>f4<a4>e4< d4a4d2" }
            ]
        },
        battle: {
            tempo: 168, loop: true,
            voices: [
                { wave: "pulse25", volume: 0.4, mml: "o5 a8>c8e8c8<a8>c8e8c8< g8b8>d8<b8g8b8>d8<b8 f8a8>c8<a8f8a8>c8<a8 e8g+8b8g+8e4r4 a4>c4e4d8c8< b4g4>d4<b4 a4f4>c4<a8f8 e4.g+8b4e4" },
                { wave: "triangle", volume: 0.85, mml: "o3 [a8a8>a8<a8]2 [g8g8>g8<g8]2 [f8f8>f8<f8]2 [e8e8>e8<e8]2 [a8a8>a8<a8]2 [g8g8>g8<g8]2 [f8f8>f8<f8]2 [e8e8>e8<e8]2" }
            ]
        },
        boss: {
            tempo: 176, loop: true,
            voices: [
                { wave: "pulse50", volume: 0.32, mml: "o5 e8e8r8e8g8e8f+8g8 a8a8r8a8b8a8g8f+8 e8e8r8e8g8b8>e8d8< b2a+2 >c4<b4a4g4 a4g4f+4e4 f+8g8a8b8>c8d8e8f+8< >e2<b2" },
                { wave: "pulse12", volume: 0.18, mml: "o4 [b8r8]4 [>c+8<r8]4 [b8r8]4 [b8r8]4 [g8r8]4 [a8r8]4 [a8r8]4 [b8r8]4" },
                { wave: "triangle", volume: 0.85, mml: "o3 [e8e8>e8<e8]2 [a8a8>a8<a8]2 [e8e8>e8<e8]2 [b8b8>b8<b8]2 [c8c8>c8<c8]2 [d8d8>d8<d8]2 [d8d8>d8<d8]2 [<b8b8>b8b8]2" }
            ]
        },
        final: {
            tempo: 150, loop: true,
            voices: [
                { wave: "pulse50", volume: 0.32, mml: "o5 c4c8d8e-4g4 f4.e-8d2 e-4e-8f8g4>c4< b2g2 a-4g8f8e-4d4 g4f8e-8d4c4 d4e-4f4d4 g2.<g4>" },
                { wave: "pulse25", volume: 0.18, mml: "o4 [g8e-8]4 [a8f8]4 [g8e-8]4 [g8d8]4 [a-8e-8]4 [g8e-8]4 [g8d8]4 [g8d8]4" },
                { wave: "triangle", volume: 0.85, mml: "o3 [c8>c8<]4 [f8>f8<]4 [c8>c8<]4 [g8>g8<]4 [a-8>a-8<]4 [c8>c8<]4 [g8>g8<]4 [g8>g8<]4" }
            ]
        },
        ending: {
            tempo: 84, loop: true,
            voices: [
                { wave: "pulse25", volume: 0.4, mml: "o5 c4f4a4g8f8 g4.a8g2 a4>c4<b-4a4 g2.r4 f4a4>c4d8c8< b-4.a8g2 a4g4f4e4 f2.r4" },
                { wave: "pulse12", volume: 0.18, mml: "o4 [a8>c8<]4 [g8>c8<]4 [a8>c8<]4 [g8>c8<]4 [a8>c8<]4 [b-8>d8<]4 [g8>c8<]4 [a8>c8<]2r2" },
                { wave: "triangle", volume: 0.8, mml: "o3 f2a2 c2g2 f2a2 c2e2 f2a2 b-2f2 c2e2 f1" }
            ]
        },
        // ここからは 1 回だけ鳴らす曲（ジングル）
        victory: {
            tempo: 168, loop: false,
            voices: [
                { wave: "pulse25", volume: 0.45, mml: "o5 c8e8g8>c4<g8>c4e2" },
                { wave: "triangle", volume: 0.8, mml: "o3 c8r8c8c4r8c4>c2" }
            ]
        },
        levelup: {
            tempo: 150, loop: false,
            voices: [
                { wave: "pulse25", volume: 0.45, mml: "o5 e8g8>c8<b8>c8d8e4.r8g2" },
                { wave: "triangle", volume: 0.8, mml: "o3 c4e4g4g8a8b4.r8>c2" }
            ]
        },
        item: {
            tempo: 150, loop: false,
            voices: [
                { wave: "pulse25", volume: 0.45, mml: "o5 g8>c8e8g8r8e8g2" },
                { wave: "triangle", volume: 0.8, mml: "o3 c4e4r8c8c2" }
            ]
        },
        join: {
            tempo: 132, loop: false,
            voices: [
                { wave: "pulse25", volume: 0.45, mml: "o5 c4e8g8>c4<a8b8>c2" },
                { wave: "triangle", volume: 0.8, mml: "o3 c4c4f4g4c2" }
            ]
        },
        inn: {
            tempo: 120, loop: false,
            voices: [
                { wave: "pulse25", volume: 0.4, mml: "o5 e4g4>c2<b8a8g4e4c4 d2c2" },
                { wave: "triangle", volume: 0.75, mml: "o3 c2e2f2c4e4 g2c2" }
            ]
        }
    };

    const parsed = {};
    Object.entries(TRACKS).forEach(([name, track]) => {
        const voices = track.voices.map(voice => Object.assign({}, voice, parseMml(voice.mml)));
        parsed[name] = {
            tempo: track.tempo,
            loop: track.loop,
            voices,
            beats: Math.max(...voices.map(v => v.beats))
        };
    });

    // ---------- ここからはブラウザだけ ----------
    let ctx = null;
    let master = null;
    let unlocked = false; // 1 回でもキーを押したりタッチしたりしたか（それまでは 音を出せない）
    let noiseBuffer = null;
    const waves = {};

    function context() {
        if (ctx) {
            return ctx;
        }
        const AudioContextClass = root.AudioContext || root.webkitAudioContext;
        if (!AudioContextClass || !unlocked) {
            return null;
        }
        ctx = new AudioContextClass();
        master = ctx.createGain();
        master.gain.value = 0.22;
        master.connect(ctx.destination);
        // 細い四角波（ファミコンの音）を作る
        [["pulse12", 0.125], ["pulse25", 0.25], ["pulse50", 0.5]].forEach(([name, duty]) => {
            const size = 32;
            const real = new Float32Array(size);
            const imag = new Float32Array(size);
            for (let n = 1; n < size; n += 1) {
                real[n] = Math.sin(2 * Math.PI * n * duty) / (Math.PI * n);
                imag[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n);
            }
            waves[name] = ctx.createPeriodicWave(real, imag);
        });
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
        const samples = noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i += 1) {
            samples[i] = Math.random() * 2 - 1;
        }
        return ctx;
    }

    function oscillator(wave) {
        const osc = ctx.createOscillator();
        if (waves[wave]) {
            osc.setPeriodicWave(waves[wave]);
        } else {
            osc.type = wave;
        }
        return osc;
    }

    // 1 つの音を鳴らす（音の終わりを少し切って、音と音の間を はっきりさせる）
    function playNote(bus, wave, freq, when, duration, volume) {
        const osc = oscillator(wave);
        const gain = ctx.createGain();
        const end = when + Math.max(0.03, duration * 0.9);
        osc.frequency.setValueAtTime(freq, when);
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(volume, when + 0.006);
        gain.gain.setValueAtTime(volume, Math.max(when + 0.006, end - 0.02));
        gain.gain.linearRampToValueAtTime(0, end);
        osc.connect(gain);
        gain.connect(bus);
        osc.start(when);
        osc.stop(end + 0.01);
    }

    // 曲を鳴らす係。少し先の音までを 決めておき、くり返しの曲は 終わったら頭へもどる
    function startTrack(name, onEnd) {
        const track = parsed[name];
        const bus = ctx.createGain();
        bus.gain.value = 1;
        bus.connect(master);
        const secondsPerBeat = 60 / track.tempo;
        const start = ctx.currentTime + 0.06;
        const cursors = track.voices.map(() => ({ index: 0, loop: 0 }));
        const player = { name, bus, timer: null, stopped: false };
        const pump = () => {
            if (player.stopped) {
                return;
            }
            const horizon = ctx.currentTime + 0.3;
            track.voices.forEach((voice, v) => {
                const cursor = cursors[v];
                for (;;) {
                    if (cursor.index >= voice.notes.length) {
                        if (!track.loop || voice.notes.length === 0) {
                            break;
                        }
                        cursor.index = 0;
                        cursor.loop += 1;
                    }
                    const note = voice.notes[cursor.index];
                    const when = start + (cursor.loop * track.beats + note.at) * secondsPerBeat;
                    if (when > horizon) {
                        break;
                    }
                    if (when >= ctx.currentTime - 0.05) {
                        playNote(bus, voice.wave, note.freq, Math.max(when, ctx.currentTime), note.beats * secondsPerBeat, voice.volume * 0.5);
                    }
                    cursor.index += 1;
                }
            });
            if (!track.loop && ctx.currentTime > start + track.beats * secondsPerBeat) {
                stopTrack(player);
                if (onEnd) {
                    onEnd();
                }
            }
        };
        pump();
        player.timer = setInterval(pump, 60);
        return player;
    }

    function stopTrack(player) {
        if (!player || player.stopped) {
            return;
        }
        player.stopped = true;
        clearInterval(player.timer);
        if (player.finish) {
            player.finish(); // 待っている人を 待たせたままにしない
        }
        const now = ctx.currentTime;
        player.bus.gain.cancelScheduledValues(now);
        player.bus.gain.setValueAtTime(player.bus.gain.value, now);
        player.bus.gain.linearRampToValueAtTime(0, now + 0.08);
        setTimeout(() => player.bus.disconnect(), 200);
    }

    // ---------- 効果音 ----------
    function tone(freq, toFreq, duration, wave = "pulse50", volume = 0.35, delay = 0) {
        const when = ctx.currentTime + delay;
        const osc = oscillator(wave);
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(freq, when);
        if (toFreq !== freq) {
            osc.frequency.exponentialRampToValueAtTime(toFreq, when + duration);
        }
        gain.gain.setValueAtTime(volume, when);
        gain.gain.linearRampToValueAtTime(0, when + duration);
        osc.connect(gain);
        gain.connect(master);
        osc.start(when);
        osc.stop(when + duration + 0.02);
    }

    function noise(duration, volume = 0.4, filter = 3000, delay = 0) {
        const when = ctx.currentTime + delay;
        const source = ctx.createBufferSource();
        source.buffer = noiseBuffer;
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = filter;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, when);
        gain.gain.exponentialRampToValueAtTime(0.001, when + duration);
        source.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(master);
        source.start(when);
        source.stop(when + duration + 0.02);
    }

    const SOUNDS = {
        cursor: () => tone(1320, 1320, 0.035, "pulse25", 0.2),
        ok: () => {
            tone(880, 880, 0.04, "pulse25", 0.25);
            tone(1320, 1320, 0.06, "pulse25", 0.25, 0.045);
        },
        cancel: () => tone(660, 440, 0.07, "pulse25", 0.22),
        buzz: () => tone(120, 110, 0.18, "pulse50", 0.3),
        stairs: () => [784, 659, 523, 392].forEach((f, i) => tone(f, f, 0.06, "pulse25", 0.25, i * 0.07)),
        chest: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.07, "pulse25", 0.25, i * 0.06)),
        hit: () => {
            noise(0.12, 0.45, 2600);
            tone(220, 90, 0.1, "pulse50", 0.2);
        },
        critical: () => {
            noise(0.2, 0.55, 5000);
            tone(1600, 200, 0.22, "pulse25", 0.25);
        },
        miss: () => tone(300, 900, 0.12, "triangle", 0.3),
        defeat: () => tone(700, 60, 0.35, "pulse50", 0.25),
        damage: () => {
            noise(0.25, 0.5, 900);
            tone(160, 60, 0.2, "pulse50", 0.3);
        },
        heal: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, f * 1.01, 0.09, "triangle", 0.35, i * 0.06)),
        spell: () => {
            tone(300, 1400, 0.22, "triangle", 0.35);
            tone(450, 2100, 0.22, "pulse12", 0.12, 0.03);
        },
        buy: () => {
            tone(988, 988, 0.06, "pulse25", 0.25);
            tone(1319, 1319, 0.16, "pulse25", 0.25, 0.06);
        },
        equip: () => {
            tone(1760, 1760, 0.03, "pulse12", 0.2);
            tone(2349, 2349, 0.08, "pulse12", 0.2, 0.05);
        },
        step: () => noise(0.03, 0.1, 600)
    };

    // ---------- ゲームから使うところ ----------
    let wantBgm = null; // 今 鳴っているはずの曲（音がオフでも覚えておく）
    let bgmPlayer = null;
    let jinglePlayer = null;

    function playWanted() {
        if (!HF.audio.enabled || !context() || jinglePlayer) {
            return;
        }
        if (ctx.state === "suspended") {
            ctx.resume();
        }
        if (bgmPlayer && bgmPlayer.name === wantBgm && !bgmPlayer.stopped) {
            return;
        }
        stopTrack(bgmPlayer);
        bgmPlayer = wantBgm && parsed[wantBgm] ? startTrack(wantBgm) : null;
    }

    function unlock() {
        if (unlocked) {
            return;
        }
        unlocked = true;
        playWanted();
    }

    if (typeof document !== "undefined") {
        ["keydown", "pointerdown", "touchstart"].forEach(type => {
            document.addEventListener(type, unlock, { capture: true, passive: true });
        });
    }

    HF.audio = {
        enabled: false,
        tracks: parsed,
        parseMml,
        // 今 鳴っている 曲の 名前（テスト用。鳴っていなければ null）
        nowPlaying() {
            return bgmPlayer && !bgmPlayer.stopped ? bgmPlayer.name : null;
        },
        setEnabled(on) {
            this.enabled = Boolean(on);
            if (this.enabled) {
                playWanted();
            } else if (ctx) {
                stopTrack(bgmPlayer);
                stopTrack(jinglePlayer);
                bgmPlayer = null;
                jinglePlayer = null;
            }
        },
        // 場所や戦闘の曲を切りかえる（同じ曲なら そのまま続ける）
        bgm(name) {
            wantBgm = name || null;
            if (ctx && !wantBgm) {
                stopTrack(bgmPlayer);
                bgmPlayer = null;
            }
            playWanted();
        },
        se(name) {
            if (!this.enabled || !SOUNDS[name] || !context() || ctx.state !== "running") {
                return;
            }
            SOUNDS[name]();
        },
        // 短い曲を 1 回鳴らす。その間 BGM は止め、終わったら 頭から鳴らしなおす
        jingle(name) {
            if (!this.enabled || !parsed[name] || !context()) {
                return Promise.resolve();
            }
            if (ctx.state === "suspended") {
                ctx.resume();
            }
            // 音の 時計が 止まっている（iPhone で 電話が きた など）と 曲が 終わらないので、待たない
            if (ctx.state !== "running") {
                return Promise.resolve();
            }
            stopTrack(bgmPlayer);
            bgmPlayer = null;
            const previous = jinglePlayer;
            jinglePlayer = null;
            stopTrack(previous);
            return new Promise(resolve => {
                const player = startTrack(name, () => {
                    if (jinglePlayer === player) {
                        jinglePlayer = null;
                        playWanted();
                    }
                });
                player.finish = resolve;
                jinglePlayer = player;
                // とちゅうで 時計が 止まっても 待ちつづけないように、曲の 長さ ＋ 1 秒で あきらめる
                const track = parsed[name];
                setTimeout(resolve, (track.beats * 60 / track.tempo) * 1000 + 1000);
            });
        }
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = HF.audio;
    }
})(typeof window !== "undefined" ? window : globalThis);
