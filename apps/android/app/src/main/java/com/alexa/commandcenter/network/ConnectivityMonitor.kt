package com.alexa.commandcenter.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.alexa.commandcenter.model.ConnectionState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class ConnectivityMonitor(context: Context) {
  private val manager = context.getSystemService(ConnectivityManager::class.java)
  private val mutableState = MutableStateFlow(currentState())
  val state: StateFlow<ConnectionState> = mutableState

  private val callback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) { mutableState.value = ConnectionState.RECONNECTING }
    override fun onLost(network: Network) { mutableState.value = currentState() }
    override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
      mutableState.value = if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
        ConnectionState.ONLINE
      } else ConnectionState.DEGRADED
    }
  }

  fun start() = manager.registerDefaultNetworkCallback(callback)
  fun stop() = runCatching { manager.unregisterNetworkCallback(callback) }

  private fun currentState(): ConnectionState {
    val network = manager.activeNetwork ?: return ConnectionState.OFFLINE
    val capabilities = manager.getNetworkCapabilities(network) ?: return ConnectionState.OFFLINE
    return if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
      ConnectionState.ONLINE
    } else ConnectionState.DEGRADED
  }
}
