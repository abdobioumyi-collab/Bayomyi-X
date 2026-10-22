const SB = 'https://zjiwomeupvvsvoodubyq.supabase.co';
const KEY = 'sb_publishable_zQwGJrEzdgnlcGM4C48ALw_7DGS1YDy';
const ORIGIN = 'https://academyi.vercel.app';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

module.exports = async (req, res) => {
  const slug = String((req.query && req.query.slug) || '').toLowerCase();
  let name = '', subject = '', avatar = '';
  if (/^[a-z][a-z0-9-]{2,29}$/.test(slug)) {
    try {
      const r = await fetch(SB + '/rest/v1/rpc/public_teacher_info', {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_slug: slug })
      });
      const j = await r.json();
      const row = Array.isArray(j) ? j[0] : j;
      if (row) {
        name = row.teacher_name || row.name || row.display_name || '';
        subject = row.subject || '';
        avatar = row.avatar_url || row.avatar || row.photo_url || row.photo || '';
      }
    } catch (e) {}
  }
  const title = name ? `منصة ${name} التعليمية` : 'منصتك التعليمية الخاصة باسمك ورابطك';
  const desc = name
    ? `سجّل واتعلم مع ${name}${subject ? ' في مادة ' + subject : ''}: شرح واختبارات وشهادات ومتابعة لمستواك أولًا بأول.`
    : 'طلابك واختباراتك وشهاداتك ومتابعتك في مكان واحد، وكل ده تحت إدارتك.';
  const img = /^https:\/\//.test(avatar) ? avatar : ORIGIN + '/og-default.png';
  const url = ORIGIN + '/' + slug;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.status(200).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="المنصة التعليمية">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
</head><body><a href="${esc(url)}">${esc(title)}</a></body></html>`);
};
