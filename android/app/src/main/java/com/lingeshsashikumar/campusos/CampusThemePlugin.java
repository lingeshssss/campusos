package com.lingeshsashikumar.campusos;

import android.graphics.Color;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the web app match the native window background (visible behind the status and navigation bars when
 * the WebView is padded below them, and during transitions) to the student's Light/Dark/System choice.
 */
@CapacitorPlugin(name = "CampusTheme")
public class CampusThemePlugin extends Plugin {

    /** Last color the app chose; survives system dark-mode changes (see MainActivity). Null until set. */
    static volatile Integer chosenBackground = null;

    @PluginMethod
    public void setBackground(PluginCall call) {
        String value = call.getString("color", "");
        if (value == null || !value.matches("^#[0-9a-fA-F]{6}$")) {
            call.reject("color must be #rrggbb");
            return;
        }
        int color = Color.parseColor(value);
        chosenBackground = color;
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().getDecorView().setBackgroundColor(color);
            if (getBridge().getWebView() != null) getBridge().getWebView().setBackgroundColor(color);
            call.resolve(new JSObject());
        });
    }
}
