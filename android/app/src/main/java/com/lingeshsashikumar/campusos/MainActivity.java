package com.lingeshsashikumar.campusos;

import android.content.res.Configuration;
import android.os.Bundle;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyNativeBackground();
    }

    // uiMode is in configChanges, so switching system dark mode doesn't recreate the activity: refresh here.
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyNativeBackground();
    }

    // Matches the bg token in app/theme.css (res/values and values-night colors.xml): no white frame in dark mode.
    private void applyNativeBackground() {
        int background = ContextCompat.getColor(this, R.color.campus_background);
        getWindow().getDecorView().setBackgroundColor(background);
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().setBackgroundColor(background);
    }
}
