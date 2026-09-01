package com.symbio.fitcoach

import android.app.Activity
import android.os.Bundle
import android.text.method.LinkMovementMethod
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val padding = (24 * resources.displayMetrics.density).toInt()
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }
        container.addView(TextView(this).apply {
            text = getString(R.string.health_rationale_title)
            textSize = 24f
            setPadding(0, 0, 0, padding / 2)
        })
        container.addView(TextView(this).apply {
            text = getString(R.string.health_rationale_body)
            textSize = 18f
            movementMethod = LinkMovementMethod.getInstance()
        })
        setContentView(container)
    }
}
