// Code partagé entre le script d'arrière-plan et les scripts de contenu.
// Génère un profil de navigateur cohérent et déterministe à partir d'une graine (seed)
// pour que l'User-Agent des en-têtes HTTP corresponde aux valeurs falsifiées en JavaScript.

(function () {
  "use strict";

  // PRNG déterministe (mulberry32) : même graine => même séquence.
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Profils d'User-Agent Firefox desktop réalistes et répandus (pour se fondre dans la masse).
  const UA_PROFILES = [
    {
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
      platform: "Win32",
      oscpu: "Windows NT 10.0; Win64; x64",
      appVersion: "5.0 (Windows)"
    },
    {
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0",
      platform: "Win32",
      oscpu: "Windows NT 10.0; Win64; x64",
      appVersion: "5.0 (Windows)"
    },
    {
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0",
      platform: "MacIntel",
      oscpu: "Intel Mac OS X 10.15",
      appVersion: "5.0 (Macintosh)"
    },
    {
      ua: "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
      platform: "Linux x86_64",
      oscpu: "Linux x86_64",
      appVersion: "5.0 (X11)"
    }
  ];

  const SCREENS = [
    { w: 1920, h: 1080 },
    { w: 1536, h: 864 },
    { w: 1366, h: 768 },
    { w: 1440, h: 900 }
  ];

  // Combinaisons WebGL plausibles (vendor / renderer).
  const WEBGL = [
    { vendor: "Mozilla", renderer: "Mozilla" },
    { vendor: "Intel Inc.", renderer: "Intel(R) UHD Graphics 630" },
    {
      vendor: "Google Inc. (Intel)",
      renderer:
        "ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0)"
    }
  ];

  function deriveProfile(seed) {
    const rng = mulberry32(seed >>> 0);
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];

    const ua = pick(UA_PROFILES);
    return {
      seed: seed >>> 0,
      userAgent: ua.ua,
      appVersion: ua.appVersion,
      platform: ua.platform,
      oscpu: ua.oscpu,
      hardwareConcurrency: pick([4, 8]),
      deviceMemory: pick([4, 8]),
      screen: pick(SCREENS),
      webgl: pick(WEBGL),
      language: "en-US",
      languages: ["en-US", "en"],
      acceptLanguage: "en-US,en;q=0.5",
      timezone: "UTC"
    };
  }

  function generateSeed() {
    return Math.floor(Math.random() * 0xffffffff) >>> 0;
  }

  const AFP = { mulberry32, deriveProfile, generateSeed };

  if (typeof self !== "undefined") self.AFP = AFP;
  if (typeof globalThis !== "undefined") globalThis.AFP = AFP;
})();
