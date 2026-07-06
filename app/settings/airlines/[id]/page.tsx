'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHead, TableBody, Th, Td, TableRow, EmptyRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import {
  PlusCircle, Pencil, Trash2, ChevronRight, CreditCard, Plane,
  FileSpreadsheet, CheckCircle2, Star, Plus, X,
} from 'lucide-react'
import {
  getDemoSuppliers, getAirlinePaymentMethods, saveAirlinePaymentMethod,
  deleteAirlinePaymentMethod, generatePaymentMethodId,
  type DemoSupplier, type DemoAirlinePaymentMethod,
  type PaymentBankAccount, type PaymentChequeDetail,
  type PaymentCashDetail, type PaymentTopUpDetail, type PaymentOtherChannelDetail,
} from '@/lib/demo-storage'
import { getConditionTemplates, type DemoConditionTemplate } from '@/lib/template-storage'

// ─── Static airline data ──────────────────────────────────────────────────────

const ALL_AIRLINES = [
  { airline_code: 'TG', airline_name: 'Thai Airways International', status: 'Active' },
  { airline_code: 'FD', airline_name: 'Thai AirAsia', status: 'Active' },
  { airline_code: 'DD', airline_name: 'Nok Airlines', status: 'Active' },
  { airline_code: 'PG', airline_name: 'Bangkok Airways', status: 'Active' },
  { airline_code: 'JL', airline_name: 'Japan Airlines', status: 'Active' },
  { airline_code: 'NH', airline_name: 'All Nippon Airways', status: 'Active' },
  { airline_code: 'KE', airline_name: 'Korean Air', status: 'Active' },
  { airline_code: 'OZ', airline_name: 'Asiana Airlines', status: 'Active' },
  { airline_code: 'CX', airline_name: 'Cathay Pacific', status: 'Active' },
  { airline_code: 'SQ', airline_name: 'Singapore Airlines', status: 'Active' },
  { airline_code: 'MH', airline_name: 'Malaysia Airlines', status: 'Active' },
  { airline_code: 'EK', airline_name: 'Emirates', status: 'Active' },
  { airline_code: 'QR', airline_name: 'Qatar Airways', status: 'Active' },
  { airline_code: 'BA', airline_name: 'British Airways', status: 'Active' },
  { airline_code: 'LH', airline_name: 'Lufthansa', status: 'Active' },
]

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_TYPE_OPTIONS = [
  { value: 'RSVN_FEE',     label: 'RSVN Fee' },
  { value: 'DEPOSIT',      label: 'Deposit' },
  { value: 'BALANCE',      label: 'Balance' },
  { value: 'FULL_PAYMENT', label: 'Full Payment' },
  { value: 'FEE',          label: 'Fee' },
]
const PT_BADGE: Record<string, string> = {
  RSVN_FEE: 'RSVN', DEPOSIT: 'Deposit', BALANCE: 'Balance', FULL_PAYMENT: 'Full Pay', FEE: 'Fee',
}

const PAYMENT_CHANNEL_OPTIONS = [
  { value: 'BANK_TRANSFER',  label: 'โอนเงิน' },
  { value: 'CASH',           label: 'เงินสด' },
  { value: 'CHEQUE',         label: 'เช็ค' },
  { value: 'CREDIT_CARD',    label: 'บัตรเครดิต' },
  { value: 'DEBIT_CARD',     label: 'บัตรเดบิต' },
  { value: 'AUTO_DEBIT',     label: 'หักบัญชีอัตโนมัติ' },
  { value: 'ONLINE_PAYMENT', label: 'ชำระผ่านระบบออนไลน์' },
  { value: 'TOP_UP',         label: 'Top Up / Wallet' },
  { value: 'CREDIT_TERM',    label: 'เครดิตเทอม' },
  { value: 'OTHER',          label: 'อื่น ๆ' },
]
const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(
  PAYMENT_CHANNEL_OPTIONS.map(o => [o.value, o.label])
)

const THAI_BANKS = [
  'ธนาคารกรุงเทพ (BBL)', 'ธนาคารกสิกรไทย (KBank)', 'ธนาคารไทยพาณิชย์ (SCB)',
  'ธนาคารกรุงไทย (KTB)', 'ธนาคารกรุงศรีอยุธยา (BAY)', 'ธนาคารทหารไทยธนชาต (TTB)',
  'ธนาคารซีไอเอ็มบีไทย (CIMBT)', 'ธนาคารยูโอบี (UOB)', 'Bangkok Bank',
  'Kasikorn Bank (KBank)', 'Siam Commercial Bank (SCB)', 'Krungthai Bank (KTB)',
  'Bank of Ayudhya (Krungsri)', 'Citibank', 'Standard Chartered (SCBT)',
]

const ACCOUNT_TYPE_OPTIONS = ['ออมทรัพย์', 'กระแสรายวัน', 'ฝากประจำ', 'อื่นๆ']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function channelDisplayName(value: string, m: DemoAirlinePaymentMethod): string {
  if (value === 'OTHER') return m.otherChannelDetail?.channelName || m.customPaymentChannelName || 'อื่น ๆ'
  return CHANNEL_LABEL[value] ?? value
}

