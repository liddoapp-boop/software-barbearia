const MOTION_CDN = "https://cdn.jsdelivr.net/npm/motion@12.23.24/+esm";

let motionModulePromise = null;

async function loadMotion() {
  if (!motionModulePromise) {
    motionModulePromise = import(MOTION_CDN).catch(() => null);
  }
  return motionModulePromise;
}

function fallbackAnimate(root) {
  if (!root) return;
  root.classList.remove("settings-motion-ready");
  void root.offsetWidth;
  root.classList.add("settings-motion-ready");
}

export async function animateSettingsScreen(root) {
  if (!root) return;
  const motion = await loadMotion();
  if (!motion?.animate) {
    fallbackAnimate(root);
    return;
  }

  const panel = root.querySelector("[data-settings-panel]");
  const items = root.querySelectorAll("[data-motion-item]");

  if (panel) {
    motion.animate(
      panel,
      { opacity: [0, 1], y: [10, 0], scale: [0.992, 1] },
      { duration: 0.34, easing: [0.22, 1, 0.36, 1] },
    );
  }

  if (items.length) {
    motion.animate(
      items,
      { opacity: [0, 1], y: [8, 0] },
      { duration: 0.28, delay: motion.stagger ? motion.stagger(0.028) : 0.03, easing: "ease-out" },
    );
  }
}
