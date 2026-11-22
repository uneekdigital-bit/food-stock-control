self.addEventListener('push', event => {
  const message = event.data.json();
  event.waitUntil(self.registration.showNotification(message.title,{
    body:message.body, tag:'qa-'+message.batch, data:{batch:message.batch}
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/?qaBatch='+encodeURIComponent(event.notification.data.batch)));
});
