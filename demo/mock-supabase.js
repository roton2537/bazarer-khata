// শুধু স্ক্রিনশট/ডেমোর জন্য: সত্যিকারের Supabase ছাড়া স্ক্রিন চালানোর নমুনা-তথ্য (প্রোডাকশন বিল্ডে ব্যবহৃত হয় না)
export const configured = true;
export const errText = (e) => e?.message || String(e);
const UID = 'u-rahim';
const G = { id: 'g1', name: 'বাসার বাজার', currency_code: 'BDT', currency_symbol: '৳', currency_name: 'টাকা', currency_gen: 'টাকার', currency_decimals: 2, invite_code: 'K7M2QX9A' };
const mk = (id, n, role = 'member', user = true) => ({ id, group_id: 'g1', user_id: user ? 'u-' + id : null, display_name: n, role, joined_on: '2026-11-01', left_on: null, seq: id.length + n.length, created_at: '2026-11-01' });
const members = [mk('rahim', 'রহিম', 'admin'), mk('karim', 'করিম'), mk('abdul', 'আব্দুল'), mk('salam', 'সালাম')];
const sh = (pid) => members.map((m) => ({ purchase_id: pid, member_id: m.id, share: 50000 }));
const P = (id, b, d, amt, date, items = []) => ({ id, group_id: 'g1', bazar_date: date, month: '2026-11-01', buyer_id: b, description: d, amount: amt, created_by: b,
  created_at: date + 'T08:00:00Z', purchase_items: items, purchase_shares: sh(id) });
const purchases = [
  P('p4', 'salam', 'সবজি ও ফল', 50000, '2026-11-19'), P('p3', 'abdul', 'মাছ', 50000, '2026-11-18'),
  P('p2', 'karim', 'চাল, ডাল ও তেল', 70000, '2026-11-17', [{ id: 'i1', name: 'চাল', amount: 40000 }, { id: 'i2', name: 'ডাল', amount: 15000 }, { id: 'i3', name: 'তেল', amount: 15000 }]),
  P('p1', 'rahim', 'ডিম ও দুধ', 30000, '2026-11-16'),
];
const rm = (id, name, p, b) => ({ id, name, role: id === 'rahim' ? 'admin' : 'member', left: false, purchased: p, share: 50000, sent: 0, received: 0, balance: b });
const report = { month: '2026-11-01', status: 'open', total: 200000, members: [rm('rahim', 'রহিম', 30000, -20000), rm('karim', 'করিম', 70000, 20000), rm('abdul', 'আব্দুল', 50000, 0), rm('salam', 'সালাম', 50000, 0)],
  settlements: [{ from: 'rahim', from_name: 'রহিম', to: 'karim', to_name: 'করিম', amount: 20000 }], purchases: [],
  payments: [{ id: 'y1', from: 'rahim', from_name: 'রহিম', to: 'karim', to_name: 'করিম', amount: 10000, status: 'pending', created_at: '2026-11-19T10:00:00Z' }], pending_payments: 1, pending_corrections: 0 };
const ev = ['রহিম করিমকে ১০০ টাকা পরিশোধ করেছেন (নিশ্চিতের অপেক্ষায়)।', 'সালাম ৫০০ টাকার সবজি ও ফল কিনেছেন।', 'আব্দুল ৫০০ টাকার মাছ কিনেছেন।', 'করিম ৭০০ টাকার চাল, ডাল ও তেল কিনেছেন।', 'রহিম ৩০০ টাকার ডিম ও দুধ কিনেছেন।', 'সালাম গ্রুপে যোগ দিয়েছেন।']
  .map((m, i) => ({ id: 'e' + i, group_id: 'g1', message: m, created_at: new Date(Date.now() - i * 3600e3 * 5).toISOString() }));
const T = {
  members: [{ ...members[0], user_id: UID, groups: G }], profiles: { id: UID, name: 'রহিম', push_enabled: false },
};
const tables = { members, pauses: [], purchases, events: ev };
function chain(table) {
  const c = { select: () => c, eq: () => c, is: () => c, order: () => c, limit: () => c, maybeSingle: () => c, single: () => c,
    then: (res) => { let d = tables[table] || [];
      if (table === 'members') { d = (c._mine ? T.members : members); }
      if (table === 'profiles') d = T.profiles;
      return Promise.resolve({ data: d, error: null }).then(res); } };
  const origEq = c.eq; c.eq = (col, v) => { if (table === 'members' && col === 'user_id') c._mine = true; return c; };
  return c;
}
export const supabase = {
  from: chain,
  auth: { getSession: async () => ({ data: { session: { user: { id: UID, email: 'rahim@example.com' } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => {} },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}, rpc: async () => ({ data: null, error: null }),
};
const accessLinks = [];
export async function rpc(name, args = {}) {
  if (name === 'pending_access_links') return [...accessLinks];
  if (name === 'issue_access_link') {
    const token = crypto.randomUUID();
    const target = members.find(m => m.id === args.p_target);
    accessLinks.push({token, label: target?.display_name || args.p_label, purpose: target ? 'restore' : 'join'});
    return token;
  }
  if (name === 'cancel_access_link') {
    const index = accessLinks.findIndex(link => link.token === args.p_token);
    if (index >= 0) accessLinks.splice(index, 1);
    return;
  }
  if (name === 'month_report') return report;
  if (name === 'group_months') return [{ month: '2026-11-01', finalized: false }];
  if (name === 'list_corrections') return [];
  if (name === 'preview_split') return members.map((m) => ({ member_id: m.id, name: m.display_name, share: 12500 }));
  return null;
}
export const q = async (b) => (await b).data;
