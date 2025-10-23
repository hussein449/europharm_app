// components/BrochureReview.tsx
import { useEffect, useMemo, useState } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView,
  useWindowDimensions, ActivityIndicator, Platform, Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'

type Brochure = {
  id: string
  title: string
  description?: string | null
  category?: string | null
  file_size?: string | null
  download_url?: string | null
  file_type?: string | null
  file_data?: string | null
  created?: string | null
  last_opened_at_arr?: string[] | null // ⬅️ keep only timestamps
}

type Props = {
  onBack?: () => void
  /** REQUIRED: pass rep’s display name from App (e.g., friendlyName) */
  currentRepName: string
}

/** Format a timestamp in Asia/Beirut regardless of server default */
function formatBeirut(ts: string) {
  try {
    const d = new Date(ts) // works with ISO; if plain date/time, server should provide ISO
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Beirut',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return ts
  }
}

export default function BrochureReview({ onBack, currentRepName }: Props) {
  const { width } = useWindowDimensions()
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rows, setRows] = useState<Brochure[]>([])
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<'all' | string>('all')

  const columns = width >= 1280 ? 4 : width >= 1024 ? 3 : width >= 680 ? 2 : 1
  const gap = 14
  const cardW = Math.floor((width - 32 - gap * (columns - 1)) / columns)

  const load = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const sel = await supabase
        .from('brochure')
        .select(`
          id,title,description,category,file_size,download_url,file_type,file_data,created,
          last_opened_at_arr
        `)
        .order('created', { ascending: false })

      if (sel.error) throw sel.error
      const data = (sel.data ?? []) as any[]

      setRows(
        data.map((b) => ({
          id: String(b.id),
          title: b.title ?? 'Untitled',
          description: b.description ?? '',
          category: b.category ?? 'uncategorized',
          file_size: b.file_size ?? '',
          download_url: b.download_url ?? '',
          file_type: b.file_type ?? '',
          file_data: b.file_data ?? null,
          created: b.created ?? null,
          last_opened_at_arr: Array.isArray(b.last_opened_at_arr) ? b.last_opened_at_arr : [],
        }))
      )
    } catch (e: any) {
      console.error('brochures load error:', e)
      setErrorMsg(e?.message ?? 'Failed to load brochures.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const fetchOne = async (brochureId: string): Promise<Brochure | null> => {
    const { data, error } = await supabase
      .from('brochure')
      .select('id,title,description,category,file_size,download_url,file_type,file_data,created,last_opened_at_arr')
      .eq('id', brochureId)
      .maybeSingle()
    if (error) { console.warn('fetchOne failed:', error.message); return null }
    if (!data) return null
    const b: any = data
    return {
      id: String(b.id),
      title: b.title ?? 'Untitled',
      description: b.description ?? '',
      category: b.category ?? 'uncategorized',
      file_size: b.file_size ?? '',
      download_url: b.download_url ?? '',
      file_type: b.file_type ?? '',
      file_data: b.file_data ?? null,
      created: b.created ?? null,
      last_opened_at_arr: Array.isArray(b.last_opened_at_arr) ? b.last_opened_at_arr : [],
    }
  }

  /** ---------- Log open/download via RPC (server stamps time) ---------- */
  const markBrochureOpened = async (brochureId: string) => {
    const name = (currentRepName || '').trim()
    if (!name) { setErrorMsg('Missing rep name from App.'); return false }

    const { error } = await supabase.rpc('mark_brochure_opened', {
      p_id: String(brochureId),
      p_rep_name: name,
    })
    if (error) { setErrorMsg(error.message); console.warn(error.message); return false }

    // Authoritative refresh (we’ll display time in Beirut regardless of server tz)
    const fresh = await fetchOne(brochureId)
    if (fresh) setRows((prev) => prev.map((r) => (r.id === brochureId ? fresh : r)))
    return true
  }

  /** ---------- Open / Download helpers ---------- */
  const openInNewTabWeb = (url: string) => {
    // @ts-ignore
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const downloadWeb = (sourceUrl: string, suggestedName: string) => {
    const a = document.createElement('a')
    a.href = sourceUrl
    a.download = suggestedName
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const openLink = (url: string) => {
    if (!url) return
    if (Platform.OS === 'web') {
      openInNewTabWeb(url)
    } else {
      const Linking = require('react-native').Linking
      Linking.openURL(url).catch(() => {
        Alert.alert('Unable to open file', 'Your device could not open this link.')
      })
    }
  }

  const handleOpen = async (b: Brochure) => {
    const ok = await markBrochureOpened(b.id)
    if (!ok) return

    if (b.download_url && b.download_url !== '#') {
      openLink(b.download_url)
      return
    }

    if (b.file_data) {
      if (Platform.OS === 'web') {
        openInNewTabWeb(b.file_data)
      } else {
        const Linking = require('react-native').Linking
        Linking.openURL(b.file_data).catch(() => {
          Alert.alert(
            'Unable to open file',
            'This brochure only has an embedded file. Opening data URLs may not be supported on this device.'
          )
        })
      }
      return
    }

    Alert.alert('No file', 'This brochure has no URL or file data.')
  }

  const handleDownload = async (b: Brochure) => {
    const ok = await markBrochureOpened(b.id)
    if (!ok) return

    const safeTitle = (b.title || 'brochure').replace(/\s+/g, '_')
    const ext = (b.file_type || 'pdf').toLowerCase()
    const fileName = `${safeTitle}.${ext}`

    if (Platform.OS === 'web') {
      if (b.file_data) {
        downloadWeb(b.file_data, fileName)
        return
      }
      if (b.download_url && b.download_url !== '#') {
        downloadWeb(b.download_url, fileName) // relies on server headers for forced download
        return
      }
      Alert.alert('No file', 'This brochure has no URL or file data to download.')
    } else {
      if (b.download_url && b.download_url !== '#') {
        const Linking = require('react-native').Linking
        Linking.openURL(b.download_url).catch(() => {
          Alert.alert('Unable to download', 'Your device could not open this link.')
        })
        return
      }
      Alert.alert(
        'No file',
        'This brochure has no direct URL to download on this platform. Saving base64 requires a native file-system integration.'
      )
    }
  }

  const categories = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => r.category && set.add(r.category))
    return ['all', ...Array.from(set)]
  }, [rows])

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase()
    return rows.filter((r) => {
      const okCat = category === 'all' || (r.category ?? '').toLowerCase() === category.toLowerCase()
      const okText =
        !text ||
        (r.title ?? '').toLowerCase().includes(text) ||
        (r.description ?? '').toLowerCase().includes(text)
      return okCat && okText
    })
  }, [rows, q, category])

  const latestAt = (arr?: string[] | null) =>
    Array.isArray(arr) && arr.length > 0 ? arr[arr.length - 1] : null

  return (
    <View style={styles.screen}>
      <View style={styles.appBar}>
        <Pressable onPress={onBack} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></Pressable>
        <Text style={styles.title}>Brochures</Text>
        <Pressable onPress={load} style={styles.reloadBtn}><Text style={styles.reloadText}>Reload</Text></Pressable>
      </View>

      <View style={styles.controls}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search brochures…"
          placeholderTextColor="#9aa0a6"
          style={styles.search}
          clearButtonMode="while-editing"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
          {categories.map((c) => {
            const active = category.toLowerCase() === c.toLowerCase()
            return (
              <Pressable key={c} onPress={() => setCategory(c)} style={[styles.filterChip, active && styles.filterChipActive]}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{c.toUpperCase()}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : errorMsg ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#b91c1c', fontWeight: '800' }}>{errorMsg}</Text>
          <Pressable onPress={load} style={[styles.btnPrimary, { marginTop: 10 }]}><Text style={styles.btnPrimarySolidText}>Retry</Text></Pressable>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}><Text style={{ color: '#6b7280' }}>No brochures match your filters.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.grid, { gap, paddingHorizontal: 16 }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
            {filtered.map((b) => {
              const lastAtRaw = latestAt(b.last_opened_at_arr)
              const lastAt = lastAtRaw ? formatBeirut(lastAtRaw) : null
              return (
                <View key={b.id} style={[styles.card, { width: cardW }]}>
                  <View style={styles.cardHeader}>
                    <View style={styles.iconWrap}><Text style={styles.icon}>📄</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={2} style={styles.cardTitle}>{b.title}</Text>
                      {!!b.category && (<View style={styles.catChip}><Text style={styles.catText}>{b.category}</Text></View>)}
                    </View>
                  </View>

                  {!!b.description && (<Text numberOfLines={3} style={styles.desc}>{b.description}</Text>)}

                  <View style={styles.metaRow}>
                    {!!b.file_type && (<View style={styles.metaChip}><Text style={styles.metaText}>{b.file_type}</Text></View>)}
                    {!!b.file_size && (<View style={styles.metaChip}><Text style={styles.metaText}>{b.file_size}</Text></View>)}
                    {!!b.created && (<Text style={styles.dateText}>{new Date(b.created).toLocaleDateString()}</Text>)}
                  </View>

                  {!!lastAt && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>
                        Last opened {lastAt} {/* ⬅️ No “by …” */}
                      </Text>
                    </View>
                  )}

                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => handleOpen(b)}
                      style={({ pressed }) => [styles.btnPrimarySolid, pressed && { transform: [{ translateY: 1 }], opacity: 0.95 }]}
                    >
                      <Text style={styles.btnPrimarySolidText}>Open</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDownload(b)}
                      style={({ pressed }) => [styles.btnSecondary, pressed && { transform: [{ translateY: 1 }], opacity: 0.95 }]}
                    >
                      <Text style={styles.btnSecondaryText}>Download</Text>
                    </Pressable>
                  </View>
                </View>
              )
            })}
          </View>
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  )
}

