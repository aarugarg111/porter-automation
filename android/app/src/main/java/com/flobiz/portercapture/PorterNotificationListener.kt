package com.flobiz.portercapture

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import kotlin.concurrent.thread

/**
 * Listens for Porter app notifications and forwards their text to the backend /capture endpoint.
 * Invisible: it reads notifications and sends nothing to the user. Requires the user to grant
 * "Notification access" once (MainActivity opens that settings screen).
 */
class PorterNotificationListener : NotificationListenerService() {

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName ?: return
        if (!isPorter(pkg)) return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        val big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()

        val raw = listOf(title, big.ifBlank { text })
            .filter { it.isNotBlank() }
            .joinToString(" — ")
        if (raw.isBlank()) return

        val baseUrl = Prefs.baseUrl(applicationContext)
        val token = Prefs.token(applicationContext)
        // Network off the main thread; Poster retries so a blip doesn't drop the notification.
        thread { Poster.postCapture(baseUrl, raw, token) }
    }

    private fun isPorter(pkg: String): Boolean =
        PORTER_PACKAGE_HINTS.any { pkg.contains(it, ignoreCase = true) }

    companion object {
        // The Porter customer app package id. "porter" matches e.g. com.theporter.android.customerapp.
        // Confirm the exact id on the Porter phone and tighten this list if other apps collide.
        val PORTER_PACKAGE_HINTS = listOf("porter")
    }
}
