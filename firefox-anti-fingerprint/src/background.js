// Script d'arrière-plan : gère les réglages et la graine de session, réécrit les
// en-têtes HTTP (User-Agent / Accept-Language) et désactive WebRTC via l'API privacy.

(function () {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;

  const DEFAULT_SETTINGS = {
    enabled: true, // protection globale
    headers: true, // User-Agent + Accept-Language
    navigator: true, // userAgent/platform/hardware/plugins...
    screen: true, // résolution / profondeur de couleur
    timezone: true, // fuseau horaire -> UTC
    canvas: true, // bruit canvas
    webgl: true, // vendor/renderer
    audio: true, // bruit audio
    fonts: true, // measureText
    webrtc: true // blocage WebRTC
  };

  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let seed = 0;
  let profile = null;

  function recompute() {
    profile = self.AFP.deriveProfile(seed >>> 0);
  }

  async function load() {
    const stored = await api.storage.local.get(["settings", "seed"]);
    settings = Object.assign({}, DEFAULT_SETTINGS, stored.settings || {});
    if (typeof stored.seed === "number") {
      seed = stored.seed >>> 0;
    } else {
      seed = self.AFP.generateSeed();
      await api.storage.local.set({ seed });
    }
    if (!stored.settings) {
      await api.storage.local.set({ settings });
    }
    recompute();
    applyPrivacy();
  }

  // ---- Désactivation WebRTC via l'API privacy de Firefox ----
  async function applyPrivacy() {
    try {
      if (!api.privacy || !api.privacy.network) return;
      const block = settings.enabled && settings.webrtc;
      if (api.privacy.network.peerConnectionEnabled) {
        await api.privacy.network.peerConnectionEnabled.set({
          value: !block
        });
      }
      if (api.privacy.network.webRTCIPHandlingPolicy) {
        await api.privacy.network.webRTCIPHandlingPolicy.set({
          value: block ? "disable_non_proxied_udp" : "default"
        });
      }
    } catch (e) {
      // L'API privacy peut être indisponible selon la configuration ; on ignore.
    }
  }

  // ---- Rechargement des onglets pour appliquer une nouvelle identité ----
  // Recharge l'onglet actif (scope "active") ou tous les onglets (scope "all")
  // afin que l'empreinte JavaScript et les en-têtes HTTP redeviennent cohérents
  // immédiatement après le changement de graine.
  async function reloadTabs(scope) {
    const result = { reloaded: 0, skipped: 0 };
    try {
      const opts = { bypassCache: true };
      const tabs =
        scope === "all"
          ? await api.tabs.query({})
          : await api.tabs.query({ active: true, currentWindow: true });
      for (const t of tabs) {
        // On ne recharge que les pages web (http/https) : about:, moz-extension:
        // et autres pages internes ne sont pas rechargeables de façon utile.
        if (t.id != null && t.url && /^https?:/i.test(t.url)) {
          try {
            await api.tabs.reload(t.id, opts);
            result.reloaded++;
          } catch (e) {
            result.skipped++;
          }
        } else {
          result.skipped++;
        }
      }
    } catch (e) {}
    return result;
  }

  // ---- Réécriture des en-têtes HTTP ----
  function onBeforeSendHeaders(details) {
    if (!settings.enabled || !settings.headers || !profile) {
      return {};
    }
    const headers = details.requestHeaders || [];
    let sawUA = false;
    let sawLang = false;
    for (const h of headers) {
      const name = h.name.toLowerCase();
      if (name === "user-agent") {
        h.value = profile.userAgent;
        sawUA = true;
      } else if (name === "accept-language") {
        h.value = profile.acceptLanguage;
        sawLang = true;
      }
    }
    if (!sawUA) headers.push({ name: "User-Agent", value: profile.userAgent });
    if (!sawLang)
      headers.push({ name: "Accept-Language", value: profile.acceptLanguage });
    return { requestHeaders: headers };
  }

  api.webRequest.onBeforeSendHeaders.addListener(
    onBeforeSendHeaders,
    { urls: ["<all_urls>"] },
    ["blocking", "requestHeaders"]
  );

  // ---- Messages depuis le popup ----
  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
      if (!msg || !msg.type) {
        sendResponse({ ok: false });
        return;
      }
      if (msg.type === "getState") {
        sendResponse({ ok: true, settings, profile, seed });
      } else if (msg.type === "setSettings") {
        settings = Object.assign({}, settings, msg.settings || {});
        await api.storage.local.set({ settings });
        await applyPrivacy();
        sendResponse({ ok: true, settings });
      } else if (msg.type === "newIdentity") {
        seed = self.AFP.generateSeed();
        await api.storage.local.set({ seed });
        recompute();
        // Recharge les onglets pour appliquer instantanément la nouvelle identité.
        const scope = msg.scope === "all" ? "all" : "active";
        const reload = await reloadTabs(scope);
        sendResponse({ ok: true, profile, seed, scope, reload });
      } else {
        sendResponse({ ok: false });
      }
    })();
    return true; // réponse asynchrone
  });

  // Réagir aux changements de stockage (ex. depuis un autre contexte).
  api.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.settings) {
      settings = Object.assign({}, DEFAULT_SETTINGS, changes.settings.newValue);
      applyPrivacy();
    }
    if (changes.seed && typeof changes.seed.newValue === "number") {
      seed = changes.seed.newValue >>> 0;
      recompute();
    }
  });

  if (api.runtime.onStartup) api.runtime.onStartup.addListener(load);
  if (api.runtime.onInstalled) api.runtime.onInstalled.addListener(load);
  load();
})();
