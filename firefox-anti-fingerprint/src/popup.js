(function () {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;

  const enabledEl = document.getElementById("enabled");
  const statusDot = document.getElementById("statusDot");
  const subtitle = document.getElementById("subtitle");
  const uaEl = document.getElementById("ua");
  const togglesEl = document.getElementById("toggles");
  const newIdentityBtn = document.getElementById("newIdentity");
  const feedbackEl = document.getElementById("feedback");
  const specPlatformEl = document.getElementById("specPlatform");
  const specScreenEl = document.getElementById("specScreen");
  const specWebglEl = document.getElementById("specWebgl");

  const categoryInputs = Array.from(
    document.querySelectorAll("input[data-key]")
  );

  let feedbackTimer = null;

  function send(msg) {
    return api.runtime.sendMessage(msg);
  }

  // Résume le système d'exploitation + version Firefox depuis l'User-Agent.
  function osLabel(profile) {
    const ua = profile.userAgent || "";
    let os = profile.platform || "—";
    if (/Windows/.test(ua)) os = "Windows";
    else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
    else if (/Linux/.test(ua)) os = "Linux";
    const m = ua.match(/Firefox\/([\d.]+)/);
    return os + (m ? " · Firefox " + m[1] : "");
  }

  function renderSpecs(profile) {
    if (!profile) return;
    if (profile.userAgent) uaEl.textContent = profile.userAgent;
    specPlatformEl.textContent = osLabel(profile);
    specScreenEl.textContent = profile.screen
      ? profile.screen.w + " × " + profile.screen.h
      : "—";
    specWebglEl.textContent =
      profile.webgl && profile.webgl.renderer ? profile.webgl.renderer : "—";
  }

  function render(settings, profile) {
    enabledEl.checked = !!settings.enabled;
    statusDot.classList.toggle("on", !!settings.enabled);
    subtitle.textContent = settings.enabled
      ? "Protection maximale active"
      : "Protection désactivée";
    togglesEl.classList.toggle("disabled", !settings.enabled);

    for (const input of categoryInputs) {
      input.checked = settings[input.dataset.key] !== false;
    }
    renderSpecs(profile);
  }

  function showFeedback(text, kind) {
    feedbackEl.textContent = text;
    feedbackEl.className = "feedback show" + (kind ? " " + kind : "");
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      feedbackEl.className = "feedback";
    }, 2600);
  }

  function selectedScope() {
    const checked = document.querySelector('input[name="scope"]:checked');
    return checked ? checked.value : "active";
  }

  async function refresh() {
    const state = await send({ type: "getState" });
    if (state && state.ok) {
      render(state.settings, state.profile);
    }
  }

  enabledEl.addEventListener("change", async () => {
    const res = await send({
      type: "setSettings",
      settings: { enabled: enabledEl.checked }
    });
    if (res && res.ok) render(res.settings, null);
    refresh();
  });

  for (const input of categoryInputs) {
    input.addEventListener("change", async () => {
      const patch = {};
      patch[input.dataset.key] = input.checked;
      await send({ type: "setSettings", settings: patch });
    });
  }

  newIdentityBtn.addEventListener("click", async () => {
    const scope = selectedScope();
    newIdentityBtn.disabled = true;
    newIdentityBtn.classList.add("loading");
    newIdentityBtn.textContent = "⏳ Changement…";
    try {
      const res = await send({ type: "newIdentity", scope });
      if (res && res.ok && res.profile) {
        renderSpecs(res.profile);
        const reloaded = res.reload ? res.reload.reloaded : 0;
        if (reloaded > 0) {
          showFeedback(
            "✓ Nouvelle identité appliquée (" +
              reloaded +
              (reloaded > 1 ? " onglets rechargés)" : " onglet rechargé)"),
            "ok"
          );
        } else {
          showFeedback(
            "✓ Identité générée — rechargez la page pour l'appliquer",
            "ok"
          );
        }
      } else {
        showFeedback("Échec du changement d'identité", "err");
      }
    } catch (e) {
      showFeedback("Échec du changement d'identité", "err");
    } finally {
      newIdentityBtn.classList.remove("loading");
      newIdentityBtn.textContent = "🔄 Nouvelle identité";
      newIdentityBtn.disabled = false;
    }
  });

  refresh();
})();
