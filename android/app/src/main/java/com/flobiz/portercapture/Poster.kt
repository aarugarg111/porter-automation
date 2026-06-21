package com.flobiz.portercapture

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Posts captured notification text to the backend. Mirrors the backend contract: POST /capture { "text": <raw> }. */
object Poster {
    /**
     * Posts with retries so a transient network blip doesn't drop a Porter notification.
     * Returns the last HTTP status code, or -1 on failure. `token` (optional) is sent as
     * x-capture-token to satisfy the backend's CAPTURE_TOKEN guard on a public host.
     */
    fun postCapture(baseUrl: String, text: String, token: String = "", attempts: Int = 3): Int {
        if (baseUrl.isBlank()) return -1
        var last = -1
        for (i in 0 until attempts) {
            last = tryPost(baseUrl, text, token)
            if (last in 200..299 || last == 401) return last // success, or auth rejection (retrying won't help)
            try { Thread.sleep(1000L * (i + 1)) } catch (_: InterruptedException) { return last }
        }
        return last
    }

    private fun tryPost(baseUrl: String, text: String, token: String): Int {
        val url = URL(baseUrl.trimEnd('/') + "/capture")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 8000
            readTimeout = 8000
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            if (token.isNotBlank()) setRequestProperty("x-capture-token", token)
        }
        return try {
            val body = JSONObject().put("text", text).toString().toByteArray(Charsets.UTF_8)
            conn.outputStream.use { it.write(body) }
            conn.responseCode
        } catch (e: Exception) {
            -1
        } finally {
            conn.disconnect()
        }
    }
}
