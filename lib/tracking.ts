// lib/tracking.ts
import * as TaskManager from 'expo-task-manager'
import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

export const LOCATION_TASK = 'eu.track.location'
const STORAGE_VISIT_ID = 'track_current_visit_id'
const STORAGE_USER = 'track_current_user'
let webWatchId: number | null = null

// Background handler (Android/iOS). Runs even when app is backgrounded.
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error || !data) return
    const { locations } = data as any
    if (!locations || locations.length === 0) return

    const visitId = await AsyncStorage.getItem(STORAGE_VISIT_ID)
    const userName = await AsyncStorage.getItem(STORAGE_USER)

    const rows = locations.map((loc: any) => ({
      visit_id: visitId ? visitId : null,
      user_name: userName ?? null,
      ts: new Date(loc.timestamp).toISOString(),
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? null,
      speed: loc.coords.speed ?? null,
      heading: loc.coords.heading ?? null,
      source: (loc.mocked ? 'mock' : 'gps')
    }))

    // batch insert
    const { error: insErr } = await supabase.from('visit_tracks').insert(rows)
    if (insErr) console.log('visit_tracks insert error:', insErr)
  } catch (e) {
    console.log('LOCATION_TASK error:', e)
  }
})

// Public helpers
export async function startTracking(userName: string | null) {
  // Permissions
  const { status: fg } = await Location.requestForegroundPermissionsAsync()
  if (fg !== 'granted') throw new Error('Location permission denied')

  // Background only available on native (not web)
  if (!isWeb()) {
    const bg = await Location.requestBackgroundPermissionsAsync()
    if (bg.status !== 'granted') {
      // still allow foreground tracking
      console.log('Background permission not granted; will track in foreground while app is open.')
    }
  }

  await AsyncStorage.setItem(STORAGE_USER, userName ?? '')

  if (isWeb()) {
    // Web fallback: watchPosition (only while tab is open)
    stopWebWatch() // avoid duplicates
    webWatchId = navigator.geolocation.watchPosition(async (pos) => {
      const visitId = await AsyncStorage.getItem(STORAGE_VISIT_ID)
      const row = {
        visit_id: visitId ? visitId : null,
        user_name: userName ?? null,
        ts: new Date().toISOString(),
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        speed: pos.coords.speed ?? null,
        heading: pos.coords.heading ?? null,
        source: 'web'
      }
      const { error } = await supabase.from('visit_tracks').insert(row)
      if (error) console.log('visit_tracks (web) insert error:', error)
    }, (err) => {
      console.log('web geolocation error:', err)
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 })
    return
  }

  // Native: background updates
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)
  if (!started) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 15000,       // every 15s
      distanceInterval: 20,      // or after 20m
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Journey tracking',
        notificationBody: 'Recording your route…',
      },
    })
  }
}

export async function stopTracking() {
  await AsyncStorage.removeItem(STORAGE_USER)
  await AsyncStorage.removeItem(STORAGE_VISIT_ID)

  if (isWeb()) {
    stopWebWatch()
    return
  }
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)
  if (started) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK)
  }
}

export async function setCurrentVisitId(visitId: string | null) {
  if (visitId) await AsyncStorage.setItem(STORAGE_VISIT_ID, visitId)
  else await AsyncStorage.removeItem(STORAGE_VISIT_ID)
}

/* utils */
function isWeb() {
  // @ts-ignore
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}
function stopWebWatch() {
  if (webWatchId !== null) {
    navigator.geolocation.clearWatch(webWatchId)
    webWatchId = null
  }
}
