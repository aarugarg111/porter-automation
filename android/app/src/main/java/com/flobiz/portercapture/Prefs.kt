package com.flobiz.portercapture

import android.content.Context

/** Tiny SharedPreferences wrapper for the one setting we persist: the backend base URL. */
object Prefs {
    private const val FILE = "porter_capture_prefs"
    private const val KEY_BASE_URL = "base_url"

    fun baseUrl(ctx: Context): String =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY_BASE_URL, "").orEmpty()

    fun setBaseUrl(ctx: Context, url: String) {
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)
            .edit().putString(KEY_BASE_URL, url.trim()).apply()
    }
}
