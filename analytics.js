(() => {
  'use strict';

  const measurementId = String(globalThis.__GA4_MEASUREMENT_ID__ || '').trim();
  const measurementIdPattern = /^G-[A-Z0-9]+$/;
  if (!measurementIdPattern.test(measurementId)) return;

  const dataLayer = globalThis.dataLayer = globalThis.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  globalThis.gtag = gtag;
  gtag('js', new Date());
  gtag('config', measurementId);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.append(script);

})();
