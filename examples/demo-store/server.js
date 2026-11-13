// متجر تجريبي صغير يقبل USDT عبر بوابة دفع صُرّة.
// ملف واحد بلا أي مكتبات. يحتاج Node.js 18 أو أحدث.
//
//   SARRA_KEY=sk_live_xxx node server.js
//
// ثم افتح http://localhost:3000
const http = require('http');
const crypto = require('crypto');

const API = process.env.SARRA_API || 'https://osdojhpsfbcqguoctbpk.supabase.co/functions/v1/pay';
const KEY = process.env.SARRA_KEY;                        // مفتاح الـ API (سري: يبقى في الخادم فقط)
const HOOK_SECRET = process.env.SARRA_WEBHOOK_SECRET;     // سر الإشعار whsec_… (اختياري للتجربة المحلية)
const NETWORK = process.env.SARRA_NETWORK || 'bsc';
const PORT = process.env.PORT || 3000;
if (!KEY) { console.error('ضع مفتاحك أولاً:  SARRA_KEY=sk_live_xxx node server.js'); process.exit(1); }

const PRODUCTS = [
  { id: 'coffee', name: 'قهوة سودانية 250 جم', price: '3' },
  { id: 'book', name: 'كتاب إلكتروني', price: '5.50' },
  { id: 'course', name: 'اشتراك شهر في الدورة', price: '12' }
];
// الطلبات في الذاكرة للتبسيط. في متجر حقيقي احفظها في قاعدة بيانات.
const orders = new Map(); // orderId -> { product, status, invoice }

// ---------- 1) التعامل مع API صُرّة ----------
async function sarra(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'HTTP_' + res.status);
  return data;
}

async function createOrder(product) {
  const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();
  const { invoice } = await sarra('POST', '/v1/invoices', {
    amount: product.price, network: NETWORK, order_id: orderId, description: product.name
  });
  orders.set(orderId, { product, status: 'pending', invoice });
  return orderId;
}

function markPaid(orderId, invoice) {
  const o = orders.get(orderId);
  if (!o || o.status === 'paid') return;   // الإشعار قد يتكرر: لا نسلّم الطلب مرتين
  o.status = 'paid'; o.invoice = invoice;
  console.log('✅ دُفع الطلب', orderId, '—', invoice.pay_amount, 'USDT');
  // هنا تسلّم المنتج: ترسل بريداً، تفعّل اشتراكاً، ...
}

// ---------- 2) إشعار الدفع (Webhook) ----------
function validSignature(header, rawBody) {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header || '');
  if (!m || Math.abs(Date.now() / 1000 - Number(m[1])) > 300) return false;
  const expected = crypto.createHmac('sha256', HOOK_SECRET).update(m[1] + '.' + rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(m[2]));
}

// ---------- 3) صفحات المتجر ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const page = (title, body) => `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f7f6;margin:0;padding:20px;line-height:1.8}
.box{max-width:460px;margin:0 auto;background:#fff;border-radius:16px;padding:20px;border:1px solid #e3e8e6}
.row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #eee}
button,.btn{background:#0B8A63;color:#fff;border:0;border-radius:10px;padding:9px 16px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block}
.big{font-size:46px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:6px 0}small{color:#667}</style>
<div class="box">${body}</div></html>`;

const home = () => page('متجر تجريبي', `<h1>متجر تجريبي</h1><p><small>مثال على استخدام بوابة دفع صُرّة</small></p>` +
  PRODUCTS.map((p) => `<form class="row" method="post" action="/buy"><span>${esc(p.name)}<br><b>${p.price} USDT</b></span>
  <input type="hidden" name="product" value="${p.id}"><button>اشترِ</button></form>`).join(''));

const orderPage = (id, o) => page('طلب ' + id, o.status === 'paid'
  ? `<div class="big">✅</div><h1>تم الدفع، شكراً لك</h1><p>${esc(o.product.name)}</p><p><small>رقم الطلب ${id}</small></p><a class="btn" href="/">رجوع للمتجر</a>`
  : o.status === 'expired'
  ? `<div class="big">⌛</div><h1>انتهت مهلة الدفع</h1><a class="btn" href="/">اطلب من جديد</a>`
  : `<h1>${esc(o.product.name)}</h1><p>المبلغ: <b>${o.product.price} USDT</b></p><p><small>رقم الطلب ${id}</small></p>
     <p><a class="btn" href="${esc(o.invoice.pay_url)}" target="_blank" rel="noopener">ادفع الآن</a></p>
     <p><small>بعد الدفع تتحدث هذه الصفحة تلقائياً.</small></p>
     <script>setInterval(async()=>{const r=await fetch('/status/${id}');const j=await r.json();if(j.status!=='pending')location.reload()},5000)</script>`);

const readBody = (req) => new Promise((ok, bad) => {
  let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e5) req.destroy(); }); req.on('end', () => ok(s)); req.on('error', bad);
});
const send = (res, code, body, type = 'text/html; charset=utf-8', extra = {}) => { res.writeHead(code, { 'Content-Type': type, ...extra }); res.end(body); };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), parts = url.pathname.split('/').filter(Boolean);

    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, home());

    if (req.method === 'POST' && url.pathname === '/buy') {
      const wanted = new URLSearchParams(await readBody(req)).get('product');
      const product = PRODUCTS.find((p) => p.id === wanted);
      if (!product) return send(res, 400, page('خطأ', 'منتج غير معروف'));
      const id = await createOrder(product);
      return send(res, 303, '', undefined, { Location: '/order/' + id });
    }

    if (req.method === 'GET' && parts[0] === 'order' && orders.has(parts[1])) return send(res, 200, orderPage(parts[1], orders.get(parts[1])));

    // الصفحة تسأل عن الحالة. إن لم يصل إشعار بعد (مثلاً على localhost) نسأل صُرّة مباشرة.
    if (req.method === 'GET' && parts[0] === 'status' && orders.has(parts[1])) {
      const o = orders.get(parts[1]);
      if (o.status === 'pending') {
        const { invoice } = await sarra('GET', '/v1/invoices/' + o.invoice.id);
        if (invoice.status === 'paid') markPaid(parts[1], invoice); else o.status = invoice.status;
      }
      return send(res, 200, JSON.stringify({ status: o.status }), 'application/json');
    }

    if (req.method === 'POST' && url.pathname === '/sarra-hook') {
      const raw = await readBody(req);
      if (!HOOK_SECRET || !validSignature(req.headers['x-sarra-signature'], raw)) return send(res, 400, 'bad signature', 'text/plain');
      const { event, invoice } = JSON.parse(raw);
      if (event === 'invoice.paid') markPaid(invoice.order_id, invoice);
      return send(res, 200, 'ok', 'text/plain');
    }

    send(res, 404, page('غير موجود', 'الصفحة غير موجودة'));
  } catch (e) {
    console.error(e.message);
    send(res, 500, page('خطأ', 'تعذّر إتمام الطلب: ' + esc(e.message) + '<p><a class="btn" href="/">رجوع</a></p>'));
  }
}).listen(PORT, () => console.log('المتجر يعمل على http://localhost:' + PORT));
