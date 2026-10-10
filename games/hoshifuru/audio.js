// ほしふるクエスト：音（あとで曲と効果音を入れる。今は何もしない）
(function (root) {
    "use strict";
    const HF = root.HF = root.HF || {};
    HF.audio = {
        enabled: false,
        setEnabled(on) {
            this.enabled = Boolean(on);
        },
        bgm() {},
        se() {},
        jingle() {
            return Promise.resolve();
        }
    };
})(typeof window !== "undefined" ? window : globalThis);
