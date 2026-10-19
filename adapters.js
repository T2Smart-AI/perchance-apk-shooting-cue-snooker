// adapters.js — remplacements free/keyless (Puter primaire + Pollinations fallback).
// CDN Puter officiel : https://js.puter.com/v2/ (à inclure avant ce fichier).
(function () {
  "use strict";
  var lastText = 0, lastImg = 0, cache = {};
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function throttle(kind) {
    var now = Date.now();
    if (kind === 'text') { var d = now - lastText; if (d < 30000 && lastText) await wait(Math.min(30000 - d, 5000)); lastText = Date.now(); }
    else { var d2 = now - lastImg; if (d2 < 45000 && lastImg) await wait(Math.min(45000 - d2, 8000)); lastImg = Date.now(); }
  }
  async function aiText(prompt, sys) {
    var key = 't:' + (sys || '') + '|' + prompt;
    if (cache[key]) return cache[key];
    // 1) Puter.js (primaire, sans clé)
    try {
      if (window.puter && window.puter.ai && window.puter.ai.chat) {
        await throttle('text');
        var r = await window.puter.ai.chat((sys ? sys + '\n\nDemande : ' : '') + prompt, { model: "gpt-4o-mini" });
        var txt = (r && r.message && r.message.content) || String(r);
        cache[key] = txt; return txt;
      }
    } catch (e) { console.warn('[adapters] puter text failed, fallback pollinations', e); }
    // 2) Pollinations texte (fallback, sans clé, 30s)
    try {
      await throttle('text');
      var url = 'https://text.pollinations.ai/' + encodeURIComponent(String(prompt)).slice(0, 1500) + (sys ? '?system=' + encodeURIComponent(sys) : '');
      var res = await fetch(url);
      if (res.status === 402) return 'IA en file (limite gratuite 30s) — réessayez dans quelques secondes.';
      var t = await res.text(); cache[key] = t; return t;
    } catch (e) { return 'IA indisponible (offline ?). ' + e.message; }
  }
  function aiImageUrl(prompt, seed) {
    var s = (seed == null ? Math.floor(Math.random() * 100000) : seed);
    return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=512&height=512&seed=' + s + '&nologo=true';
  }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('px_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('px_' + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('px_' + k); } catch (e) {} }
  };
  window.Adapters = { text: aiText, imageUrl: aiImageUrl, store: store };
  window.store = store;
  window.genererTexteIA = aiText;
  window.genererUrlImageIA = aiImageUrl;
  // 2026-10-19g : l'echec d'un <script type=module> ne laisse AUCUNE trace
  // window (event sur l'element uniquement) et fige les jeux sur leur loader.
  // Capteur en capture, silencieux si tout va bien : bandeau + console.warn.
  window.addEventListener('error', function (e) {
    var t = e && e.target;
    if (!t || t === window || t === document) return;
    var url = (t.src || t.href || '');
    if (!url) return;
    try { console.warn('[px-export] resource failed to load:', url); } catch (x) {}
    try {
      var b = document.getElementById('pxLoadErr');
      if (!b) {
        b = document.createElement('div'); b.id = 'pxLoadErr';
        b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:999999;background:#3a1111;color:#ffd7d7;border:1px solid #a33;border-radius:8px;padding:8px 10px;font:12px/1.4 system-ui,sans-serif;max-width:70vw;';
        (document.body || document.documentElement).appendChild(b);
      }
      b.textContent = 'Ressource introuvable / failed to load: ' + url;
    } catch (x) {}
  }, true);
})();