/* ---------------- styles ---------------- */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7fb' },
  btnPrimary: {
    backgroundColor: '#2563eb', borderRadius: 12, alignItems: 'center', justifyContent: 'center', height: 44,
    // @ts-ignore rn-web
    cursor: 'pointer',
  },
  appBar: {
    paddingTop: 18, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: '#ffffff',
    borderBottomWidth: 1, borderBottomColor: '#edf0f5',
    // @ts-ignore rn-web
    boxShadow: '0 6px 18px rgba(17,24,39,0.06)',
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  backBtn: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' },
  backIcon: { fontSize: 26, lineHeight: 26, color: '#111827' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#0f172a' },
  reloadBtn: { height: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef2ff' },
  reloadText: { color: '#1d4ed8', fontWeight: '800', fontSize: 12 },

  controls: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  search: { height: 42, backgroundColor: '#f2f4f7', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, color: '#111827' },

  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  filterChipActive: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  filterText: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  filterTextActive: { color: '#fff' },

  grid: { paddingTop: 16, paddingBottom: 8 },

  card: {
    backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#edf0f5', padding: 14, justifyContent: 'space-between',
    // @ts-ignore rn-web
    boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e7f3ff' },
  icon: { fontSize: 22 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },

  catChip: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#e5e7eb' },
  catText: { fontSize: 11, fontWeight: '800', color: '#1d4ed8' },

  desc: { color: '#475569', marginTop: 6, fontSize: 13 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  metaChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#f1f59', borderWidth: 1, borderColor: '#e5e7eb' },
  metaText: { fontSize: 11, color: '#0f172a' },
  dateText: { marginLeft: 'auto', fontSize: 11, color: '#94a3b8' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btnPrimarySolid: {
    flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563eb',
    // @ts-ignore rn-web
    cursor: 'pointer',
    // @ts-ignore rn-web
    boxShadow: '0 1px 0 rgba(0,0,0,0.06) inset',
  },
  btnPrimarySolidText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.2 },

  btnSecondary: {
    flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb',
    // @ts-ignore rn-web
    cursor: 'pointer',
  },
  btnSecondaryText: { color: '#0f172a', fontWeight: '800', fontSize: 13, letterSpacing: 0.2 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
