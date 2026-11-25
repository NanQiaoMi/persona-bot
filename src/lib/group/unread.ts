/** 你在某个群看过的最后一条消息之后，群友发了几条（自己的不算）；没看过这个群时不显示未读 */
export function countUnreadAfter(
  messages: Array<{ id: string; role: string }>,
  seenId: string | undefined
): number {
  if (!seenId) return 0;
  const idx = messages.findIndex((m) => m.id === seenId);
  const after = idx === -1 ? messages : messages.slice(idx + 1);
  return Math.min(99, after.filter((m) => m.role !== 'user').length);
}
