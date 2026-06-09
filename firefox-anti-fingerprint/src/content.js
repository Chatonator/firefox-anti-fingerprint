// Script de contenu : exécuté au plus tôt (document_start) dans tous les cadres.
// Lit les réglages + la graine, dérive le profil, puis injecte le code de
// falsification dans le contexte de la page.

(function () {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;

  // Fonction injectée dans le contexte de la page. Elle est convertie en chaîne
  // de caractères et doit donc être totalement autonome (ne référence que `cfg`).
  function pageSpoof(cfg) {
    try {
      // PRNG déterministe (mulberry32) à partir de la graine de session.
      const rand = (function (a) {
        return function () {
          a |= 0;
          a = (a + 0x6d2b79f5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      })(cfg.seed >>> 0);

      // --- Masquage toString : les fonctions falsifiées renvoient [native code] ---
      const nativeNames = new WeakMap();
      const origToString = Function.prototype.toString;
      const toStringProxy = new Proxy(origToString, {
        apply(target, thisArg, args) {
          if (nativeNames.has(thisArg)) {
            return "function " + nativeNames.get(thisArg) + "() { [native code] }";
          }
          return Reflect.apply(target, thisArg, args);
        }
      });
      function mask(fn, name) {
        try {
          nativeNames.set(fn, name);
        } catch (e) {}
        return fn;
      }
      try {
        Function.prototype.toString = toStringProxy;
        nativeNames.set(toStringProxy, "toString");
      } catch (e) {}

      function def(obj, prop, getter) {
        try {
          Object.defineProperty(obj, prop, {
            get: mask(getter, prop),
            configurable: true,
            enumerable: true
          });
        } catch (e) {}
      }

      // --- Propriétés navigateur / matériel ---
      if (cfg.navigator) {
        const N = Navigator.prototype;
        def(N, "userAgent", () => cfg.userAgent);
        def(N, "appVersion", () => cfg.appVersion);
        def(N, "platform", () => cfg.platform);
        def(N, "oscpu", () => cfg.oscpu);
        def(N, "hardwareConcurrency", () => cfg.hardwareConcurrency);
        def(N, "deviceMemory", () => cfg.deviceMemory);
        def(N, "language", () => cfg.language);
        def(N, "languages", () => Object.freeze(cfg.languages.slice()));
        def(N, "webdriver", () => false);
        def(N, "vendor", () => "");
        def(N, "vendorSub", () => "");
        def(N, "productSub", () => "20100101");
        def(N, "maxTouchPoints", () => 0);
        def(N, "doNotTrack", () => null);
        const emptyPlugins = {
          length: 0,
          item() {
            return null;
          },
          namedItem() {
            return null;
          },
          refresh() {}
        };
        def(N, "plugins", () => emptyPlugins);
        def(N, "mimeTypes", () => ({
          length: 0,
          item() {
            return null;
          },
          namedItem() {
            return null;
          }
        }));
        try {
          if ("getBattery" in N) {
            N.getBattery = mask(function () {
              return Promise.reject(new Error("blocked"));
            }, "getBattery");
          }
        } catch (e) {}
        // Périphériques média : empêche l'énumération (caméras/micros).
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            navigator.mediaDevices.enumerateDevices = mask(function () {
              return Promise.resolve([]);
            }, "enumerateDevices");
          }
        } catch (e) {}
        // Disposition clavier : empêche la détection de la langue physique.
        try {
          if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
            navigator.keyboard.getLayoutMap = mask(function () {
              return Promise.resolve(new Map());
            }, "getLayoutMap");
          }
        } catch (e) {}
      }

      // --- Écran ---
      if (cfg.screen) {
        const S = Screen.prototype;
        const w = cfg.screenW;
        const h = cfg.screenH;
        def(S, "width", () => w);
        def(S, "height", () => h);
        def(S, "availWidth", () => w);
        def(S, "availHeight", () => h);
        def(S, "availLeft", () => 0);
        def(S, "availTop", () => 0);
        def(S, "colorDepth", () => 24);
        def(S, "pixelDepth", () => 24);
        // Normalisations niveau fenêtre (densité, position, taille externe).
        def(window, "devicePixelRatio", () => 1);
        def(window, "screenX", () => 0);
        def(window, "screenY", () => 0);
        def(window, "screenLeft", () => 0);
        def(window, "screenTop", () => 0);
        try {
          def(window, "outerWidth", () => window.innerWidth);
          def(window, "outerHeight", () => window.innerHeight);
        } catch (e) {}
      }

      // --- Fuseau horaire -> UTC (offset + rendu des dates) ---
      if (cfg.timezone) {
        try {
          // 1) Force timeZone:UTC par défaut sur Intl.DateTimeFormat.
          const OrigDTF = Intl.DateTimeFormat;
          function PatchedDTF(locales, options) {
            const opts = Object.assign({}, options);
            if (!opts.timeZone) opts.timeZone = "UTC";
            return new OrigDTF(locales, opts);
          }
          PatchedDTF.prototype = OrigDTF.prototype;
          PatchedDTF.supportedLocalesOf = OrigDTF.supportedLocalesOf;
          const origRO = OrigDTF.prototype.resolvedOptions;
          OrigDTF.prototype.resolvedOptions = mask(function () {
            const o = origRO.call(this);
            o.timeZone = "UTC";
            return o;
          }, "resolvedOptions");
          Intl.DateTimeFormat = mask(PatchedDTF, "DateTimeFormat");

          // 2) Offset = 0.
          Date.prototype.getTimezoneOffset = mask(function () {
            return 0;
          }, "getTimezoneOffset");

          // 3) Représentations textuelles des dates en UTC (GMT+0000).
          const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const months = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun",
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
          ];
          const pad = (n) => String(n).padStart(2, "0");
          const datePart = (d) =>
            days[d.getUTCDay()] +
            " " +
            months[d.getUTCMonth()] +
            " " +
            pad(d.getUTCDate()) +
            " " +
            d.getUTCFullYear();
          const timePart = (d) =>
            pad(d.getUTCHours()) +
            ":" +
            pad(d.getUTCMinutes()) +
            ":" +
            pad(d.getUTCSeconds()) +
            " GMT+0000 (Coordinated Universal Time)";
          Date.prototype.toString = mask(function () {
            if (isNaN(this.getTime())) return "Invalid Date";
            return datePart(this) + " " + timePart(this);
          }, "toString");
          Date.prototype.toDateString = mask(function () {
            if (isNaN(this.getTime())) return "Invalid Date";
            return datePart(this);
          }, "toDateString");
          Date.prototype.toTimeString = mask(function () {
            if (isNaN(this.getTime())) return "Invalid Date";
            return timePart(this);
          }, "toTimeString");
          // 4) toLocale* en UTC.
          const oLS = Date.prototype.toLocaleString;
          Date.prototype.toLocaleString = mask(function (l, o) {
            return oLS.call(this, l, Object.assign({ timeZone: "UTC" }, o));
          }, "toLocaleString");
          const oLDS = Date.prototype.toLocaleDateString;
          Date.prototype.toLocaleDateString = mask(function (l, o) {
            return oLDS.call(this, l, Object.assign({ timeZone: "UTC" }, o));
          }, "toLocaleDateString");
          const oLTS = Date.prototype.toLocaleTimeString;
          Date.prototype.toLocaleTimeString = mask(function (l, o) {
            return oLTS.call(this, l, Object.assign({ timeZone: "UTC" }, o));
          }, "toLocaleTimeString");
        } catch (e) {}
      }

      // --- Canvas : bruit sur la lecture des pixels ---
      const C2D =
        typeof CanvasRenderingContext2D !== "undefined"
          ? CanvasRenderingContext2D.prototype
          : null;
      let origGetImageData = C2D ? C2D.getImageData : null;

      function addNoise(data) {
        for (let i = 0; i < data.length; i += 4) {
          if (rand() < 0.05) {
            const d = Math.floor(rand() * 3) - 1; // -1, 0 ou 1
            data[i] = Math.max(0, Math.min(255, data[i] + d));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + d));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + d));
          }
        }
      }

      if (cfg.canvas && C2D) {
        C2D.getImageData = mask(function (x, y, w, h) {
          const img = origGetImageData.call(this, x, y, w, h);
          try {
            addNoise(img.data);
          } catch (e) {}
          return img;
        }, "getImageData");

        const HC = HTMLCanvasElement.prototype;
        // Produit une copie bruitée sans altérer le canvas d'origine.
        const cloneNoised = (canvas) => {
          const t = document.createElement("canvas");
          t.width = canvas.width;
          t.height = canvas.height;
          const ctx = t.getContext("2d");
          if (!ctx) return canvas;
          ctx.drawImage(canvas, 0, 0);
          try {
            const im = origGetImageData.call(ctx, 0, 0, t.width, t.height);
            addNoise(im.data);
            ctx.putImageData(im, 0, 0);
          } catch (e) {}
          return t;
        };

        const origToDataURL = HC.toDataURL;
        HC.toDataURL = mask(function (...a) {
          try {
            return origToDataURL.apply(cloneNoised(this), a);
          } catch (e) {
            return origToDataURL.apply(this, a);
          }
        }, "toDataURL");

        const origToBlob = HC.toBlob;
        HC.toBlob = mask(function (cb, ...a) {
          try {
            return origToBlob.call(cloneNoised(this), cb, ...a);
          } catch (e) {
            return origToBlob.call(this, cb, ...a);
          }
        }, "toBlob");
      }

      // --- Polices : bruit déterministe et minuscule sur measureText ---
      // Le décalage dépend du texte + de la graine, donc il est STABLE entre les
      // appels (pas de saut de mise en page) tout en cassant l'énumération des
      // polices, et reste sous le sous-pixel (|delta| <= 0.05px).
      if (cfg.fonts && C2D) {
        const strHash = (s) => {
          let h = 2166136261 >>> 0;
          for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
          }
          return h >>> 0;
        };
        const origMT = C2D.measureText;
        C2D.measureText = mask(function (text) {
          const m = origMT.call(this, text);
          try {
            const h = (strHash(String(text)) ^ (cfg.seed >>> 0)) >>> 0;
            const delta = ((h % 1000) / 1000 - 0.5) * 0.1; // [-0.05, 0.05[ px
            Object.defineProperty(m, "width", {
              value: m.width + delta,
              configurable: true
            });
          } catch (e) {}
          return m;
        }, "measureText");
      }

      // --- WebGL : vendor / renderer ---
      if (cfg.webgl) {
        const spoofGP = (proto) => {
          if (!proto) return;
          const orig = proto.getParameter;
          proto.getParameter = mask(function (p) {
            // UNMASKED_VENDOR_WEBGL / UNMASKED_RENDERER_WEBGL
            if (p === 37445) return cfg.glVendor;
            if (p === 37446) return cfg.glRenderer;
            // VENDOR / RENDERER
            if (p === 7936) return cfg.glVendor;
            if (p === 7937) return cfg.glRenderer;
            return orig.call(this, p);
          }, "getParameter");
        };
        // Bruit subtil sur readPixels (empreinte WebGL par rendu + lecture).
        const spoofRP = (proto) => {
          if (!proto || !proto.readPixels) return;
          const orig = proto.readPixels;
          proto.readPixels = mask(function (x, y, w, h, format, type, pixels) {
            orig.call(this, x, y, w, h, format, type, pixels);
            try {
              if (pixels && pixels.BYTES_PER_ELEMENT === 1 && pixels.length) {
                for (let i = 0; i < pixels.length; i += 4) {
                  if (rand() < 0.02) pixels[i] = pixels[i] ^ 1;
                }
              }
            } catch (e) {}
          }, "readPixels");
        };
        spoofGP(
          typeof WebGLRenderingContext !== "undefined"
            ? WebGLRenderingContext.prototype
            : null
        );
        spoofGP(
          typeof WebGL2RenderingContext !== "undefined"
            ? WebGL2RenderingContext.prototype
            : null
        );
        spoofRP(
          typeof WebGLRenderingContext !== "undefined"
            ? WebGLRenderingContext.prototype
            : null
        );
        spoofRP(
          typeof WebGL2RenderingContext !== "undefined"
            ? WebGL2RenderingContext.prototype
            : null
        );
      }

      // --- AudioContext : micro-bruit ---
      if (cfg.audio) {
        try {
          const AB =
            typeof AudioBuffer !== "undefined" ? AudioBuffer.prototype : null;
          if (AB) {
            const orig = AB.getChannelData;
            // On bruite chaque canal UNE SEULE FOIS (pas de dérive à chaque
            // lecture) : inaudible (1e-7) mais casse l'empreinte audio.
            const noised = new WeakMap();
            AB.getChannelData = mask(function (ch) {
              const d = orig.call(this, ch);
              try {
                let set = noised.get(this);
                if (!set) {
                  set = new Set();
                  noised.set(this, set);
                }
                if (!set.has(ch)) {
                  set.add(ch);
                  for (let i = 0; i < d.length; i += 100) {
                    d[i] = d[i] + (rand() - 0.5) * 1e-7;
                  }
                }
              } catch (e) {}
              return d;
            }, "getChannelData");
          }
          const AN =
            typeof AnalyserNode !== "undefined" ? AnalyserNode.prototype : null;
          if (AN) {
            const o1 = AN.getFloatFrequencyData;
            AN.getFloatFrequencyData = mask(function (a) {
              o1.call(this, a);
              for (let i = 0; i < a.length; i++) {
                a[i] = a[i] + (rand() - 0.5) * 1e-3;
              }
            }, "getFloatFrequencyData");
            const o2 = AN.getFloatTimeDomainData;
            if (o2) {
              AN.getFloatTimeDomainData = mask(function (a) {
                o2.call(this, a);
                for (let i = 0; i < a.length; i++) {
                  a[i] = a[i] + (rand() - 0.5) * 1e-5;
                }
              }, "getFloatTimeDomainData");
            }
          }
        } catch (e) {}
      }

      // --- WebRTC : blocage côté page (en complément de l'API privacy) ---
      if (cfg.webrtc) {
        try {
          ["RTCPeerConnection", "webkitRTCPeerConnection", "mozRTCPeerConnection"].forEach(
            (k) => {
              try {
                Object.defineProperty(window, k, {
                  value: undefined,
                  configurable: true
                });
              } catch (e) {
                try {
                  window[k] = undefined;
                } catch (e2) {}
              }
            }
          );
        } catch (e) {}
      }
    } catch (e) {
      // Ne jamais casser la page si quelque chose échoue.
    }
  }

  function inject(cfg) {
    try {
      const code =
        "(" + pageSpoof.toString() + ")(" + JSON.stringify(cfg) + ");";
      const s = document.createElement("script");
      s.textContent = code;
      const parent = document.head || document.documentElement;
      parent.appendChild(s);
      s.remove();
    } catch (e) {}
  }

  (async () => {
    try {
      const stored = await api.storage.local.get(["settings", "seed"]);
      const settings = stored.settings || {};
      if (settings.enabled === false) return;

      let seed = stored.seed;
      if (typeof seed !== "number") {
        // Filet de sécurité (tout premier chargement avant l'init de l'arrière-plan) :
        // on persiste la graine pour qu'elle devienne la source unique partagée et
        // que l'User-Agent des en-têtes corresponde à celui exposé en JavaScript.
        seed = self.AFP.generateSeed();
        try {
          await api.storage.local.set({ seed });
        } catch (e) {}
      }
      const profile = self.AFP.deriveProfile(seed >>> 0);

      const cfg = {
        seed: seed >>> 0,
        navigator: settings.navigator !== false,
        screen: settings.screen !== false,
        timezone: settings.timezone !== false,
        canvas: settings.canvas !== false,
        webgl: settings.webgl !== false,
        audio: settings.audio !== false,
        fonts: settings.fonts !== false,
        webrtc: settings.webrtc !== false,
        userAgent: profile.userAgent,
        appVersion: profile.appVersion,
        platform: profile.platform,
        oscpu: profile.oscpu,
        hardwareConcurrency: profile.hardwareConcurrency,
        deviceMemory: profile.deviceMemory,
        language: profile.language,
        languages: profile.languages,
        screenW: profile.screen.w,
        screenH: profile.screen.h,
        glVendor: profile.webgl.vendor,
        glRenderer: profile.webgl.renderer
      };

      inject(cfg);
    } catch (e) {}
  })();
})();
