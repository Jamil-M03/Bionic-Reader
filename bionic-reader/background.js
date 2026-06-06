/* Bionic Reader — background
 * Sets defaults on install and flips the toggle on the keyboard command.
 * All UI surfaces just read/write storage; content scripts react via
 * storage.onChanged, so no per-tab messaging is needed.
 */
const api = typeof browser !== "undefined" ? browser : chrome;

api.runtime.onInstalled.addListener(async () => {
  const cur = await api.storage.local.get(null);
  const defaults = {};
  if (typeof cur.enabled !== "boolean") defaults.enabled = false;
  if (typeof cur.strength !== "number") defaults.strength = 0.45;
  if (Object.keys(defaults).length) await api.storage.local.set(defaults);
});

api.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-bionic") return;
  const { enabled = false } = await api.storage.local.get({ enabled: false });
  await api.storage.local.set({ enabled: !enabled });
});
