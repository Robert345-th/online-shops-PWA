/*
 * Full-screen WebView for Play Store testing app with:
 * - App location permission (one Allow / Don't allow)
 * - System "Turn on location" dialog when GPS is off
 * - Microphone / camera permission for voice notes & selfie
 * - Photo file picker
 */
package app.zedmarket.twa;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.IntentSender;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.Priority;
import com.google.androidbrowserhelper.trusted.LauncherActivityMetadata;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ZedMarketWebViewActivity extends Activity {
    private static final String TAG = "ZedMarketWebView";
    private static final int REQ_LOCATION = 9001;
    private static final int REQ_FILE_CHOOSER = 9002;
    private static final int REQ_TURN_ON_LOCATION = 9003;
    private static final int REQ_MEDIA = 9004;
    private static final int REQ_NOTIFY = 9005;
    private static final String PREFS_LOC = "zm_loc_perm";
    private static final String KEY_LOC_ASKED = "asked";
    private static final String KEY_LOC_DENY_COUNT = "deny_count";
    private static final String KEY_NOTIFY_ASKED = "notify_asked";
    private static final String KEY_NOTIFY_WELCOME = "notify_welcome_shown";
    private static final String KEY_FCM_TOKEN = "fcm_token";
    private static final String CHANNEL_MESSAGES = "zedmarket_messages";
    private static final int NOTIFY_ID_BASE = 7100;
    private static final long SILENT_PERM_DENY_MS = 400L;
    private static final int FALLBACK_COLOR = Color.parseColor("#111111");

    private static final String KEY_PREFIX =
            "app.zedmarket.twa.ZedMarketWebViewActivity.";
    private static final String KEY_LAUNCH_URI = KEY_PREFIX + "LAUNCH_URL";
    private static final String KEY_NAVIGATION_BAR_COLOR = KEY_PREFIX + "NAV_BAR_COLOR";
    private static final String KEY_STATUS_BAR_COLOR = KEY_PREFIX + "STATUS_BAR_COLOR";
    private static final String KEY_EXTRA_ORIGINS = KEY_PREFIX + "EXTRA_ORIGINS";

    private Uri mLaunchUrl;
    private int mStatusBarColor = FALLBACK_COLOR;
    private WebView mWebView;
    private final List<Uri> mExtraOrigins = new ArrayList<>();
    private View mFullScreenView;
    private WebChromeClient.CustomViewCallback mCustomViewCallback;
    private int mOriginalOrientation;

    private String mPendingGeoOrigin;
    private GeolocationPermissions.Callback mPendingGeoCallback;
    private final List<String> mExtraGeoOrigins = new ArrayList<>();
    private final List<GeolocationPermissions.Callback> mExtraGeoCallbacks = new ArrayList<>();
    private boolean mAwaitingAppLocJs;
    private boolean mRetryLocationAfterSettings;
    private ValueCallback<Uri[]> mFilePathCallback;
    private PermissionRequest mPendingPermissionRequest;
    /** After "No thanks", block more Turn on / Location Accuracy dialogs for a short window. */
    private long mDeclinedTurnOnAtMs;
    /** Prevents stacking multiple Location Accuracy dialogs from concurrent GPS requests. */
    private boolean mTurnOnDialogShowing;
    private boolean mSettingsCheckInFlight;
    private volatile boolean mUserLocRequestActive;
    private volatile boolean mAskedRuntimePermissionThisFlow;
    private volatile boolean mStartedTurnOnThisFlow;
    private volatile long mIgnoreGeoRetryUntilMs;
    private int mSessionLocDenyCount;
    private boolean mRetryingFromInAppAllow;
    private long mOpenedAppSettingsAt;
    private long mLocPermRequestedAt;
    private boolean mNotifyDialogShowing;
    private boolean mNotifyPermissionInFlight;
    private long mLastNotifyAskAt;
    private long mStoppedAt;
    private boolean mAskedNotifyThisOpen;
    private int mNextNotifyId = NOTIFY_ID_BASE;
    private long mLastBackAt;
    private final Handler mMainHandler = new Handler(Looper.getMainLooper());
    private final Runnable mAskNotifyRunnable = this::maybeAskNotificationPermission;

    public static Intent createLaunchIntent(
            Context context,
            Uri launchUrl,
            LauncherActivityMetadata metadata) {
        Intent intent = new Intent(context, ZedMarketWebViewActivity.class);
        intent.putExtra(KEY_LAUNCH_URI, launchUrl);
        intent.putExtra(KEY_STATUS_BAR_COLOR, safeColor(context, metadata.statusBarColorId));
        intent.putExtra(KEY_NAVIGATION_BAR_COLOR, safeColor(context, metadata.navigationBarColorId));
        if (metadata.additionalTrustedOrigins != null) {
            intent.putStringArrayListExtra(KEY_EXTRA_ORIGINS,
                    new ArrayList<>(metadata.additionalTrustedOrigins));
        }
        return intent;
    }

    private static int safeColor(Context context, int colorResId) {
        try {
            if (colorResId != 0) {
                return ContextCompat.getColor(context, colorResId);
            }
        } catch (Exception ignored) {
            // Fall through to default brand color.
        }
        return FALLBACK_COLOR;
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

        try {
            mLaunchUrl = getIntent().getParcelableExtra(KEY_LAUNCH_URI);
            Uri notifyData = getIntent().getData();
            if (notifyData != null && isZedMarketHost(notifyData)) {
                mLaunchUrl = notifyData;
            } else {
                String fcmUrl = getIntent().getStringExtra("url");
                if (fcmUrl != null && !fcmUrl.trim().isEmpty()) {
                    mLaunchUrl = resolveNotifyUrl(fcmUrl);
                }
            }
            if (mLaunchUrl == null || mLaunchUrl.getScheme() == null
                    || !"https".equalsIgnoreCase(mLaunchUrl.getScheme())) {
                mLaunchUrl = Uri.parse("https://zedmarket.app/?utm_source=android");
            }

            mStatusBarColor = getIntent().getIntExtra(KEY_STATUS_BAR_COLOR, FALLBACK_COLOR);

            getWindow().setSoftInputMode(
                    WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
                            | WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                try {
                    getWindow().setStatusBarColor(mStatusBarColor);
                    getWindow().setNavigationBarColor(Color.TRANSPARENT);
                } catch (Exception ignored) {
                    // Some OEMs reject status/nav bar color changes.
                }
            }

            if (getIntent().hasExtra(KEY_EXTRA_ORIGINS)) {
                List<String> extraOrigins = getIntent().getStringArrayListExtra(KEY_EXTRA_ORIGINS);
                if (extraOrigins != null) {
                    for (String extraOrigin : extraOrigins) {
                        Uri extraOriginUri = Uri.parse(extraOrigin);
                        if (extraOriginUri != null
                                && "https".equalsIgnoreCase(extraOriginUri.getScheme())) {
                            mExtraOrigins.add(extraOriginUri);
                        }
                    }
                }
            }

            mWebView = new WebView(this);
            mWebView.addJavascriptInterface(new LocationBridge(), "ZedMarketLocation");
            mWebView.setWebViewClient(createWebViewClient());
            mWebView.setWebChromeClient(createWebChromeClient());
            setupWebSettings(mWebView.getSettings());
            markAsPlayStoreWebView(mWebView);

            setContentView(mWebView, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));
            hideSystemNavigation();
            ZedMarketNotifier.ensureChannel(this);
            fetchFcmToken();

            if (Build.VERSION.SDK_INT >= 33) {
                getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                        OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                        this::onSystemBack);
            }

            if (savedInstanceState != null) {
                mWebView.restoreState(savedInstanceState);
                return;
            }

            Map<String, String> headers = new HashMap<>();
            headers.put("Referer", "android-app://" + getPackageName() + "/");
            mWebView.loadUrl(mLaunchUrl.toString(), headers);
        } catch (Exception ex) {
            Log.e(TAG, "Failed to start WebView", ex);
            Toast.makeText(this, "Could not open ZedMarket. Update Android System WebView.", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        ZedMarketNotifier.appVisible = true;
        if (mWebView != null) {
            mWebView.onResume();
        }
        hideSystemNavigation();
        openNotificationUrl(getIntent());
        if (mRetryLocationAfterSettings) {
            if (mOpenedAppSettingsAt > 0
                    && SystemClock.elapsedRealtime() - mOpenedAppSettingsAt < 800L) {
                return;
            }
            mRetryLocationAfterSettings = false;
            mOpenedAppSettingsAt = 0;
            if (hasLocationPermission()) {
                ensureSystemLocationOnThenGrant();
            } else {
                denyInAppLocation();
            }
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemNavigation();
        }
    }

    /** Hide the 3 Android buttons (Back / Home / Recents) while ZedMarket is open. */
    private void hideSystemNavigation() {
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.hide(WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(
                            WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                View decor = getWindow().getDecorView();
                decor.setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            }
        } catch (Exception ignored) {
            // Some OEMs ignore immersive flags.
        }
        markImmersiveInWeb();
    }

    private void markImmersiveInWeb() {
        if (mWebView == null) {
            return;
        }
        mWebView.post(() -> mWebView.evaluateJavascript(
                "(function(){try{document.documentElement.classList.add('play-store-immersive');}catch(e){}})();",
                null));
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (mStoppedAt > 0
                && SystemClock.elapsedRealtime() - mStoppedAt > 1500L
                && SystemClock.elapsedRealtime() - mLastNotifyAskAt > 4000L) {
            mAskedNotifyThisOpen = false;
            maybeAskNotificationPermission();
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openNotificationUrl(intent);
    }

    @Override
    protected void onStop() {
        mStoppedAt = SystemClock.elapsedRealtime();
        super.onStop();
    }

    @Override
    protected void onPause() {
        ZedMarketNotifier.appVisible = false;
        super.onPause();
        if (mWebView != null) {
            mWebView.onPause();
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (mWebView != null) {
            mWebView.saveState(outState);
        }
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
    }

    private void onSystemBack() {
        if (!handleWebBack()) {
            finish();
        }
    }

    @Override
    public void onBackPressed() {
        if (!handleWebBack()) {
            super.onBackPressed();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (handleWebBack()) {
                return true;
            }
            return super.onKeyDown(keyCode, event);
        }
        return super.onKeyDown(keyCode, event);
    }

    private boolean isHomeUrl(String url) {
        if (url == null || url.isEmpty()) {
            return true;
        }
        Uri uri = Uri.parse(url);
        if (!isZedMarketHost(uri)) {
            return false;
        }
        String path = uri.getPath();
        return path == null || path.isEmpty() || "/".equals(path) || "/index.html".equals(path);
    }

    private void goHome() {
        if (mWebView == null) {
            return;
        }
        String home = mLaunchUrl != null
                ? mLaunchUrl.toString()
                : "https://zedmarket.app/?utm_source=android";
        mWebView.loadUrl(home);
    }

    private void hideCustomViewIfOpen() {
        if (mFullScreenView == null) {
            return;
        }
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        ViewGroup parent = (ViewGroup) mFullScreenView.getParent();
        if (parent != null) {
            parent.removeView(mFullScreenView);
        }
        mFullScreenView = null;
        if (mCustomViewCallback != null) {
            mCustomViewCallback.onCustomViewHidden();
            mCustomViewCallback = null;
        }
        setRequestedOrientation(mOriginalOrientation);
        hideSystemNavigation();
    }

    /** True if back was consumed (stay in app). False means the activity should exit. */
    private boolean handleWebBack() {
        long now = SystemClock.elapsedRealtime();
        if (mLastBackAt > 0 && now - mLastBackAt < 400L) {
            return true;
        }
        mLastBackAt = now;
        if (mFullScreenView != null) {
            hideCustomViewIfOpen();
            return true;
        }
        if (mWebView == null) {
            return false;
        }
        if (mWebView.canGoBack()) {
            mWebView.goBack();
            return true;
        }
        if (isHomeUrl(mWebView.getUrl())) {
            return false;
        }
        mWebView.evaluateJavascript(
                "(function(){try{if(window.__zmHandleBack)return!!window.__zmHandleBack();return false;}catch(e){return false;}})();",
                value -> {
                    boolean handled = "true".equals(value) || "\"true\"".equals(value);
                    if (handled) {
                        return;
                    }
                    runOnUiThread(() -> {
                        if (mWebView == null) {
                            finish();
                            return;
                        }
                        if (isHomeUrl(mWebView.getUrl())) {
                            finish();
                        } else {
                            goHome();
                        }
                    });
                });
        return true;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_TURN_ON_LOCATION) {
            mTurnOnDialogShowing = false;
            mSettingsCheckInFlight = false;
            if (resultCode == Activity.RESULT_OK) {
                mDeclinedTurnOnAtMs = 0;
                if (mPendingGeoCallback != null) {
                    finishGeoGrant(true);
                } else {
                    showLocationNotice(getString(R.string.loc_settings_enabled_retry));
                }
            } else {
                mDeclinedTurnOnAtMs = SystemClock.elapsedRealtime();
                if (mWebView != null) {
                    mWebView.post(() -> {
                        finishGeoGrant(false);
                        notifyWebLocationCancelled();
                        mWebView.requestFocus();
                    });
                } else {
                    finishGeoGrant(false);
                    notifyWebLocationCancelled();
                }
            }
            return;
        }
        if (requestCode == REQ_FILE_CHOOSER) {
            if (mFilePathCallback == null) {
                return;
            }
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                ClipData clipData = data.getClipData();
                if (clipData != null && clipData.getItemCount() > 0) {
                    results = new Uri[clipData.getItemCount()];
                    for (int i = 0; i < clipData.getItemCount(); i++) {
                        results[i] = clipData.getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                } else {
                    results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                }
            }
            mFilePathCallback.onReceiveValue(results);
            mFilePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == REQ_MEDIA) {
            PermissionRequest pending = mPendingPermissionRequest;
            mPendingPermissionRequest = null;
            if (pending == null) {
                return;
            }
            boolean granted = false;
            for (int result : grantResults) {
                if (result == PackageManager.PERMISSION_GRANTED) {
                    granted = true;
                    break;
                }
            }
            if (granted) {
                grantWebMediaPermissions(pending);
            } else {
                pending.deny();
                Toast.makeText(
                        this,
                        "Allow microphone to send voice notes",
                        Toast.LENGTH_LONG
                ).show();
            }
            return;
        }

        if (requestCode == REQ_NOTIFY) {
            boolean notifyGranted = false;
            for (int result : grantResults) {
                if (result == PackageManager.PERMISSION_GRANTED) {
                    notifyGranted = true;
                    break;
                }
            }
            if (notifyGranted) {
                notifyWebSubscribePush();
                fetchFcmToken();
                showWelcomeNotification();
            } else {
                markNotifyAsked();
            }
            mNotifyPermissionInFlight = false;
            continueLocationAfterNotify();
            return;
        }

        if (requestCode != REQ_LOCATION) {
            return;
        }

        boolean granted = false;
        for (int result : grantResults) {
            if (result == PackageManager.PERMISSION_GRANTED) {
                granted = true;
                break;
            }
        }

        if (granted) {
            mRetryingFromInAppAllow = false;
            mLocPermRequestedAt = 0;
            persistLocationDenyCount(0);
            mSessionLocDenyCount = 0;
            if (mAwaitingAppLocJs) {
                mAwaitingAppLocJs = false;
                notifyAppLocationPermission(true);
            }
            ensureSystemLocationOnThenGrant();
            return;
        }

        mAwaitingAppLocJs = false;
        boolean silentDeny = mLocPermRequestedAt > 0
                && (SystemClock.elapsedRealtime() - mLocPermRequestedAt) < SILENT_PERM_DENY_MS;
        mLocPermRequestedAt = 0;
        if (mRetryingFromInAppAllow) {
            mRetryingFromInAppAllow = false;
            denyInAppLocation();
            return;
        }
        if (silentDeny) {
            mSessionLocDenyCount = Math.max(2, mSessionLocDenyCount);
            notifyWebLocationBlocked();
        } else {
            mSessionLocDenyCount++;
            notifyWebLocationDenied();
        }
        denyInAppLocation();
    }

    private boolean isTrustedWebOrigin(Uri origin) {
        if (origin == null || origin.getHost() == null) {
            return false;
        }
        if (mLaunchUrl != null && uriOriginsMatch(mLaunchUrl, origin)) {
            return true;
        }
        if (matchExtraOrigins(origin)) {
            return true;
        }
        String host = origin.getHost();
        return "zedmarket.app".equalsIgnoreCase(host)
                || (host != null && host.toLowerCase().endsWith(".zedmarket.app"));
    }

    private boolean hasRecordAudioPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;
    }

    @RequiresApi(api = Build.VERSION_CODES.LOLLIPOP)
    private void handleMediaPermissionRequest(PermissionRequest request) {
        if (request == null) {
            return;
        }
        if (!isTrustedWebOrigin(Uri.parse(String.valueOf(request.getOrigin())))) {
            request.deny();
            return;
        }

        boolean needAudio = false;
        boolean needCamera = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                needAudio = true;
            } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                needCamera = true;
            }
        }

        List<String> missing = new ArrayList<>();
        if (needAudio && !hasRecordAudioPermission()) {
            missing.add(Manifest.permission.RECORD_AUDIO);
        }
        if (needCamera && !hasCameraPermission()) {
            missing.add(Manifest.permission.CAMERA);
        }

        if (missing.isEmpty()) {
            grantWebMediaPermissions(request);
            return;
        }

        if (mPendingPermissionRequest != null) {
            mPendingPermissionRequest.deny();
        }
        mPendingPermissionRequest = request;
        ActivityCompat.requestPermissions(
                this,
                missing.toArray(new String[0]),
                REQ_MEDIA
        );
    }

    @RequiresApi(api = Build.VERSION_CODES.LOLLIPOP)
    private void grantWebMediaPermissions(PermissionRequest request) {
        if (request == null) {
            return;
        }
        List<String> granted = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && hasRecordAudioPermission()) {
                granted.add(resource);
            } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && hasCameraPermission()) {
                granted.add(resource);
            } else if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(resource)) {
                granted.add(resource);
            }
        }
        if (granted.isEmpty()) {
            request.deny();
            return;
        }
        request.grant(granted.toArray(new String[0]));
    }

    private void invokeGeoCallback(
            GeolocationPermissions.Callback cb, String origin, boolean allow) {
        if (cb == null || origin == null) {
            return;
        }
        try {
            cb.invoke(origin, allow, false);
        } catch (Exception e) {
            Log.e(TAG, "Geolocation callback failed", e);
        }
    }

    private void finishGeoGrant(boolean allow) {
        GeolocationPermissions.Callback cb = mPendingGeoCallback;
        String origin = mPendingGeoOrigin;
        mPendingGeoCallback = null;
        mPendingGeoOrigin = null;
        List<GeolocationPermissions.Callback> extras = new ArrayList<>(mExtraGeoCallbacks);
        List<String> extraOrigins = new ArrayList<>(mExtraGeoOrigins);
        mExtraGeoCallbacks.clear();
        mExtraGeoOrigins.clear();
        invokeGeoCallback(cb, origin, allow);
        for (int i = 0; i < extras.size() && i < extraOrigins.size(); i++) {
            invokeGeoCallback(extras.get(i), extraOrigins.get(i), allow);
        }
    }

    private void notifyAppLocationPermission(boolean granted) {
        if (mWebView == null) {
            return;
        }
        String flag = granted ? "true" : "false";
        mWebView.post(() -> mWebView.evaluateJavascript(
                "(function(){try{var f=window.__zmAppLocCb;window.__zmAppLocCb=null;if(f)f("
                        + flag
                        + ");}catch(e){}})();",
                null));
    }

    /** Kill in-flight GPS immediately so "Getting location…" does not sit for ~20s. */
    private void notifyWebLocationCancelled() {
        if (mWebView == null) {
            return;
        }
        mWebView.evaluateJavascript(
                "(function(){try{"
                        + "if(window.__zmCancelLocation)window.__zmCancelLocation();"
                        + "else window.dispatchEvent(new CustomEvent('zm-location-cancelled'));"
                        + "}catch(e){}})();",
                null);
    }

    private void notifyWebLocationBlocked() {
        if (mWebView == null) {
            return;
        }
        mWebView.evaluateJavascript(
                "(function(){try{window.dispatchEvent(new CustomEvent('zm-location-blocked'));}catch(e){}})();",
                null);
    }

    private void notifyWebLocationDenied() {
        if (mWebView == null) {
            return;
        }
        mWebView.evaluateJavascript(
                "(function(){try{window.dispatchEvent(new CustomEvent('zm-location-denied'));}catch(e){}})();",
                null);
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private int locationDenyCount() {
        return getSharedPreferences(PREFS_LOC, MODE_PRIVATE).getInt(KEY_LOC_DENY_COUNT, 0);
    }

    private void persistLocationDenyCount(int count) {
        getSharedPreferences(PREFS_LOC, MODE_PRIVATE).edit()
                .putBoolean(KEY_LOC_ASKED, true)
                .putInt(KEY_LOC_DENY_COUNT, count)
                .commit();
    }

    private boolean systemWillNotShowLocationDialog() {
        return !hasLocationPermission() && mSessionLocDenyCount >= 2;
    }

    private void denyInAppLocation() {
        mAwaitingAppLocJs = false;
        finishGeoGrant(false);
        notifyWebLocationCancelled();
        notifyAppLocationPermission(false);
        if (mWebView != null) {
            mWebView.requestFocus();
        }
    }

    private boolean isSystemLocationEnabled() {
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) {
                return true;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return lm.isLocationEnabled();
            }
            return lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
                    || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        } catch (Exception e) {
            return true;
        }
    }

    /**
     * After Allow, show "Turn on location" if GPS is off. Do not show Allow again.
     */
    private void ensureSystemLocationOnThenGrant() {
        if (mPendingGeoCallback == null || mPendingGeoOrigin == null) {
            return;
        }
        if (isSystemLocationEnabled()) {
            finishGeoGrant(true);
            return;
        }
        if (mStartedTurnOnThisFlow) {
            finishGeoGrant(false);
            notifyWebLocationCancelled();
            return;
        }
        if (mTurnOnDialogShowing || mSettingsCheckInFlight) {
            return;
        }

        mSettingsCheckInFlight = true;
        try {
            LocationRequest request = new LocationRequest.Builder(
                    Priority.PRIORITY_BALANCED_POWER_ACCURACY, 10000L)
                    .setMinUpdateIntervalMillis(5000L)
                    .build();

            LocationSettingsRequest settingsRequest = new LocationSettingsRequest.Builder()
                    .addLocationRequest(request)
                    .setAlwaysShow(true)
                    .build();

            LocationServices.getSettingsClient(this)
                    .checkLocationSettings(settingsRequest)
                    .addOnSuccessListener(this, response -> {
                        mSettingsCheckInFlight = false;
                        finishGeoGrant(true);
                    })
                    .addOnFailureListener(this, e -> {
                        mSettingsCheckInFlight = false;
                        if (mPendingGeoCallback == null) {
                            finishGeoGrant(false);
                            return;
                        }
                        if (mTurnOnDialogShowing) {
                            return;
                        }
                        if (e instanceof ResolvableApiException) {
                            try {
                                mStartedTurnOnThisFlow = true;
                                mTurnOnDialogShowing = true;
                                ((ResolvableApiException) e)
                                        .startResolutionForResult(this, REQ_TURN_ON_LOCATION);
                            } catch (IntentSender.SendIntentException ex) {
                                mTurnOnDialogShowing = false;
                                finishGeoGrant(false);
                                notifyWebLocationCancelled();
                            }
                        } else if (!isSystemLocationEnabled()) {
                            finishGeoGrant(false);
                            notifyWebLocationCancelled();
                        } else {
                            finishGeoGrant(true);
                        }
                    });
        } catch (Exception e) {
            mSettingsCheckInFlight = false;
            Log.e(TAG, "Location settings check failed", e);
            if (!isSystemLocationEnabled()) {
                finishGeoGrant(false);
                notifyWebLocationCancelled();
            } else {
                finishGeoGrant(true);
            }
        }
    }

    private void openLocationSourceSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
            showLocationNotice(getString(R.string.loc_turn_on_settings));
        } catch (ActivityNotFoundException ex) {
            openAppLocationSettings(false);
        }
        finishGeoGrant(false);
    }

    private void openAppLocationSettings(boolean retryAfter) {
        mRetryLocationAfterSettings = retryAfter;
        mOpenedAppSettingsAt = SystemClock.elapsedRealtime();
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
            showLocationNotice(getString(R.string.loc_open_settings));
        } catch (ActivityNotFoundException ex) {
            Log.e(TAG, "Could not open app settings", ex);
            mRetryLocationAfterSettings = false;
            mOpenedAppSettingsAt = 0;
        }
    }

    private void showLocationNotice(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private void handleGeolocationPrompt(String origin, GeolocationPermissions.Callback callback) {
        // Chromium retries getCurrentPosition after ~20s. That re-opens Allow / Turn on.
        if (!mUserLocRequestActive
                && mIgnoreGeoRetryUntilMs > 0
                && SystemClock.elapsedRealtime() < mIgnoreGeoRetryUntilMs) {
            invokeGeoCallback(callback, origin, false);
            return;
        }
        if (mTurnOnDialogShowing || mPendingGeoCallback != null) {
            mExtraGeoOrigins.add(origin);
            mExtraGeoCallbacks.add(callback);
            return;
        }

        mPendingGeoOrigin = origin;
        mPendingGeoCallback = callback;

        if (!hasLocationPermission()) {
            if (mAskedRuntimePermissionThisFlow) {
                finishGeoGrant(false);
                return;
            }
            if (mNotifyPermissionInFlight || mNotifyDialogShowing) {
                return;
            }
            mAskedRuntimePermissionThisFlow = true;
            if (systemWillNotShowLocationDialog()) {
                notifyWebLocationBlocked();
                denyInAppLocation();
                return;
            }
            mLocPermRequestedAt = SystemClock.elapsedRealtime();
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{ Manifest.permission.ACCESS_COARSE_LOCATION },
                    REQ_LOCATION);
            return;
        }

        ensureSystemLocationOnThenGrant();
    }

    private void injectLocationHelper(WebView view) {
        // Always refresh hook so cancel works even if an older hook was already installed.
        view.evaluateJavascript(
                "(function(){"
                        + "var g=navigator.geolocation;"
                        + "if(!g)return;"
                        + "if(!window.__zmGeoOrig)window.__zmGeoOrig=g.getCurrentPosition.bind(g);"
                        + "var gp=window.__zmGeoOrig;"
                        + "var pending=[];"
                        + "g.getCurrentPosition=function(ok,err,opt){"
                        + "var done=false;"
                        + "function finishErr(e){"
                        + "if(done)return;done=true;"
                        + "var i=pending.indexOf(finishErr);if(i>=0)pending.splice(i,1);"
                        + "try{ZedMarketLocation.onGeolocationError(e&&e.code!=null?e.code:-1);}catch(x){}"
                        + "if(err)err(e);"
                        + "}"
                        + "pending.push(finishErr);"
                        + "gp(function(p){"
                        + "if(done)return;done=true;"
                        + "var i=pending.indexOf(finishErr);if(i>=0)pending.splice(i,1);"
                        + "if(ok)ok(p);"
                        + "},finishErr,opt||{});"
                        + "};"
                        + "window.__zmCancelLocation=function(){"
                        + "var list=pending.slice();pending.length=0;"
                        + "for(var i=0;i<list.length;i++){try{list[i]({code:1,message:'cancelled'});}catch(e){}}"
                        + "try{window.dispatchEvent(new CustomEvent('zm-location-cancelled'));}catch(e){}"
                        + "};"
                        + "window.__zmLocHook=3;"
                        + "})();",
                null);
    }

    private WebViewClient createWebViewClient() {
        return new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                injectLocationHelper(view);
                injectFcmToken(view);
                syncJwtFromWeb(view);
                hideSystemNavigation();
                if (!mAskedNotifyThisOpen) {
                    mAskedNotifyThisOpen = true;
                    mMainHandler.removeCallbacks(mAskNotifyRunnable);
                    mMainHandler.postDelayed(mAskNotifyRunnable, 12000L);
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                try {
                    ViewGroup parent = (ViewGroup) view.getParent();
                    if (parent != null) {
                        parent.removeView(view);
                    }
                    view.destroy();
                    mWebView = new WebView(ZedMarketWebViewActivity.this);
                    mWebView.addJavascriptInterface(new LocationBridge(), "ZedMarketLocation");
                    mWebView.setWebViewClient(this);
                    mWebView.setWebChromeClient(createWebChromeClient());
                    setupWebSettings(mWebView.getSettings());
                    markAsPlayStoreWebView(mWebView);
                    if (parent != null) {
                        parent.addView(mWebView);
                    } else {
                        setContentView(mWebView);
                    }
                    mWebView.loadUrl(mLaunchUrl.toString());
                } catch (Exception ex) {
                    Log.e(TAG, "WebView recovery failed", ex);
                    finish();
                }
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                view.evaluateJavascript("window.__zmPlayStoreApp=true;", null);
            }

            private boolean shouldOverrideUrlLoading(Uri navigationUrl) {
                if (navigationUrl == null) {
                    return false;
                }
                if ("data".equals(navigationUrl.getScheme())) {
                    return false;
                }
                // Keep zedmarket.app inside the WebView. Custom Tabs is the Chrome URL bar.
                if (isZedMarketHost(navigationUrl)
                        || uriOriginsMatch(navigationUrl, mLaunchUrl)
                        || matchExtraOrigins(navigationUrl)) {
                    return false;
                }
                try {
                    new CustomTabsIntent.Builder()
                            .setToolbarColor(mStatusBarColor)
                            .build()
                            .launchUrl(ZedMarketWebViewActivity.this, navigationUrl);
                    return true;
                } catch (ActivityNotFoundException ex) {
                    return false;
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return shouldOverrideUrlLoading(Uri.parse(url));
            }

            @RequiresApi(api = Build.VERSION_CODES.LOLLIPOP)
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return shouldOverrideUrlLoading(request.getUrl());
            }
        };
    }

    private WebChromeClient createWebChromeClient() {
        return new WebChromeClient() {

            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin, GeolocationPermissions.Callback callback) {
                handleGeolocationPrompt(origin, callback);
            }

            @Override
            public void onGeolocationPermissionsHidePrompt() {
                // Clears Chromium's blocking overlay after Don't allow.
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
                    return;
                }
                runOnUiThread(() -> handleMediaPermissionRequest(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (mPendingPermissionRequest == request) {
                    mPendingPermissionRequest = null;
                }
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (mFilePathCallback != null) {
                    mFilePathCallback.onReceiveValue(null);
                }
                mFilePathCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, REQ_FILE_CHOOSER);
                } catch (ActivityNotFoundException ex) {
                    mFilePathCallback = null;
                    Toast.makeText(
                            ZedMarketWebViewActivity.this,
                            "No app found to pick photos",
                            Toast.LENGTH_LONG
                    ).show();
                    return false;
                }
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (mFullScreenView != null) {
                    hideCustomViewIfOpen();
                }
                mFullScreenView = view;
                mCustomViewCallback = callback;
                mOriginalOrientation = getRequestedOrientation();
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                getWindow().addContentView(mFullScreenView,
                        new FrameLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                Gravity.CENTER));
            }

            @Override
            public void onHideCustomView() {
                hideCustomViewIfOpen();
            }
        };
    }

    private boolean matchExtraOrigins(Uri navigationUri) {
        for (Uri uri : mExtraOrigins) {
            if (uriOriginsMatch(uri, navigationUri)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isZedMarketHost(Uri uri) {
        if (uri == null || uri.getHost() == null) return false;
        String host = normalizedHost(uri);
        return host.equals("zedmarket.app") || host.endsWith(".zedmarket.app");
    }

    private static String normalizedHost(Uri uri) {
        String host = uri.getHost();
        if (host == null) return "";
        host = host.toLowerCase();
        return host.startsWith("www.") ? host.substring(4) : host;
    }

    private static boolean uriOriginsMatch(Uri uriA, Uri uriB) {
        if (uriA == null || uriB == null
                || uriA.getScheme() == null || uriB.getScheme() == null
                || uriA.getHost() == null || uriB.getHost() == null) {
            return false;
        }
        return uriA.getScheme().equalsIgnoreCase(uriB.getScheme())
                && normalizedHost(uriA).equals(normalizedHost(uriB))
                && uriA.getPort() == uriB.getPort();
    }

    private static void markAsPlayStoreWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        String ua = settings.getUserAgentString();
        if (ua == null) ua = "";
        if (!ua.contains("ZedMarketApp")) {
            settings.setUserAgentString(ua + " wv ZedMarketApp/1.0");
        }
        webView.evaluateJavascript("window.__zmPlayStoreApp=true;", null);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private static void setupWebSettings(WebSettings webSettings) {
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setGeolocationEnabled(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
            webSettings.setMediaPlaybackRequiresUserGesture(false);
        }
    }

    private void fetchFcmToken() {
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance()
                    .getToken()
                    .addOnSuccessListener(token -> {
                        if (token == null || token.isEmpty()) return;
                        getSharedPreferences(PREFS_LOC, MODE_PRIVATE)
                                .edit()
                                .putString(KEY_FCM_TOKEN, token)
                                .apply();
                        injectFcmToken(mWebView);
                    });
        } catch (Throwable ignored) {
            // Firebase is optional until google-services.json is present.
        }
    }

    private void syncJwtFromWeb(WebView view) {
        if (view == null) return;
        view.evaluateJavascript(
                "(function(){try{return localStorage.getItem('zm_token')||'';}catch(e){return '';}})()",
                raw -> {
                    String token = "";
                    if (raw != null && !"null".equals(raw)) {
                        try {
                            Object parsed = new org.json.JSONTokener(raw).nextValue();
                            token = parsed == null ? "" : String.valueOf(parsed);
                            if ("null".equals(token)) token = "";
                        } catch (Exception e) {
                            token = "";
                        }
                    }
                    ZedMarketAuthStore.saveJwt(ZedMarketWebViewActivity.this, token);
                });
    }

    private void injectFcmToken(WebView view) {
        if (view == null) return;
        String token = getSharedPreferences(PREFS_LOC, MODE_PRIVATE)
                .getString(KEY_FCM_TOKEN, "");
        if (token == null || token.isEmpty()) return;
        String quoted = org.json.JSONObject.quote(token);
        view.evaluateJavascript(
                "(function(){try{window.__zmFcmToken=" + quoted
                        + ";if(window.registerNativeFcmToken)window.registerNativeFcmToken();}"
                        + "catch(e){}})();",
                null);
    }

    private void showWelcomeNotification() {
        SharedPreferences prefs = getSharedPreferences(PREFS_LOC, MODE_PRIVATE);
        if (prefs.getBoolean(KEY_NOTIFY_WELCOME, false)) return;
        prefs.edit().putBoolean(KEY_NOTIFY_WELCOME, true).apply();
        showAppNotification(
                getString(R.string.notify_on_title),
                getString(R.string.notify_on_body),
                "/chat-list.html");
    }

    private void openNotificationUrl(Intent intent) {
        if (intent == null || mWebView == null) return;
        Uri data = intent.getData();
        if (data != null && isZedMarketHost(data)) {
            mWebView.loadUrl(data.toString());
            return;
        }
        String extraUrl = intent.getStringExtra("url");
        if (extraUrl != null && !extraUrl.trim().isEmpty()) {
            mWebView.loadUrl(resolveNotifyUrl(extraUrl).toString());
        }
    }

    private Uri resolveNotifyUrl(String url) {
        if (url == null || url.trim().isEmpty()) {
            return Uri.parse("https://zedmarket.app/chat-list.html");
        }
        String trimmed = url.trim();
        if (trimmed.startsWith("/")) {
            return Uri.parse("https://zedmarket.app" + trimmed);
        }
        Uri parsed = Uri.parse(trimmed);
        if (isZedMarketHost(parsed) && parsed.getScheme() != null) return parsed;
        return Uri.parse("https://zedmarket.app/chat-list.html");
    }

    private void ensureNotifyChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_MESSAGES,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("New chat messages and listing alerts");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    @SuppressLint("MissingPermission")
    private void showAppNotification(String title, String body, String url) {
        ZedMarketNotifier.show(this, title, body, url);
    }

    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
        }
        NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        return manager == null || manager.areNotificationsEnabled();
    }

    private void markNotifyAsked() {
        getSharedPreferences(PREFS_LOC, MODE_PRIVATE).edit()
                .putBoolean(KEY_NOTIFY_ASKED, true)
                .commit();
    }

    private boolean systemWillNotShowNotifyDialog() {
        if (hasNotificationPermission() || Build.VERSION.SDK_INT < 33) {
            return false;
        }
        boolean asked = getSharedPreferences(PREFS_LOC, MODE_PRIVATE)
                .getBoolean(KEY_NOTIFY_ASKED, false);
        boolean rationale = ActivityCompat.shouldShowRequestPermissionRationale(
                this, Manifest.permission.POST_NOTIFICATIONS);
        return asked && !rationale;
    }

    private void notifyWebSubscribePush() {
        if (mWebView == null) {
            return;
        }
        mWebView.evaluateJavascript(
                "(function(){try{if(window.enablePushNotifications)window.enablePushNotifications();}catch(e){}})();",
                null);
    }

    private void showInAppNotifyDialog() {
        if (isFinishing() || mNotifyDialogShowing) {
            return;
        }
        mNotifyDialogShowing = true;
        new AlertDialog.Builder(this)
                .setTitle(R.string.notify_allow_title)
                .setMessage(R.string.notify_allow_body)
                .setPositiveButton(R.string.loc_allow, (dialog, which) -> {
                    mNotifyDialogShowing = false;
                    ActivityCompat.requestPermissions(
                            this,
                            new String[]{ Manifest.permission.POST_NOTIFICATIONS },
                            REQ_NOTIFY);
                })
                .setNegativeButton(R.string.loc_dont_allow, (dialog, which) -> {
                    mNotifyDialogShowing = false;
                    markNotifyAsked();
                })
                .setCancelable(true)
                .setOnCancelListener(dialog -> {
                    mNotifyDialogShowing = false;
                    markNotifyAsked();
                })
                .show();
    }

    private void maybeAskNotificationPermission() {
        if (isFinishing()) {
            return;
        }
        if (hasNotificationPermission()) {
            notifyWebSubscribePush();
            fetchFcmToken();
            showWelcomeNotification();
            return;
        }
        if (mUserLocRequestActive
                || mPendingGeoCallback != null
                || mTurnOnDialogShowing
                || mNotifyDialogShowing
                || mNotifyPermissionInFlight) {
            return;
        }
        if (mLastNotifyAskAt > 0
                && SystemClock.elapsedRealtime() - mLastNotifyAskAt < 2500L) {
            return;
        }
        mLastNotifyAskAt = SystemClock.elapsedRealtime();
        if (Build.VERSION.SDK_INT < 33) {
            if (mWebView != null) {
                mWebView.evaluateJavascript(
                        "(function(){try{if(window.Notification&&Notification.permission==='default')"
                                + "Notification.requestPermission();}catch(e){}})();",
                        null);
            }
            return;
        }
        if (systemWillNotShowNotifyDialog()) {
            showInAppNotifyDialog();
            return;
        }
        mNotifyPermissionInFlight = true;
        ActivityCompat.requestPermissions(
                this,
                new String[]{ Manifest.permission.POST_NOTIFICATIONS },
                REQ_NOTIFY);
    }

    private void continueLocationAfterNotify() {
        if (mPendingGeoCallback == null) {
            return;
        }
        if (hasLocationPermission()) {
            ensureSystemLocationOnThenGrant();
            return;
        }
        if (mAskedRuntimePermissionThisFlow) {
            return;
        }
        mAskedRuntimePermissionThisFlow = true;
        if (systemWillNotShowLocationDialog()) {
            notifyWebLocationBlocked();
            denyInAppLocation();
            return;
        }
        mLocPermRequestedAt = SystemClock.elapsedRealtime();
        ActivityCompat.requestPermissions(
                this,
                new String[]{ Manifest.permission.ACCESS_COARSE_LOCATION },
                REQ_LOCATION);
    }

    private boolean recentlyDeclinedTurnOn() {
        // Short window: blocks instant re-open after No thanks; next tap after a moment works.
        return mDeclinedTurnOnAtMs > 0
                && (SystemClock.elapsedRealtime() - mDeclinedTurnOnAtMs) < 3000L;
    }

    private final class LocationBridge {
        @JavascriptInterface
        public void beginUserLocationRequest() {
            mUserLocRequestActive = true;
            mAskedRuntimePermissionThisFlow = false;
            mStartedTurnOnThisFlow = false;
            mRetryingFromInAppAllow = false;
            mIgnoreGeoRetryUntilMs = 0;
            mMainHandler.post(() -> mMainHandler.removeCallbacks(mAskNotifyRunnable));
        }

        @JavascriptInterface
        public void endUserLocationRequest() {
            mUserLocRequestActive = false;
            mIgnoreGeoRetryUntilMs = SystemClock.elapsedRealtime() + 45000L;
        }

        @JavascriptInterface
        public void requestAppLocationPermission() {
            runOnUiThread(() -> {
                if (hasLocationPermission()) {
                    notifyAppLocationPermission(true);
                    return;
                }
                if (mAwaitingAppLocJs) {
                    return;
                }
                mAwaitingAppLocJs = true;
                if (systemWillNotShowLocationDialog()) {
                    notifyWebLocationBlocked();
                    denyInAppLocation();
                    return;
                }
                mLocPermRequestedAt = SystemClock.elapsedRealtime();
                ActivityCompat.requestPermissions(
                        ZedMarketWebViewActivity.this,
                        new String[]{ Manifest.permission.ACCESS_COARSE_LOCATION },
                        REQ_LOCATION);
            });
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> maybeAskNotificationPermission());
        }

        @JavascriptInterface
        public boolean hasNotificationPermission() {
            return ZedMarketWebViewActivity.this.hasNotificationPermission();
        }

        @JavascriptInterface
        public String getFcmToken() {
            String token = getSharedPreferences(PREFS_LOC, MODE_PRIVATE)
                    .getString(KEY_FCM_TOKEN, "");
            return token == null ? "" : token;
        }

        @JavascriptInterface
        public void saveAuthToken(String token) {
            ZedMarketAuthStore.saveJwt(ZedMarketWebViewActivity.this, token);
        }

        @JavascriptInterface
        public void showNotification(String title, String body, String url) {
            final String safeTitle = title == null || title.trim().isEmpty() ? "ZedMarket" : title.trim();
            final String safeBody = body == null ? "" : body.trim();
            final String safeUrl = url == null ? "/chat-list.html" : url.trim();
            runOnUiThread(() -> showAppNotification(safeTitle, safeBody, safeUrl));
        }

        @JavascriptInterface
        public void onGeolocationError(int code) {
            // Don't allow stays on the current page. The site shows the
            // "ZedMarket needs your location" message. No Settings, no toast.
        }
    }
}
