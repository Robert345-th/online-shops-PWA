/*
 * Full-screen WebView for Play Store testing app with:
 * - App location permission
 * - System "Turn on location" / Location Accuracy dialog
 * - Microphone / camera permission for voice notes & selfie
 * - Photo file picker
 */
package app.zedmarket.twa;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.IntentSender;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
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

    private String mPendingGeoOrigin;
    private GeolocationPermissions.Callback mPendingGeoCallback;
    private boolean mRetryLocationAfterSettings;
    private ValueCallback<Uri[]> mFilePathCallback;
    private PermissionRequest mPendingPermissionRequest;
    /** After "No thanks", block more Turn on / Location Accuracy dialogs for a short window. */
    private long mDeclinedTurnOnAtMs;
    /** Prevents stacking multiple Location Accuracy dialogs from concurrent GPS requests. */
    private boolean mTurnOnDialogShowing;
    private boolean mSettingsCheckInFlight;

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

        try {
            mLaunchUrl = getIntent().getParcelableExtra(KEY_LAUNCH_URI);
            if (mLaunchUrl == null || mLaunchUrl.getScheme() == null
                    || !"https".equalsIgnoreCase(mLaunchUrl.getScheme())) {
                mLaunchUrl = Uri.parse("https://zedmarket.app/?utm_source=android");
            }

            mStatusBarColor = getIntent().getIntExtra(KEY_STATUS_BAR_COLOR, FALLBACK_COLOR);
            int navigationBarColor = getIntent().getIntExtra(KEY_NAVIGATION_BAR_COLOR, FALLBACK_COLOR);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                try {
                    getWindow().setStatusBarColor(mStatusBarColor);
                    getWindow().setNavigationBarColor(navigationBarColor);
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
        if (mWebView != null) {
            mWebView.onResume();
        }
        if (mRetryLocationAfterSettings && hasLocationPermission()) {
            mRetryLocationAfterSettings = false;
            showLocationNotice(getString(R.string.loc_settings_enabled_retry));
        }
    }

    @Override
    protected void onPause() {
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

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
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
                // One No thanks ends the whole flow — block re-prompts briefly.
                mDeclinedTurnOnAtMs = SystemClock.elapsedRealtime();
                finishGeoGrant(false);
                notifyWebLocationCancelled();
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
            // App permission granted — now ask to Turn on system location / Location Accuracy.
            ensureSystemLocationOnThenGrant();
            return;
        }

        finishGeoGrant(false);
        notifyWebLocationCancelled();
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

    private void finishGeoGrant(boolean allow) {
        if (mPendingGeoCallback == null || mPendingGeoOrigin == null) {
            return;
        }
        GeolocationPermissions.Callback cb = mPendingGeoCallback;
        String origin = mPendingGeoOrigin;
        mPendingGeoCallback = null;
        mPendingGeoOrigin = null;
        cb.invoke(origin, allow, false);
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

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
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
     * Shows the system "Turn on location" / Location Accuracy dialog (Turn on / No thanks).
     * This is separate from the "Allow ZedMarket to access location?" permission dialog.
     */
    private void ensureSystemLocationOnThenGrant() {
        if (mPendingGeoCallback == null || mPendingGeoOrigin == null) {
            return;
        }
        if (recentlyDeclinedTurnOn()) {
            finishGeoGrant(false);
            return;
        }
        // Device location already on — skip Location Accuracy dialog (that was the No thanks loop).
        if (isSystemLocationEnabled()) {
            finishGeoGrant(true);
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
                    .setAlwaysShow(false)
                    .build();

            LocationServices.getSettingsClient(this)
                    .checkLocationSettings(settingsRequest)
                    .addOnSuccessListener(this, response -> {
                        mSettingsCheckInFlight = false;
                        if (recentlyDeclinedTurnOn()) {
                            finishGeoGrant(false);
                            return;
                        }
                        finishGeoGrant(true);
                    })
                    .addOnFailureListener(this, e -> {
                        mSettingsCheckInFlight = false;
                        if (mPendingGeoCallback == null || recentlyDeclinedTurnOn()) {
                            finishGeoGrant(false);
                            return;
                        }
                        if (mTurnOnDialogShowing) {
                            finishGeoGrant(false);
                            return;
                        }
                        if (e instanceof ResolvableApiException) {
                            try {
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
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
            showLocationNotice(getString(R.string.loc_open_settings));
        } catch (ActivityNotFoundException ex) {
            Log.e(TAG, "Could not open app settings", ex);
        }
    }

    private void showLocationNotice(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private void handleGeolocationPrompt(String origin, GeolocationPermissions.Callback callback) {
        // After No thanks, deny extra WebView prompts so Location Accuracy cannot stack.
        if (recentlyDeclinedTurnOn()) {
            callback.invoke(origin, false, false);
            return;
        }
        if (mTurnOnDialogShowing || mPendingGeoCallback != null) {
            callback.invoke(origin, false, false);
            return;
        }

        mPendingGeoOrigin = origin;
        mPendingGeoCallback = callback;

        if (!hasLocationPermission()) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                    },
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
            private View fullScreenView;
            private int originalOrientation;

            @Override
            public void onGeolocationPermissionsShowPrompt(
                    String origin, GeolocationPermissions.Callback callback) {
                handleGeolocationPrompt(origin, callback);
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
                if (fullScreenView != null) {
                    onHideCustomView();
                }
                fullScreenView = view;
                originalOrientation = getRequestedOrientation();
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                getWindow().addContentView(fullScreenView,
                        new FrameLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                Gravity.CENTER));
            }

            @Override
            public void onHideCustomView() {
                if (fullScreenView == null) {
                    return;
                }
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                ((ViewGroup) fullScreenView.getParent()).removeView(fullScreenView);
                fullScreenView = null;
                setRequestedOrientation(originalOrientation);
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

    private boolean recentlyDeclinedTurnOn() {
        // Short window: blocks instant re-open after No thanks; next tap after a moment works.
        return mDeclinedTurnOnAtMs > 0
                && (SystemClock.elapsedRealtime() - mDeclinedTurnOnAtMs) < 3000L;
    }

    private final class LocationBridge {
        @JavascriptInterface
        public void onGeolocationError(int code) {
            // Don't allow stays on the current page. The site shows the
            // "ZedMarket needs your location" message. No Settings, no toast.
        }
    }
}
