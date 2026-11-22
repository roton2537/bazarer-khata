// Pure queue helpers; the persisted ledger journal is always isolated by Supabase user.
export const queueKey = (userId, kind = 'pending') => {
  if (typeof userId !== 'string' || !/^[a-f0-9-]{36}$/i.test(userId)) throw new Error('অফলাইন হিসাবের ব্যবহারকারী যাচাই করা যায়নি।');
  return 'bk_queue_v2_' + kind + '_' + userId;
};
export const sameOwner = (entry, userId) => entry?.userId === userId && entry?.args && typeof entry.args.p_group === 'string';
export const queueable = (operation) => operation === 'add_purchase' || operation === 'add_payment';
export const legacyQueueKey = 'bk_queue_v1';
