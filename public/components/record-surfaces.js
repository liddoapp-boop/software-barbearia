const boundRoots = new WeakSet();

const NATIVE_INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[contenteditable='true']",
].join(",");

export function bindRecordSurfaceKeyboard(root = document) {
  if (!root?.addEventListener || boundRoots.has(root)) return;
  boundRoots.add(root);

  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target?.closest?.(NATIVE_INTERACTIVE_SELECTOR)) return;

    const trigger = event.target?.closest?.('[data-record-interactive="true"]');
    if (!trigger || trigger.getAttribute("aria-disabled") === "true") return;

    event.preventDefault();
    trigger.click();
  });
}
