// One unfinished new purchase per membership on this device.
export function readPurchaseDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    const draft = JSON.parse(raw);
    if (draft && ['items', 'total'].includes(draft.mode)
      && ['token', 'date', 'buyer', 'desc', 'total'].every(field => typeof draft[field] === 'string')
      && Array.isArray(draft.items) && draft.items.length
      && draft.items.every(item => item && typeof item.name === 'string' && typeof item.amount === 'string')) {
      return { raw, draft };
    }
    return { raw, draft: null };
  } catch { /* Storage may be unavailable or the stored entry may be incomplete. */ }
  return { raw: null, draft: null };
}
