// 画面下に一時的なお知らせ（「元に戻す」ボタン付き）を出す
window.TodoApp = window.TodoApp || {};

TodoApp.toast = (() => {
    const DEFAULT_DURATION = 6000;

    const toastEl = document.querySelector("#toast");
    const messageEl = document.querySelector("#toast-message");
    const actionButton = document.querySelector("#toast-action");
    const enabled = Boolean(toastEl && messageEl && actionButton);

    let hideTimer = null;
    let currentAction = null;

    function hide() {
        if (!enabled) {
            return;
        }

        clearTimeout(hideTimer);
        hideTimer = null;
        currentAction = null;
        toastEl.hidden = true;
    }

    // options: { actionLabel, onAction, duration }
    function show(message, options = {}) {
        if (!enabled) {
            return;
        }

        clearTimeout(hideTimer);
        messageEl.textContent = message;

        currentAction = typeof options.onAction === "function" ? options.onAction : null;
        actionButton.hidden = !currentAction;
        actionButton.textContent = options.actionLabel || "Undo";

        toastEl.hidden = false;
        hideTimer = setTimeout(hide, options.duration || DEFAULT_DURATION);
    }

    function init() {
        if (!enabled) {
            return;
        }

        actionButton.addEventListener("click", () => {
            const action = currentAction;
            hide();
            if (action) {
                action();
            }
        });

        document.addEventListener("keydown", event => {
            if (toastEl.hidden) {
                return;
            }
            if (event.key === "Escape") {
                hide();
                return;
            }
            // Ctrl+Z（Mac は ⌘Z）でも「Undo」を押したことにする。文字入力中は入力欄の取り消しを優先する
            const isUndoKey = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
            const target = event.target;
            const textInput = target && target.tagName === "INPUT"
                && !["checkbox", "radio", "button", "submit", "reset"].includes(target.type);
            const typing = Boolean(target) && (textInput || target.tagName === "TEXTAREA" || target.isContentEditable);
            if (isUndoKey && currentAction && !typing) {
                event.preventDefault();
                actionButton.click();
            }
        });
    }

    return { init, show, hide };
})();
