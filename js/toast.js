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
            if (event.key === "Escape" && !toastEl.hidden) {
                hide();
            }
        });
    }

    return { init, show, hide };
})();
