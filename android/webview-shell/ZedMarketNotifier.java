package app.zedmarket.twa;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.ContextCompat;

public final class ZedMarketNotifier {
    public static final String CHANNEL_MESSAGES = "zedmarket_messages";
    public static final String ACTION_REPLY = "app.zedmarket.twa.REPLY";
    public static final String KEY_REPLY = "zm_reply_text";
    public static final String EXTRA_OTHER_USER_ID = "otherUserId";
    public static final String EXTRA_URL = "url";
    public static final String EXTRA_TITLE = "title";
    static final String KEY_LAUNCH_URI =
            "app.zedmarket.twa.ZedMarketWebViewActivity.LAUNCH_URL";

    public static volatile boolean appVisible;

    private ZedMarketNotifier() {}

    public static boolean hasPermission(Context context) {
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(
                    context, Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
        }
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return manager == null || manager.areNotificationsEnabled();
    }

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_MESSAGES,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("New chat messages and listing alerts");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    public static Uri resolveUrl(String url) {
        if (url == null || url.trim().isEmpty()) {
            return Uri.parse("https://zedmarket.app/chat-list.html");
        }
        String trimmed = url.trim();
        if (trimmed.startsWith("/")) {
            return Uri.parse("https://zedmarket.app" + trimmed);
        }
        Uri parsed = Uri.parse(trimmed);
        if (parsed.getHost() != null
                && parsed.getHost().toLowerCase().endsWith("zedmarket.app")
                && parsed.getScheme() != null) {
            return parsed;
        }
        return Uri.parse("https://zedmarket.app/chat-list.html");
    }

    public static void show(Context context, String title, String body, String url) {
        show(context, title, body, url, "", "");
    }

    public static void show(
            Context context,
            String title,
            String body,
            String url,
            String type,
            String otherUserId
    ) {
        if (!hasPermission(context)) return;
        ensureChannel(context);
        Uri target = resolveUrl(url);
        String safeTitle = title == null || title.trim().isEmpty() ? "ZedMarket" : title.trim();
        String safeBody = body == null ? "" : body.trim();
        boolean chat = "chat".equals(type)
                && otherUserId != null
                && !otherUserId.trim().isEmpty();
        String peer = chat ? otherUserId.trim() : "";
        int notifyId = chat
                ? notifyIdForChat(peer)
                : (int) (System.currentTimeMillis() & 0x7fffffff);
        if (notifyId == 0) notifyId = 1;

        Intent tap = new Intent(context, ZedMarketWebViewActivity.class);
        tap.setAction(Intent.ACTION_VIEW);
        tap.setData(target);
        tap.putExtra(KEY_LAUNCH_URI, target);
        tap.putExtra("url", target.toString());
        tap.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int tapFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) {
            tapFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pending = PendingIntent.getActivity(context, notifyId, tap, tapFlags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= 26) {
            builder = new Notification.Builder(context, CHANNEL_MESSAGES);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_HIGH);
            builder.setDefaults(Notification.DEFAULT_ALL);
        }
        builder.setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle(safeTitle)
                .setContentText(safeBody)
                .setAutoCancel(true)
                .setContentIntent(pending)
                .setCategory(Notification.CATEGORY_MESSAGE);
        if (Build.VERSION.SDK_INT >= 24 && chat) {
            Notification.MessagingStyle style = new Notification.MessagingStyle("Me");
            style.setConversationTitle(safeTitle);
            boolean fromMe = safeBody.startsWith("You: ");
            String messageText = fromMe ? safeBody.substring(5).trim() : safeBody;
            String sender = fromMe ? "Me" : safeTitle;
            style.addMessage(messageText, System.currentTimeMillis(), sender);
            builder.setStyle(style);
        } else {
            builder.setStyle(new Notification.BigTextStyle().bigText(safeBody));
        }
        if (chat) {
            Notification.Action reply = buildReplyAction(
                    context, notifyId, peer, target.toString(), safeTitle);
            if (reply != null) {
                builder.addAction(reply);
            }
        }
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(notifyId, builder.build());
        }
    }

    static int notifyIdForChat(String otherUserId) {
        int id = ("chat-" + otherUserId).hashCode() & 0x7fffffff;
        return id == 0 ? 1 : id;
    }

    private static Notification.Action buildReplyAction(
            Context context,
            int notifyId,
            String otherUserId,
            String url,
            String title
    ) {
        Intent replyIntent = new Intent(context, ZedMarketReplyReceiver.class);
        replyIntent.setAction(ACTION_REPLY);
        replyIntent.putExtra(EXTRA_OTHER_USER_ID, otherUserId);
        replyIntent.putExtra(EXTRA_URL, url);
        replyIntent.putExtra(EXTRA_TITLE, title);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 31) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        PendingIntent replyPending = PendingIntent.getBroadcast(
                context, notifyId, replyIntent, flags);
        RemoteInput input = new RemoteInput.Builder(KEY_REPLY)
                .setLabel("Reply")
                .build();
        Notification.Action.Builder action = new Notification.Action.Builder(
                android.R.drawable.ic_menu_send,
                "Reply",
                replyPending);
        action.addRemoteInput(input);
        return action.build();
    }
}
