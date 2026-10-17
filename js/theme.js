// 配色（自動 / ライト / ダーク）の切り替え。選んだ設定は localStorage に保存する
window.TodoApp = window.TodoApp || {};

TodoApp.theme = (() => {
    const THEME_STORAGE_KEY = "todo.theme.v1";
    const MODES = ["auto", "light", "dark"];
    const LABELS = { auto: "Auto", light: "Light", dark: "Dark" };

    const toggleButton = document.querySelector("#theme-toggle");
    const systemDark = typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    let mode = "auto";

    function loadMode() {
        try {
            const saved = localStorage.getItem(THEME_STORAGE_KEY);
            return MODES.includes(saved) ? saved : "auto";
        } catch (_error) {
            return "auto";
        }
    }

    function saveMode() {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, mode);
        } catch (error) {
            console.warn("Failed to save theme", error);
        }
    }

    function apply() {
        const dark = mode === "dark" || (mode === "auto" && Boolean(systemDark && systemDark.matches));
        document.body.classList.toggle("dark", dark);
        // フォーム部品（日付入力など）の標準の色も合わせる
        document.documentElement.style.colorScheme = dark ? "dark" : "light";

        if (toggleButton) {
            toggleButton.textContent = `Theme: ${LABELS[mode]}`;
            toggleButton.setAttribute("aria-label", `Color theme: ${LABELS[mode]}. Click to change.`);
        }
    }

    function cycle() {
        mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
        saveMode();
        apply();
    }

    function init() {
        mode = loadMode();
        apply();

        if (toggleButton) {
            toggleButton.addEventListener("click", cycle);
        }

        if (systemDark) {
            const onChange = () => {
                if (mode === "auto") {
                    apply();
                }
            };
            if (typeof systemDark.addEventListener === "function") {
                systemDark.addEventListener("change", onChange);
            } else if (typeof systemDark.addListener === "function") {
                systemDark.addListener(onChange);
            }
        }
    }

    return { init };
})();
