// components/ProductsReview.tsx
import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  useWindowDimensions,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'

type Product = {
  id: string
  name: string
  stock: number
  code?: string | null
}

type SampleRequest = {
  id: string
  item_id: string
  product_name: string
  requested_by: string
  unit_type: 'case' | 'box' | 'piece'
  quantity: number
  status: 'pending' | 'approved' | 'declined'
  requested_at: string
}

type Props = {
  onBack?: () => void
}

export default function ProductsReview({ onBack }: Props) {
  const { width } = useWindowDimensions()
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Product[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const columns = width >= 1200 ? 4 : width >= 900 ? 3 : 2
  const gap = 12
  const cardW = Math.floor((width - 32 - gap * (columns - 1)) / columns)

  // ----- REQUEST modal state -----
  const [requestModal, setRequestModal] = useState<{
    open: boolean
    product: Product | null
    name: string
    type: 'case' | 'box' | 'piece'
    qty: string
    saving: boolean
  }>({ open: false, product: null, name: '', type: 'box', qty: '', saving: false })

  // ----- REQUESTS LIST modal -----
  const [listModal, setListModal] = useState<{
    open: boolean
    loading: boolean
    rows: SampleRequest[]
    err: string | null
    filter: 'all' | 'pending' | 'approved' | 'declined'
  }>({ open: false, loading: false, rows: [], err: null, filter: 'all' })

  // ---- FETCH products ----
  const loadProducts = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      let rows: any[] | null = null
      const rpc = await supabase.rpc('get_items')
      if (!rpc.error && Array.isArray(rpc.data)) {
        rows = rpc.data
      } else {
        const sel = await supabase
          .from('items')
          .select('id,name,stock,code,is_active')
          .eq('is_active', true)
          .order('name', { ascending: true })
        if (sel.error) throw sel.error
        rows = sel.data
      }

      const normalized: Product[] = (rows ?? []).map((r: any) => ({
        id: String(r.id),
        name: r.name ?? '—',
        stock: typeof r.stock === 'number' ? r.stock : Number(r.stock ?? 0),
        code: r.code ?? null,
      }))

      setItems(normalized)
    } catch (err: any) {
      console.error('products load error:', err)
      setErrorMsg(err.message ?? 'Failed to load products.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const filtered = q
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(q.toLowerCase()) ||
          (i.code ?? '').toLowerCase().includes(q.toLowerCase())
      )
    : items

  // ----- Request flow -----
  const openRequest = (p: Product) => {
    if ((p.stock ?? 0) <= 0) {
      Alert.alert('No available stock', 'This product has no stock available.')
      return
    }
    setRequestModal({ open: true, product: p, name: '', type: 'box', qty: '', saving: false })
  }

  const submitRequest = async () => {
    const m = requestModal
    if (!m.product) return
    const qtyNum = Number(m.qty)
    if (!m.name.trim()) {
      Alert.alert('Missing name', 'Enter your name.')
      return
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      Alert.alert('Invalid quantity', 'Enter a positive number.')
      return
    }
    if (qtyNum > m.product.stock) {
      Alert.alert('Too many', `Only ${m.product.stock} in stock.`)
      return
    }
    try {
      setRequestModal((x) => ({ ...x, saving: true }))

      const { data, error } = await supabase.rpc('request_sample', {
        p_item_id: m.product.id,
        p_requested_by: m.name.trim(),
        p_unit_type: m.type,
        p_quantity: qtyNum,
      })

      if (error) {
        console.error('request_sample error:', error)
        // @ts-ignore
        console.error('details:', error.details, 'hint:', error.hint, 'code:', error.code)
        throw error
      }

      Alert.alert('Request recorded', 'Saved as pending.')
      setRequestModal({ open: false, product: null, name: '', type: 'box', qty: '', saving: false })
    } catch (e: any) {
      Alert.alert('Action failed', e?.message ?? 'Unknown error')
      setRequestModal((x) => ({ ...x, saving: false }))
    }
  }

  // ----- Requests list -----
  const openRequestsList = async () => {
    setListModal({ open: true, loading: true, rows: [], err: null, filter: 'all' })
    try {
      const { data, error } = await supabase.rpc('get_sample_requests')
      if (error) {
        console.error('get_sample_requests error:', error)
        // @ts-ignore
        console.error('details:', error.details, 'hint:', error.hint, 'code:', error.code)
        throw error
      }
      setListModal((m) => ({ ...m, loading: false, rows: (data as SampleRequest[]) ?? [] }))
    } catch (e: any) {
      setListModal({ open: true, loading: false, rows: [], err: e?.message ?? 'Failed to load', filter: 'all' })
    }
  }

  const filteredRequests = useMemo(() => {
    if (listModal.filter === 'all') return listModal.rows
    return listModal.rows.filter((r) => r.status === listModal.filter)
  }, [listModal.rows, listModal.filter])

  return (
    <View style={styles.screen}>
      {/* App bar */}
      <View style={styles.appBar}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Products Review</Text>

        {/* Requested Samples button */}
        <Pressable onPress={openRequestsList} style={styles.topBtn}>
          <Text style={styles.topBtnText}>Requested Samples</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by name or code…"
          placeholderTextColor="#9aa0a6"
          style={styles.search}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Body */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : errorMsg ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: '#b91c1c', fontWeight: '700' }}>{errorMsg}</Text>
          <Pressable
            onPress={loadProducts}
            style={[styles.btn, styles.btnPrimary, { marginTop: 10, alignSelf: 'flex-start' }]}
          >
            <Text style={styles.btnPrimaryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <Grid
          items={filtered}
          cardW={cardW}
          onRequest={openRequest}
          onReturn={(p) => Alert.alert('Return sample', `Implement return flow later for ${p.name}.`)}
        />
      )}

      {/* REQUEST MODAL */}
      <Modal visible={requestModal.open} transparent animationType="fade" onRequestClose={() => setRequestModal((x) => ({ ...x, open: false }))}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { width: 520, maxWidth: '95%' }]}>
            <Text style={styles.sheetTitle}>Request Sample</Text>
            {requestModal.product ? (
              <>
                <Text style={styles.sheetLabel}>{requestModal.product.name}</Text>

                <Text style={styles.label}>Your Name</Text>
                <TextInput
                  value={requestModal.name}
                  onChangeText={(v) => setRequestModal((x) => ({ ...x, name: v }))}
                  placeholder="e.g., Hussein"
                  placeholderTextColor="#9aa0a6"
                  style={styles.input}
                />

                <Text style={[styles.label, { marginTop: 10 }]}>Type</Text>
                <View style={styles.segmentRow}>
                  {(['case', 'box', 'piece'] as const).map((opt) => {
                    const active = requestModal.type === opt
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => setRequestModal((x) => ({ ...x, type: opt }))}
                        style={[styles.segment, active && styles.segmentActive]}
                      >
                        <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                          {opt.toUpperCase()}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>

                <Text style={[styles.label, { marginTop: 10 }]}>Quantity</Text>
                <TextInput
                  value={requestModal.qty}
                  onChangeText={(v) =>
                    setRequestModal((x) => ({ ...x, qty: v.replace(/[^\d]/g, '') }))
                  }
                  keyboardType="numeric"
                  placeholder={`<= ${requestModal.product.stock}`}
                  placeholderTextColor="#9aa0a6"
                  style={styles.input}
                />

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <Pressable
                    onPress={() => setRequestModal({ open: false, product: null, name: '', type: 'box', qty: '', saving: false })}
                    style={styles.btn}
                  >
                    <Text style={styles.btnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={submitRequest}
                    disabled={requestModal.saving}
                    style={[styles.btn, styles.btnPrimary]}
                  >
                    {requestModal.saving ? <ActivityIndicator /> : <Text style={styles.btnPrimaryText}>Submit</Text>}
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* REQUESTS LIST MODAL (polished) */}
      <Modal visible={listModal.open} transparent animationType="fade" onRequestClose={() => setListModal((m) => ({ ...m, open: false }))}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { width: 760, maxWidth: '96%' }]}>
            {/* Header row */}
            <View style={styles.listHeader}>
              <Text style={styles.sheetTitle}>Requested Samples</Text>
              <View style={styles.filterRow}>
                {(['all', 'pending', 'approved', 'declined'] as const).map((f) => {
                  const active = listModal.filter === f
                  return (
                    <Pressable
                      key={f}
                      onPress={() => setListModal((m) => ({ ...m, filter: f }))}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {f.toUpperCase()}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {listModal.loading ? (
              <ActivityIndicator />
            ) : listModal.err ? (
              <>
                <Text style={{ color: '#b91c1c', marginBottom: 8 }}>{listModal.err}</Text>
                <Pressable onPress={openRequestsList} style={[styles.btn, styles.btnPrimary, { alignSelf: 'flex-start' }]}>
                  <Text style={styles.btnPrimaryText}>Retry</Text>
                </Pressable>
              </>
            ) : filteredRequests.length === 0 ? (
              <Text style={{ color: '#6b7280' }}>No requests.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 6 }}>
                {filteredRequests.map((r) => (
                  <View key={r.id} style={styles.reqCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reqTitle} numberOfLines={1}>{r.product_name}</Text>
                      <Text style={styles.reqSub} numberOfLines={1}>
                        By <Text style={{ fontWeight: '700' }}>{r.requested_by}</Text> • {r.quantity} {r.unit_type}
                      </Text>
                      <Text style={styles.reqTime}>{new Date(r.requested_at).toLocaleString()}</Text>
                    </View>
                    <StatusChip status={r.status} />
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.footerRow}>
              <Pressable onPress={() => setListModal((m) => ({ ...m, open: false }))} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

/* ---------- Presentational subcomponents ---------- */

function Grid({
  items,
  cardW,
  onRequest,
  onReturn,
}: {
  items: Product[]
  cardW: number
  onRequest: (p: Product) => void
  onReturn: (p: Product) => void
}) {
  return (
    <ScrollView contentContainerStyle={[styles.grid, { gap: 12, paddingHorizontal: 16 }]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {items.map((p) => {
          const stock = p.stock ?? 0
          const stockTone = stock <= 0 ? '#ef4444' : stock < 15 ? '#f59e0b' : '#16a34a'
          const stockBg = stock <= 0 ? '#fee2e2' : stock < 15 ? '#fef3c7' : '#dcfce7'
          return (
            <View key={p.id} style={[styles.card, { width: cardW }]}>
              <View style={styles.rowTop}>
                <View style={styles.iconWrap}>
                  <Text style={styles.icon}>📦</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={styles.name}>
                    {p.name}
                  </Text>
                  {p.code ? <Text style={styles.code}>Code: {p.code}</Text> : null}
                </View>
              </View>

              <View style={styles.stockRow}>
                <View style={[styles.stockChip, { backgroundColor: stockBg }]}>
                  <Text style={[styles.stockText, { color: stockTone }]}>Stock: {stock}</Text>
                </View>
                <View style={styles.progress}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.max(0, Math.min(100, (stock / 100) * 100))}%`,
                        backgroundColor: stockTone,
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.actions}>
                <Pressable
                  onPress={() => onRequest(p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={({ pressed }) => [
                    styles.btnPrimarySolid,
                    pressed && { transform: [{ translateY: 1 }], opacity: 0.95 },
                  ]}
                >
                  <Text style={styles.btnPrimarySolidText}>Request sample</Text>
                </Pressable>

                <Pressable
                  onPress={() => onReturn(p)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={({ pressed }) => [
                    styles.btnGhost,
                    pressed && { transform: [{ translateY: 1 }], opacity: 0.9 },
                  ]}
                >
                  <Text style={styles.btnGhostText}>Return sample</Text>
                </Pressable>
              </View>
            </View>
          )
        })}
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  )
}

function StatusChip({ status }: { status: SampleRequest['status'] }) {
  const map = {
    pending: { bg: '#fef3c7', fg: '#92400e', text: 'PENDING' },
    approved: { bg: '#dcfce7', fg: '#065f46', text: 'APPROVED' },
    declined: { bg: '#fee2e2', fg: '#991b1b', text: 'DECLINED' },
  } as const
  const s = map[status]
  return (
    <View style={{ backgroundColor: s.bg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
      <Text style={{ color: s.fg, fontWeight: '800', fontSize: 12 }}>{s.text}</Text>
    </View>
  )
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f7fb' },

  appBar: {
    paddingTop: 18,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#edf0f5',
    // @ts-ignore rn-web
    boxShadow: '0 6px 18px rgba(17,24,39,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  backIcon: { fontSize: 26, lineHeight: 26, color: '#111827' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#0f172a' },

  topBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    // @ts-ignore rn-web
    cursor: 'pointer',
  },
  topBtnText: { color: '#1d4ed8', fontWeight: '800', fontSize: 12 },

  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  search: {
    height: 42,
    backgroundColor: '#f2f4f7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    color: '#111827',
  },

  grid: { paddingTop: 16, paddingBottom: 8 },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#edf0f5',
    padding: 14,
    justifyContent: 'space-between',
    // @ts-ignore rn-web
    boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
  },
  icon: { fontSize: 22 },
  name: { fontSize: 15, fontWeight: '800', color: '#111827' },
  code: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  stockChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  stockText: { fontSize: 12, fontWeight: '800' },
  progress: { flex: 1, height: 8, backgroundColor: '#f1f5f9', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 999 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },

  /* Primary + ghost buttons for cards */
  btnPrimarySolid: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    // @ts-ignore rn-web
    cursor: 'pointer',
    // @ts-ignore rn-web
    boxShadow: '0 1px 0 rgba(0,0,0,0.06) inset',
  },
  btnPrimarySolidText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.2 },

  btnGhost: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    // @ts-ignore rn-web
    cursor: 'pointer',
  },
  btnGhostText: { fontSize: 13, fontWeight: '800', color: '#0f766e' },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eef0f3',
    padding: 18,
    // @ts-ignore rn-web
    boxShadow: '0 16px 40px rgba(2,8,23,0.2)',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  sheetLabel: { color: '#6b7280', marginBottom: 8 },

  /* ---- Requests list header / filters ---- */
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  filterRow: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  filterChipActive: { backgroundColor: '#e0e7ff', borderColor: '#2563eb' },
  filterChipText: { fontSize: 11, fontWeight: '800', color: '#374151' },
  filterChipTextActive: { color: '#1d4ed8' },

  /* ---- Form bits ---- */
  label: { color: '#6b7280', marginTop: 6, marginBottom: 6, fontSize: 12 },
  input: {
    backgroundColor: '#f3f4f6',
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  segmentActive: { borderColor: '#2563eb', backgroundColor: '#e0e7ff' },
  segmentText: { fontSize: 12, fontWeight: '800', color: '#374151' },
  segmentTextActive: { color: '#1d4ed8' },

  btn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  btnText: { color: '#111827', fontWeight: '700' },
  btnPrimary: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  btnPrimaryText: { color: 'white', fontWeight: '800' },

  /* ---- Request list items ---- */
  reqCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eef0f3',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    // @ts-ignore rn-web
    boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
  },
  reqTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  reqSub: { fontSize: 12, color: '#475569', marginTop: 2 },
  reqTime: { fontSize: 11, color: '#94a3b8', marginTop: 2 },

  /* ---- Modal footer ---- */
  footerRow: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    paddingHorizontal: 20,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    // @ts-ignore rn-web
    cursor: 'pointer',
  },
  closeBtnText: { color: 'white', fontWeight: '800' },
})
