package com.flobiz.portercapture

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import kotlin.concurrent.thread

/**
 * One-screen setup UI: enter the backend base URL, grant notification access, and send a test ping.
 * After setup, PorterNotificationListener does the real work in the background.
 */
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val urlField = findViewById<EditText>(R.id.urlField)
        val status = findViewById<TextView>(R.id.status)
        urlField.setText(Prefs.baseUrl(this))

        findViewById<Button>(R.id.saveBtn).setOnClickListener {
            Prefs.setBaseUrl(this, urlField.text.toString())
            Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show()
        }

        findViewById<Button>(R.id.accessBtn).setOnClickListener {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }

        findViewById<Button>(R.id.testBtn).setOnClickListener {
            val base = urlField.text.toString()
            Prefs.setBaseUrl(this, base)
            status.text = getString(R.string.sending)
            thread {
                val code = Poster.postCapture(base, "TEST — Porter capture wired up")
                runOnUiThread {
                    status.text = if (code in 200..299) "Test OK ($code)" else "Test failed ($code)"
                }
            }
        }
    }
}