function emptyBankAccount(payeeDisplayName: string): PaymentBankAccount {
  return {
    accountId: `BA-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    accountLabel: '',
    accountName: payeeDisplayName,
    bankName: '',
    accountNo: '',
    branch: '',
    accountType: 'ออมทรัพย์',
    currency: 'THB',
    swiftCode: '',
    transferNote: '',
    isPrimary: true,
    status: 'Active',
  }
}

function emptyMethod(airlineCode: string, airlineName: string): DemoAirlinePaymentMethod {
  return {
    paymentMethodId: generatePaymentMethodId(),
    airlineCode,
    paymentMethodName: '',
    paymentRoute: 'direct',
    payeeSupplierId: null,
    payeeDisplayName: airlineName,
    supportedPaymentTypes: [],
    allowedPaymentChannels: [],
    defaultPaymentChannel: '',
    customPaymentChannelName: null,
    bankAccounts: [],
    chequeDetail: null,
    cashDetail: null,
    topUpDetail: null,
    otherChannelDetail: null,
    isDefault: false,
    status: 'Active',
    remark: '',
  }
}

function normalizeMethod(m: DemoAirlinePaymentMethod, airlineName: string): DemoAirlinePaymentMethod {
  return {
    ...m,
    payeeDisplayName: m.payeeDisplayName ?? airlineName,
    allowedPaymentChannels: m.allowedPaymentChannels ?? [],
    defaultPaymentChannel: m.defaultPaymentChannel ?? '',
    customPaymentChannelName: m.customPaymentChannelName ?? null,
    bankAccounts: m.bankAccounts ?? [],
    chequeDetail: m.chequeDetail ?? null,
    cashDetail: m.cashDetail ?? null,
    topUpDetail: m.topUpDetail ?? null,
    otherChannelDetail: m.otherChannelDetail ?? null,
  }
}

// ─── Shared input style ───────────────────────────────────────────────────────

const cls = (err?: boolean) =>
  `w-full px-3 py-2 text-sm border rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-[#05a94f]/30 focus:border-[#05a94f] ${err ? 'border-red-400' : 'border-slate-300'}`

// ─── Bank Accounts Section ────────────────────────────────────────────────────

const BankAccountsSection = memo(function BankAccountsSection({
  accounts, payeeDisplayName, onChange,
}: {
  accounts: PaymentBankAccount[]
  payeeDisplayName: string
  onChange: (accts: PaymentBankAccount[]) => void
}) {
  const patchAcct = (idx: number, patch: Partial<PaymentBankAccount>) => {
    const next = accounts.map((a, i) => i === idx ? { ...a, ...patch } : a)
    onChange(next)
  }

  const setPrimary = (idx: number, currency: string) => {
    const next = accounts.map((a, i) => ({
      ...a,
      isPrimary: a.currency === currency ? i === idx : a.isPrimary,
    }))
    onChange(next)
  }

  const removeAcct = (idx: number) => {
    const next = accounts.filter((_, i) => i !== idx)
    // if removed was primary and there are remaining same-currency accounts, set first as primary
    if (next.length > 0) {
      const removed = accounts[idx]
      const hasPrimary = next.some(a => a.currency === removed.currency && a.isPrimary)
      if (!hasPrimary) {
        const firstSameCurr = next.findIndex(a => a.currency === removed.currency)
        if (firstSameCurr >= 0) next[firstSameCurr] = { ...next[firstSameCurr], isPrimary: true }
      }
    }
    onChange(next)
  }

  const addAcct = () => {
    const base = emptyBankAccount(payeeDisplayName)
    // if accounts exist, only first should be primary for same currency
    if (accounts.some(a => a.currency === 'THB' && a.isPrimary)) base.isPrimary = false
    base.accountLabel = accounts.length > 0 ? `บัญชีที่ ${accounts.length + 1}` : ''
    onChange([...accounts, base])
  }

  return (
    <div className="space-y-3">
      {accounts.map((acct, idx) => (
        <div key={acct.accountId} className="border border-slate-200 rounded-lg p-3 space-y-3 bg-white">
          {/* Account header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                บัญชีที่ {idx + 1}
              </span>
              {acct.isPrimary && (
                <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-medium px-1.5 py-0.5 rounded-full">
                  <Star size={9} className="fill-amber-400 text-amber-400" />
                  บัญชีหลัก
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!acct.isPrimary && (
                <button
                  type="button"
                  onClick={() => setPrimary(idx, acct.currency)}
                  className="text-xs text-[#05a94f] hover:underline"
                >
                  ตั้งเป็นบัญชีหลัก
                </button>
              )}
              {accounts.length > 1 && (
                <button type="button" onClick={() => removeAcct(idx)} className="text-slate-400 hover:text-red-500">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Row 1: ชื่อบัญชี + ธนาคาร */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">ชื่อบัญชี <span className="text-red-500">*</span></label>
              <input value={acct.accountName} onChange={e => patchAcct(idx, { accountName: e.target.value })} className={cls(!acct.accountName)} placeholder="ชื่อผู้ถือบัญชี" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">ธนาคาร <span className="text-red-500">*</span></label>
              <input list={`banks-${idx}`} value={acct.bankName} onChange={e => patchAcct(idx, { bankName: e.target.value })} className={cls(!acct.bankName)} placeholder="เลือกหรือพิมพ์ธนาคาร" />
              <datalist id={`banks-${idx}`}>
                {THAI_BANKS.map(b => <option key={b} value={b} />)}
              </datalist>
            </div>
          </div>

          {/* Row 2: เลขที่บัญชี + สาขา */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">เลขที่บัญชี <span className="text-red-500">*</span></label>
              <input type="text" value={acct.accountNo} onChange={e => patchAcct(idx, { accountNo: e.target.value })} className={cls(!acct.accountNo)} placeholder="000-0-00000-0" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">สาขา</label>
              <input value={acct.branch} onChange={e => patchAcct(idx, { branch: e.target.value })} className={cls()} placeholder="สำนักงานใหญ่" />
            </div>
          </div>

          {/* Row 3: ประเภทบัญชี + สกุลเงิน + SWIFT */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">ประเภทบัญชี</label>
              <select value={acct.accountType} onChange={e => patchAcct(idx, { accountType: e.target.value })} className={cls()}>
                <option value="">—</option>
                {ACCOUNT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">สกุลเงิน</label>
              <input value={acct.currency} onChange={e => patchAcct(idx, { currency: e.target.value.toUpperCase() })} className={cls()} placeholder="THB" maxLength={3} />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">SWIFT Code</label>
              <input value={acct.swiftCode} onChange={e => patchAcct(idx, { swiftCode: e.target.value.toUpperCase() })} className={cls()} placeholder="BKKBTHBK" />
            </div>
          </div>

          {/* Row 4: หมายเหตุการโอน + ชื่อเรียกบัญชี */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">ชื่อเรียกบัญชี</label>
              <input value={acct.accountLabel} onChange={e => patchAcct(idx, { accountLabel: e.target.value })} className={cls()} placeholder="เช่น บัญชี THB หลัก" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">หมายเหตุการโอน</label>
              <input value={acct.transferNote} onChange={e => patchAcct(idx, { transferNote: e.target.value })} className={cls()} placeholder="เพิ่มเติม..." />
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addAcct}
        className="flex items-center gap-1.5 text-sm text-[#05a94f] hover:text-[#047a3a] font-medium py-1"
      >
        <Plus size={14} />
        {accounts.length === 0 ? 'เพิ่มบัญชีรับชำระ' : 'เพิ่มบัญชี'}
      </button>
    </div>
  )
})

// ─── Channel detail sub-sections ─────────────────────────────────────────────

function ChequeSection({
  detail, payeeDisplayName, onChange,
}: {
  detail: PaymentChequeDetail
  payeeDisplayName: string
  onChange: (d: PaymentChequeDetail) => void
}) {
  const p = (patch: Partial<PaymentChequeDetail>) => onChange({ ...detail, ...patch })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">ชื่อสั่งจ่าย <span className="text-red-500">*</span></label>
          <input value={detail.payeeName} onChange={e => p({ payeeName: e.target.value })} className={cls(!detail.payeeName)} placeholder={payeeDisplayName || 'ชื่อผู้รับเช็ค'} />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">ธนาคาร <span className="text-red-500">*</span></label>
          <input list="cheque-banks" value={detail.bankName} onChange={e => p({ bankName: e.target.value })} className={cls(!detail.bankName)} placeholder="ธนาคาร" />
          <datalist id="cheque-banks">{THAI_BANKS.map(b => <option key={b} value={b} />)}</datalist>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">สาขา</label>
          <input value={detail.branch} onChange={e => p({ branch: e.target.value })} className={cls()} placeholder="สาขา" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">หมายเหตุ</label>
          <input value={detail.note} onChange={e => p({ note: e.target.value })} className={cls()} placeholder="หมายเหตุ" />
        </div>
      </div>
    </div>
  )
}

function CashSection({
  detail, onChange,
}: {
  detail: PaymentCashDetail
  onChange: (d: PaymentCashDetail) => void
}) {
  const p = (patch: Partial<PaymentCashDetail>) => onChange({ ...detail, ...patch })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">ชื่อผู้รับเงินสด</label>
          <input value={detail.recipientName} onChange={e => p({ recipientName: e.target.value })} className={cls()} placeholder="ชื่อผู้รับเงิน" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">บริษัทหรือหน่วยงาน</label>
          <input value={detail.organization} onChange={e => p({ organization: e.target.value })} className={cls()} placeholder="บริษัท..." />
        </div>
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-700">หมายเหตุ</label>
        <input value={detail.note} onChange={e => p({ note: e.target.value })} className={cls()} placeholder="หมายเหตุ" />
      </div>
    </div>
  )
}

function TopUpSection({
  detail, onChange,
}: {
  detail: PaymentTopUpDetail
  onChange: (d: PaymentTopUpDetail) => void
}) {
  const p = (patch: Partial<PaymentTopUpDetail>) => onChange({ ...detail, ...patch })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">ชื่อระบบ</label>
          <input value={detail.systemName} onChange={e => p({ systemName: e.target.value })} className={cls()} placeholder="เช่น TrueMoney, PromptPay" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">Account ID / Wallet ID</label>
          <input value={detail.walletAccountId} onChange={e => p({ walletAccountId: e.target.value })} className={cls()} placeholder="ID หรือเบอร์โทร" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">ชื่อบัญชี</label>
          <input value={detail.accountName} onChange={e => p({ accountName: e.target.value })} className={cls()} placeholder="ชื่อผู้ถือ Wallet" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">หมายเหตุ</label>
          <input value={detail.note} onChange={e => p({ note: e.target.value })} className={cls()} placeholder="หมายเหตุ" />
        </div>
      </div>
    </div>
  )
}

function OtherChannelSection({
  detail, onChange, errors,
}: {
  detail: PaymentOtherChannelDetail
  onChange: (d: PaymentOtherChannelDetail) => void
  errors: Record<string, string>
}) {
  const p = (patch: Partial<PaymentOtherChannelDetail>) => onChange({ ...detail, ...patch })
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-700">ชื่อช่องทางอื่น <span className="text-red-500">*</span></label>
        <input value={detail.channelName} onChange={e => p({ channelName: e.target.value })} className={cls(!!errors.otherChannelName)} placeholder="ระบุชื่อช่องทาง" />
        {errors.otherChannelName && <p className="text-xs text-red-500">{errors.otherChannelName}</p>}
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-medium text-slate-700">รายละเอียดการชำระ</label>
        <textarea value={detail.description} onChange={e => p({ description: e.target.value })} rows={2} className={`${cls()} resize-none`} placeholder="รายละเอียดเพิ่มเติม" />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'info' | 'payment' | 'templates'

export default function AirlineDetailPage() {
  const { id } = useParams<{ id: string }>()
  const airlineCode = decodeURIComponent(id ?? '')
  const router = useRouter()

  const airline = ALL_AIRLINES.find(a => a.airline_code === airlineCode)
  const airlineName = airline?.airline_name ?? airlineCode

  const [tab, setTab] = useState<Tab>('info')
  const [methods, setMethods] = useState<DemoAirlinePaymentMethod[]>([])
  const [suppliers, setSuppliers] = useState<DemoSupplier[]>([])
  const [templates, setTemplates] = useState<DemoConditionTemplate[]>([])

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<DemoAirlinePaymentMethod>(emptyMethod(airlineCode, airlineName))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const refresh = useCallback(() => {
    setMethods(getAirlinePaymentMethods(airlineCode).map(m => normalizeMethod(m, airlineName)))
    setSuppliers(getDemoSuppliers())
    setTemplates(getConditionTemplates())
  }, [airlineCode, airlineName])

  useEffect(() => { refresh() }, [refresh])

  if (!airline) {
    return (
      <AppLayout title="Airline Not Found">
        <div className="text-center py-20 text-slate-500">ไม่พบสายการบิน: {airlineCode}</div>
      </AppLayout>
    )
  }

  // ── patch helpers ──────────────────────────────────────────────────────────

  const patch = (p: Partial<DemoAirlinePaymentMethod>) => setForm(f => ({ ...f, ...p }))

  const patchRoute = (route: 'direct' | 'intermediary') => {
    setForm(f => ({
      ...f,
      paymentRoute: route,
      payeeSupplierId: route === 'direct' ? null : f.payeeSupplierId,
      payeeDisplayName: route === 'direct' ? airlineName : (f.payeeSupplierId ? f.payeeDisplayName : ''),
    }))
  }

  const patchSupplier = (supplierId: string) => {
    const sup = suppliers.find(s => s.supplierId === supplierId)
    setForm(f => ({
      ...f,
      payeeSupplierId: supplierId || null,
      payeeDisplayName: f.payeeDisplayName || (sup?.supplierName ?? ''),
    }))
  }

  const togglePaymentType = (v: string) => {
    setForm(f => ({
      ...f,
      supportedPaymentTypes: f.supportedPaymentTypes.includes(v)
        ? f.supportedPaymentTypes.filter(x => x !== v)
        : [...f.supportedPaymentTypes, v],
    }))
  }

  const toggleChannel = (v: string) => {
    setForm(f => {
      const next = f.allowedPaymentChannels.includes(v)
        ? f.allowedPaymentChannels.filter(x => x !== v)
        : [...f.allowedPaymentChannels, v]
      let def = f.defaultPaymentChannel
      if (next.length === 1) def = next[0]
      else if (!next.includes(def)) def = ''
      // Initialize channel detail if newly added
      const newBankAccounts = next.includes('BANK_TRANSFER') && !f.allowedPaymentChannels.includes('BANK_TRANSFER')
        ? f.bankAccounts.length === 0 ? [emptyBankAccount(f.payeeDisplayName)] : f.bankAccounts
        : next.includes('BANK_TRANSFER') ? f.bankAccounts : f.bankAccounts
      const newCheque = next.includes('CHEQUE') && !f.chequeDetail
        ? { payeeName: f.payeeDisplayName, bankName: '', branch: '', note: '' }
        : next.includes('CHEQUE') ? f.chequeDetail : null
      const newCash = next.includes('CASH') ? (f.cashDetail ?? { recipientName: '', organization: '', note: '' }) : null
      const newTopUp = next.includes('TOP_UP') ? (f.topUpDetail ?? { systemName: '', walletAccountId: '', accountName: '', note: '' }) : null
      const newOther = next.includes('OTHER') ? (f.otherChannelDetail ?? { channelName: '', description: '' }) : null
      return { ...f, allowedPaymentChannels: next, defaultPaymentChannel: def, bankAccounts: next.includes('BANK_TRANSFER') ? newBankAccounts : [], chequeDetail: newCheque, cashDetail: newCash, topUpDetail: newTopUp, otherChannelDetail: newOther }
    })
  }

  // ── validate ───────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.paymentMethodName.trim()) e.paymentMethodName = 'กรุณากรอกชื่อวิธีการจ่าย'
    if (form.paymentRoute === 'intermediary' && !form.payeeSupplierId) e.payeeSupplierId = 'กรุณาเลือก Supplier'
    if (!form.payeeDisplayName.trim()) e.payeeDisplayName = 'กรุณากรอกชื่อผู้รับชำระ'
    if (form.supportedPaymentTypes.length === 0) e.supportedPaymentTypes = 'กรุณาเลือกอย่างน้อย 1 ประเภท'
    if (form.allowedPaymentChannels.length === 0) e.allowedPaymentChannels = 'กรุณาเลือกช่องทางอย่างน้อย 1 ช่องทาง'
    if (form.allowedPaymentChannels.length > 0 && !form.defaultPaymentChannel) e.defaultPaymentChannel = 'กรุณาเลือกช่องทางหลัก'
    if (form.allowedPaymentChannels.includes('BANK_TRANSFER')) {
      form.bankAccounts.forEach((a, i) => {
        if (!a.accountName.trim()) e[`bank_${i}_name`] = `บัญชีที่ ${i + 1}: กรุณากรอกชื่อบัญชี`
        if (!a.bankName.trim()) e[`bank_${i}_bank`] = `บัญชีที่ ${i + 1}: กรุณากรอกธนาคาร`
        if (!a.accountNo.trim()) e[`bank_${i}_no`] = `บัญชีที่ ${i + 1}: กรุณากรอกเลขที่บัญชี`
      })
    }
    if (form.allowedPaymentChannels.includes('CHEQUE')) {
      if (!form.chequeDetail?.payeeName?.trim()) e.chequeName = 'กรุณากรอกชื่อสั่งจ่าย'
      if (!form.chequeDetail?.bankName?.trim()) e.chequeBank = 'กรุณากรอกธนาคาร'
    }
    if (form.allowedPaymentChannels.includes('OTHER')) {
      if (!form.otherChannelDetail?.channelName?.trim()) e.otherChannelName = 'กรุณาระบุชื่อช่องทางอื่น'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── save ───────────────────────────────────────────────────────────────────

  const handleSave = () => {
    if (!validate()) return

    if (form.isDefault) {
      getAirlinePaymentMethods(airlineCode).forEach(m => {
        if (m.paymentMethodId === form.paymentMethodId || !m.isDefault) return
        if (m.supportedPaymentTypes.some(t => form.supportedPaymentTypes.includes(t))) {
          saveAirlinePaymentMethod({ ...normalizeMethod(m, airlineName), isDefault: false })
        }
      })
    }

    const saved: DemoAirlinePaymentMethod = {
      ...form,
      paymentMethodName: form.paymentMethodName.trim(),
      payeeDisplayName: form.payeeDisplayName.trim(),
      payeeSupplierId: form.paymentRoute === 'direct' ? null : form.payeeSupplierId,
      customPaymentChannelName: form.allowedPaymentChannels.includes('OTHER')
        ? (form.otherChannelDetail?.channelName?.trim() ?? null)
        : null,
    }
    saveAirlinePaymentMethod(saved)
    refresh()
    setModal(false)
  }

  const handleDelete = (m: DemoAirlinePaymentMethod) => {
    if (!window.confirm(`ลบวิธีการจ่าย "${m.paymentMethodName}" ใช่หรือไม่?`)) return
    deleteAirlinePaymentMethod(m.paymentMethodId)
    refresh()
  }

  // ── derived ────────────────────────────────────────────────────────────────

  const activeSuppliers = suppliers.filter(s => s.status === 'Active')
  const isEditing = methods.some(m => m.paymentMethodId === form.paymentMethodId)

  const airlineTemplates = templates.filter(t =>
    !t.airlineCode || t.airlineCode === airlineCode ||
    (t.airlines && t.airlines.includes(airlineCode))
  )

  const selectableChannels = form.allowedPaymentChannels.map(v => ({
    value: v,
    label: v === 'OTHER'
      ? `อื่น ๆ${form.otherChannelDetail?.channelName ? ` (${form.otherChannelDetail.channelName})` : ''}`
      : (CHANNEL_LABEL[v] ?? v),
  }))

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'info',      label: 'ข้อมูลสายการบิน',   icon: <Plane size={14} /> },
    { key: 'payment',   label: 'วิธีการจ่าย',         icon: <CreditCard size={14} /> },
    { key: 'templates', label: 'Condition Templates', icon: <FileSpreadsheet size={14} /> },
  ]

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AppLayout title={`Airline: ${airlineCode}`}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-5">
        <button onClick={() => router.push('/settings/airlines')} className="hover:text-[#05a94f] transition-colors">
          Airlines
        </button>
        <ChevronRight size={13} />
        <span className="text-slate-900 font-medium">{airlineCode}</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-base font-bold text-slate-700">{airlineCode}</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{airline.airline_name}</h1>
          <Badge variant={airline.status === 'Active' ? 'green' : 'gray'} className="mt-1">{airline.status}</Badge>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-slate-200 mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px border-b-2 ${
              tab === t.key
                ? 'text-[#05a94f] border-[#05a94f] bg-white'
                : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.icon}
            {t.label}
            {t.key === 'payment' && methods.length > 0 && (
              <span className="ml-1 bg-slate-200 text-slate-600 text-[10px] font-semibold px-1.5 rounded-full">
                {methods.length}
              </span>
            )}
            {t.key === 'templates' && airlineTemplates.length > 0 && (
              <span className="ml-1 bg-slate-200 text-slate-600 text-[10px] font-semibold px-1.5 rounded-full">
                {airlineTemplates.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: ข้อมูลสายการบิน ─────────────────────────────────────────── */}
      {tab === 'info' && (
        <Card>
          <CardContent className="pt-5">
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <div>
                <p className="text-xs text-slate-500 mb-1">Airline Code</p>
                <p className="text-sm font-semibold text-slate-900">{airline.airline_code}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">สถานะ</p>
                <Badge variant={airline.status === 'Active' ? 'green' : 'gray'}>{airline.status}</Badge>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-500 mb-1">ชื่อสายการบิน</p>
                <p className="text-sm font-medium text-slate-900">{airline.airline_name}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Tab: วิธีการจ่าย ──────────────────────────────────────────────── */}
      {tab === 'payment' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              วิธีการจ่ายสำหรับ <span className="font-medium text-slate-700">{airline.airline_name}</span>
            </p>
            <Button size="sm" icon={<PlusCircle size={14} />} onClick={() => {
              setForm(emptyMethod(airlineCode, airlineName))
              setErrors({})
              setModal(true)
            }}>
              เพิ่มวิธีการจ่าย
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHead>
                  <tr>
                    <Th>ชื่อวิธีการจ่าย</Th>
                    <Th>รูปแบบ</Th>
                    <Th>ชำระให้</Th>
                    <Th>ประเภทที่รองรับ</Th>
                    <Th>ช่องทางการชำระเงิน</Th>
                    <Th>ช่องทางหลัก</Th>
                    <Th>ค่าเริ่มต้น</Th>
                    <Th>สถานะ</Th>
                    <Th>Action</Th>
                  </tr>
                </TableHead>
                <TableBody>
                  {methods.length === 0 ? (
                    <EmptyRow cols={9} message="ยังไม่มีวิธีการจ่าย" />
                  ) : (
                    methods.map(m => (
                      <TableRow key={m.paymentMethodId}>
                        <Td className="font-medium">{m.paymentMethodName}</Td>
                        <Td>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            m.paymentRoute === 'direct' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                          }`}>
                            {m.paymentRoute === 'direct' ? 'จ่ายตรง' : 'ผ่านตัวกลาง'}
                          </span>
                        </Td>
                        <Td className="text-sm text-slate-700 max-w-[140px] truncate" title={m.payeeDisplayName}>
                          {m.payeeDisplayName || '—'}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {m.supportedPaymentTypes.map(t => (
                              <span key={t} className="bg-slate-100 text-slate-600 text-[10px] font-medium px-1.5 py-0.5 rounded">
                                {PT_BADGE[t] ?? t}
                              </span>
                            ))}
                          </div>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {m.allowedPaymentChannels.length === 0 ? (
                              <span className="text-slate-400 text-xs">—</span>
                            ) : m.allowedPaymentChannels.map(ch => (
                              <span key={ch} className="bg-indigo-50 text-indigo-700 text-[10px] font-medium px-1.5 py-0.5 rounded">
                                {channelDisplayName(ch, m)}
                              </span>
                            ))}
                          </div>
                        </Td>
                        <Td>
                          {m.defaultPaymentChannel ? (
                            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-medium px-2 py-0.5 rounded-full">
                              <Star size={10} className="fill-amber-400 text-amber-400" />
                              {channelDisplayName(m.defaultPaymentChannel, m)}
                            </span>
                          ) : <span className="text-slate-400 text-xs">—</span>}
                        </Td>
                        <Td>
                          {m.isDefault && (
                            <span className="inline-flex items-center gap-1 text-[#05a94f] text-xs font-medium">
                              <CheckCircle2 size={13} />
                              Default
                            </span>
                          )}
                        </Td>
                        <Td>
                          <Badge variant={m.status === 'Active' ? 'green' : 'gray'}>{m.status}</Badge>
                        </Td>
                        <Td>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" icon={<Pencil size={13} />} className="p-1.5" onClick={() => {
                              setForm(normalizeMethod({ ...m }, airlineName))
                              setErrors({})
                              setModal(true)
                            }} />
                            <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} className="p-1.5 text-red-400 hover:text-red-600" onClick={() => handleDelete(m)} />
                          </div>
                        </Td>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Tab: Condition Templates ──────────────────────────────────────── */}
      {tab === 'templates' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              Condition Templates สำหรับ <span className="font-medium text-slate-700">{airline.airline_name}</span>
            </p>
            <Button size="sm" variant="outline" icon={<FileSpreadsheet size={14} />}
              onClick={() => router.push('/settings/condition-templates')}>
              จัดการ Templates
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHead>
                  <tr>
                    <Th>Code</Th><Th>ชื่อ Template</Th><Th>Ticket Type</Th>
                    <Th>Stages</Th><Th>Version</Th><Th>สถานะ</Th>
                  </tr>
                </TableHead>
                <TableBody>
                  {airlineTemplates.length === 0 ? (
                    <EmptyRow cols={6} message="ไม่มี Condition Templates สำหรับสายการบินนี้" />
                  ) : airlineTemplates.map(t => (
                    <TableRow key={t.templateId}>
                      <Td className="font-mono text-sm font-semibold text-slate-700">{t.templateCode}</Td>
                      <Td className="font-medium">{t.templateName}</Td>
                      <Td className="text-sm text-slate-600">{t.ticketType}</Td>
                      <Td className="text-sm text-slate-600">{t.stages.length} Stages</Td>
                      <Td className="text-sm text-slate-500">v{t.version}</Td>
                      <Td><Badge variant={t.status === 'Active' ? 'green' : 'gray'}>{t.status}</Badge></Td>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Modal: Add/Edit Payment Method ───────────────────────────────── */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={isEditing ? 'แก้ไขวิธีการจ่าย' : 'เพิ่มวิธีการจ่าย'}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(false)}>ยกเลิก</Button>
            <Button onClick={handleSave}>บันทึก</Button>
          </>
        }
      >
        <div className="space-y-0 divide-y divide-slate-100">

          {/* ── 1. ข้อมูลวิธีการจ่าย ──────────────────────────────────────── */}
          <div className="pb-5 space-y-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-1">ข้อมูลวิธีการจ่าย</p>

            {/* ชื่อวิธีการจ่าย */}
            <Input
              label="ชื่อวิธีการจ่าย"
              value={form.paymentMethodName}
              onChange={e => patch({ paymentMethodName: e.target.value })}
              required
              error={errors.paymentMethodName}
              placeholder="เช่น โอนตรงให้ TG, โอนผ่าน Amadeus"
            />

            {/* รูปแบบการจ่าย */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                รูปแบบการจ่าย <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'direct',       label: 'จ่ายตรงให้สายการบิน' },
                  { value: 'intermediary', label: 'จ่ายผ่านตัวกลาง' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => patchRoute(opt.value as 'direct' | 'intermediary')}
                    className={`px-3 py-2.5 text-sm rounded-lg border text-left transition-colors ${
                      form.paymentRoute === opt.value
                        ? 'bg-[#05a94f]/10 border-[#05a94f] text-[#05a94f] font-medium'
                        : 'border-slate-300 text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Supplier dropdown — intermediary only */}
            {form.paymentRoute === 'intermediary' && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Supplier <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.payeeSupplierId ?? ''}
                  onChange={e => patchSupplier(e.target.value)}
                  className={cls(!!errors.payeeSupplierId)}
                >
                  <option value="">— เลือก Supplier —</option>
                  {activeSuppliers.map(s => (
                    <option key={s.supplierId} value={s.supplierId}>
                      {s.supplierName} ({s.supplierCode})
                    </option>
                  ))}
                </select>
                {errors.payeeSupplierId && <p className="text-xs text-red-500 mt-1">{errors.payeeSupplierId}</p>}
              </div>
            )}

            {/* ชำระให้ */}
            <div className="space-y-1">
              <Input
                label="ชำระให้"
                value={form.payeeDisplayName}
                onChange={e => patch({ payeeDisplayName: e.target.value })}
                required
                error={errors.payeeDisplayName}
                helper="ชื่อผู้รับชำระที่จะแสดงในใบเบิก สามารถปรับแก้ได้"
                placeholder={form.paymentRoute === 'direct' ? airlineName : 'ชื่อผู้รับชำระ'}
              />
            </div>
          </div>

          {/* ── 2. ประเภทการจ่ายที่รองรับ ─────────────────────────────────── */}
          <div className="py-5 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">ประเภทการจ่ายที่รองรับ</p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_TYPE_OPTIONS.map(opt => {
                const sel = form.supportedPaymentTypes.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => togglePaymentType(opt.value)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      sel ? 'bg-[#05a94f] text-white border-[#05a94f]' : 'border-slate-300 text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {errors.supportedPaymentTypes && <p className="text-xs text-red-500">{errors.supportedPaymentTypes}</p>}
          </div>

          {/* ── 3. ช่องทางการชำระเงิน ─────────────────────────────────────── */}
          <div className="py-5 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">ช่องทางการชำระเงิน</p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 p-3 border border-slate-200 rounded-lg bg-slate-50">
              {PAYMENT_CHANNEL_OPTIONS.map(opt => {
                const checked = form.allowedPaymentChannels.includes(opt.value)
                return (
                  <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChannel(opt.value)}
                      className="w-4 h-4 rounded accent-[#05a94f] cursor-pointer"
                    />
                    <span className={`text-sm transition-colors ${checked ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
                      {opt.label}
                    </span>
                  </label>
                )
              })}
            </div>
            {errors.allowedPaymentChannels && <p className="text-xs text-red-500">{errors.allowedPaymentChannels}</p>}

            {/* ช่องทางหลัก */}
            {form.allowedPaymentChannels.length > 0 && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  ช่องทางหลัก <span className="text-red-500">*</span>
                  <span className="ml-1.5 font-normal text-slate-400">— ใช้เป็นค่าเริ่มต้นในใบเบิก</span>
                </label>
                {form.allowedPaymentChannels.length === 1 ? (
                  <div className="w-full px-3 py-2 text-sm border rounded-lg bg-slate-50 text-slate-700 border-slate-200">
                    <span className="inline-flex items-center gap-1.5">
                      <Star size={12} className="fill-amber-400 text-amber-400" />
                      {selectableChannels[0]?.label} — เลือกอัตโนมัติ
                    </span>
                  </div>
                ) : (
                  <div>
                    <select
                      value={form.defaultPaymentChannel}
                      onChange={e => patch({ defaultPaymentChannel: e.target.value })}
                      className={cls(!!errors.defaultPaymentChannel)}
                    >
                      <option value="">— เลือกช่องทางหลัก —</option>
                      {selectableChannels.map(ch => (
                        <option key={ch.value} value={ch.value}>{ch.label}</option>
                      ))}
                    </select>
                    {errors.defaultPaymentChannel && <p className="text-xs text-red-500 mt-1">{errors.defaultPaymentChannel}</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 4. รายละเอียดการรับชำระ ───────────────────────────────────── */}
          {(form.allowedPaymentChannels.includes('BANK_TRANSFER') ||
            form.allowedPaymentChannels.includes('CHEQUE') ||
            form.allowedPaymentChannels.includes('CASH') ||
            form.allowedPaymentChannels.includes('TOP_UP') ||
            form.allowedPaymentChannels.includes('OTHER')) && (
            <div className="py-5 space-y-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">รายละเอียดการรับชำระ</p>

              {/* โอนเงิน → บัญชีรับชำระ */}
              {form.allowedPaymentChannels.includes('BANK_TRANSFER') && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                    บัญชีรับชำระ (โอนเงิน)
                  </p>
                  <BankAccountsSection
                    accounts={form.bankAccounts}
                    payeeDisplayName={form.payeeDisplayName}
                    onChange={bankAccounts => patch({ bankAccounts })}
                  />
                </div>
              )}

              {/* เช็ค */}
              {form.allowedPaymentChannels.includes('CHEQUE') && form.chequeDetail && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                    รายละเอียดเช็ค
                  </p>
                  <div className="border border-slate-200 rounded-lg p-3 bg-white">
                    <ChequeSection
                      detail={form.chequeDetail}
                      payeeDisplayName={form.payeeDisplayName}
                      onChange={chequeDetail => patch({ chequeDetail })}
                    />
                  </div>
                </div>
              )}

              {/* เงินสด */}
              {form.allowedPaymentChannels.includes('CASH') && form.cashDetail && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                    รายละเอียดเงินสด
                  </p>
                  <div className="border border-slate-200 rounded-lg p-3 bg-white">
                    <CashSection
                      detail={form.cashDetail}
                      onChange={cashDetail => patch({ cashDetail })}
                    />
                  </div>
                </div>
              )}

              {/* Top Up / Wallet */}
              {form.allowedPaymentChannels.includes('TOP_UP') && form.topUpDetail && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                    รายละเอียด Top Up / Wallet
                  </p>
                  <div className="border border-slate-200 rounded-lg p-3 bg-white">
                    <TopUpSection
                      detail={form.topUpDetail}
                      onChange={topUpDetail => patch({ topUpDetail })}
                    />
                  </div>
                </div>
              )}

              {/* อื่น ๆ */}
              {form.allowedPaymentChannels.includes('OTHER') && form.otherChannelDetail && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                    ช่องทางอื่น ๆ
                  </p>
                  <div className="border border-slate-200 rounded-lg p-3 bg-white">
                    <OtherChannelSection
                      detail={form.otherChannelDetail}
                      onChange={d => patch({ otherChannelDetail: d, customPaymentChannelName: d.channelName || null })}
                      errors={errors}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 5. ค่าเริ่มต้น + สถานะ + หมายเหตุ ──────────────────────── */}
          <div className="pt-5 space-y-4">

            {/* ตั้งเป็นค่าเริ่มต้น */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={e => patch({ isDefault: e.target.checked })}
                className="w-4 h-4 rounded accent-[#05a94f] mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-slate-700">ตั้งเป็นวิธีการจ่ายเริ่มต้น</span>
                <p className="text-xs text-slate-400 mt-0.5">กำหนดค่าเริ่มต้นแยกตามประเภทการจ่าย (1 รายการต่อประเภท)</p>
              </div>
            </label>

            {/* สถานะ */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">สถานะ</label>
              <div className="flex gap-2">
                {(['Active', 'Inactive'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => patch({ status: v })}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      form.status === v ? 'bg-[#05a94f] text-white border-[#05a94f]' : 'border-slate-300 text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* หมายเหตุ */}
            <Textarea
              label="หมายเหตุ"
              value={form.remark}
              onChange={e => patch({ remark: e.target.value })}
              rows={2}
              placeholder="เช่น ใช้สำหรับ PNR ที่ออกผ่าน Amadeus และชำระด้วยการโอนเงิน"
            />
          </div>

        </div>
      </Modal>
    </AppLayout>
  )
}
