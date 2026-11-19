// صُرّة على sarrapay.com — وسيط Cloudflare للنطاقات الفرعية (مجاني، بلا خادم).
//   api.sarrapay.com        → واجهة بوابة الدفع (Supabase Edge Function «pay»)
//   pay.sarrapay.com        → صفحة الدفع للعميل  (?i=inv_… أو /inv_…)
//   docs.sarrapay.com       → توثيق المطوّرين، و/try صفحة التجربة
//   dashboard.sarrapay.com  → لا توجد لوحة ويب بعد: لوحة التاجر داخل التطبيق، فنوجّه لصفحة التجار
// الموقع الرئيسي sarrapay.com نفسه على GitHub Pages مباشرة (لا يمر بهذا الوسيط).
const SITE = 'https://sarrapay.com';
const API = 'https://osdojhpsfbcqguoctbpk.supabase.co/functions/v1/pay';
const PAGES = { pay: '/pay.html', docs: '/api.html' };
const DOCS_ROUTES = { '/try': '/try.html', '/try.html': '/try.html' };

export default {
  async fetch(req) {
    const url = new URL(req.url), sub = url.hostname.split('.')[0];

    if (sub === 'api') {
      if (url.pathname === '/' || url.pathname === '') return Response.redirect('https://docs.sarrapay.com/', 302);
      const up = new Request(API + url.pathname + url.search, req);
      return fetch(up); // الطريقة والترويسات والجسم كما هي، والرد كما هو (يشمل CORS)
    }

    if (sub === 'dashboard') return Response.redirect(SITE + '/#merchant', 302);

    if (sub === 'pay' || sub === 'docs') {
      let path = url.pathname;
      if (sub === 'pay' && /^\/inv_[0-9a-f]{20}\/?$/.test(path)) { // pay.sarrapay.com/inv_… رابط أقصر
        url.searchParams.set('i', path.replace(/\//g, '')); path = '/';
      }
      if (path === '/' || path === '') path = PAGES[sub];
      else if (sub === 'docs' && DOCS_ROUTES[path]) path = DOCS_ROUTES[path];
      if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method Not Allowed', { status: 405 });
      const res = await fetch(SITE + path + (url.search || ''), { cf: { cacheTtl: 300 } });
      const out = new Response(res.body, res);
      out.headers.set('x-content-type-options', 'nosniff');
      out.headers.set('referrer-policy', 'no-referrer');
      if (sub === 'pay') out.headers.set('x-frame-options', 'DENY'); // لا تُضمَّن صفحة الدفع داخل موقع آخر
      return out;
    }

    return Response.redirect(SITE + '/', 302);
  }
};
