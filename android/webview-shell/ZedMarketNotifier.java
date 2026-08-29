package app.zedmarket.twa;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.ContextCompat;

public final class ZedMarketNotifier {
    public static final String CHANNEL_MESSAGES = "zedmarket_messages";
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
        if (!hasPermission(context)) return;
        ensureChannel(context);
        Uri target = resolveUrl(url);
        Intent tap = new Intent(context, ZedMarketWebViewActivity.class);
        tap.setAction(Intent.ACTION_VIEW);
        tap.setData(target);
        tap.putExtra(KEY_LAUNCH_URI, target);
        tap.putExtra("url", target.toString());
        tap.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        int notifyId = (int) (System.currentTimeMillis() & 0x7fffffff);
        PendingIntent pending = PendingIntent.getActivity(context, notifyId, tap, flags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= 26) {
            builder = new Notification.Builder(context, CHANNEL_MESSAGES);
        } else {
            builder = new Notification.Builder(context);
            builder.setPriority(Notification.PRIORITY_HIGH);
            builder.setDefaults(Notification.DEFAULT_ALL);
        }
        Notification notification = builder
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle(title == null || title.trim().isEmpty() ? "ZedMarket" : title.trim())
                .setContentText(body == null ? "" : body.trim())
                .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body.trim()))
                .setAutoCancel(true)
                .setContentIntent(pending)
                .build();
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(notifyId, notification);
        }
    }
}
