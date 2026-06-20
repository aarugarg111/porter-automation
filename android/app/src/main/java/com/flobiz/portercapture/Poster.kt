package com.flobiz.portercapture

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Posts captured notification text to the backend. Mirrors the backend contract: POST /capture { "text": <raw> }. */
object Poster {
    /** Returns the HTTP status code, or -1 on any failure (network off, bad URL, timeout). */
    fun postCapture(baseUrl: String, text: String): Int {
        if (baseUrl.isBlank()) return -1
        val url = URL(baseUrl.trimEnd('/') + "/capture")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 8000
            readTimeout = 8000
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
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
