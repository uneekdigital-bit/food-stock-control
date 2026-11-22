module.exports = function pushEndpoint(subscription) {
  if (!subscription?.keys?.auth || !subscription.keys.p256dh) return null;
  let url;
  try { url = new URL(subscription.endpoint); } catch { return null; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  const apple = url.hostname.endsWith('.push.apple.com');
  const chrome = url.hostname === 'fcm.googleapis.com' && /^\/(?:fcm\/send|wp)\/.+/.test(url.pathname);
  return apple || chrome ? url.href : null;
};
