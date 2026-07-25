/* AI 八卦特刊 · 访问统计（Google Analytics 4）
 * Measurement ID 由 /api/public-config 下发；未配置则静默跳过。
 * 特刊 SPA 用 hash 路由，需手动发 page_view；入口页只记首屏，避免锚点刷 PV。
 */
(function () {
  let ready = false;
  let gaId = "";

  function pagePath() {
    return location.pathname + location.search + location.hash;
  }

  function trackPageView(title) {
    if (!ready || typeof gtag !== "function") return;
    gtag("event", "page_view", {
      page_title: title || document.title,
      page_location: location.href,
      page_path: pagePath(),
    });
  }

  function trackEvent(name, params) {
    if (!ready || typeof gtag !== "function") return;
    gtag("event", name, params || {});
  }

  function loadGtag(id) {
    return new Promise(function (resolve, reject) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () {
        dataLayer.push(arguments);
      };
      gtag("js", new Date());
      // SPA：关闭自动 page_view，改由我们按路由发送
      gtag("config", id, { send_page_view: false });
      var s = document.createElement("script");
      s.async = true;
      s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function isMainSpa() {
    var p = location.pathname || "/";
    return p === "/" || p === "/index.html";
  }

  async function init() {
    try {
      var res = await fetch("/api/public-config");
      if (!res.ok) return;
      var cfg = await res.json();
      gaId = String(cfg.gaMeasurementId || "").trim();
      if (!gaId || !/^G-[A-Z0-9]+$/i.test(gaId)) return;
      await loadGtag(gaId);
      ready = true;
      var title = document.title;
      if ((location.pathname || "").indexOf("/entry") === 0) {
        title = "编辑部入口 · " + (document.title || "AI 八卦特刊");
      }
      trackPageView(title);
      if (isMainSpa()) {
        window.addEventListener("hashchange", function () {
          trackPageView();
        });
      }
    } catch (_) {
      /* 统计失败不影响阅读 */
    }
  }

  window.gossipAnalytics = { trackPageView: trackPageView, trackEvent: trackEvent };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
