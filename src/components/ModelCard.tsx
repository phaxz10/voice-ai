import { Check, Trash2 } from 'lucide-react'
import type { CatalogModel } from '@/lib/types'
import { cn, formatMb } from '@/lib/utils'

const LANG_LABELS: Record<string, string> = {
  en: 'EN',
  zh: 'ZH',
  yue: 'YUE',
  ja: 'JA',
  tl: 'TL',
}
const TRANSCRIPTION_LANG_ORDER = ['en', 'zh', 'yue', 'ja', 'tl']

function Dots({ q }: { q: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn('size-1.5 rounded-full', i <= q ? 'bg-primary' : 'bg-muted-foreground/30')}
        />
      ))}
    </span>
  )
}

export function ModelCard({
  model,
  recommended,
  selected,
  provisioned,
  active,
  busy,
  onSelect,
  onEvict,
}: {
  model: CatalogModel
  recommended: boolean
  selected: boolean
  /** Weights are present in Cache Storage. */
  provisioned: boolean
  /** This is the Active Model. */
  active: boolean
  busy?: boolean
  onSelect: (m: CatalogModel) => void
  onEvict?: (m: CatalogModel) => void
}) {
  const disabled = !model.available || busy
  const status = active
    ? 'Active'
    : provisioned
      ? 'Downloaded'
      : recommended
        ? 'Recommended'
        : selected
          ? 'Selected'
          : ''
  const modelScope = model.multilingual ? 'Multilingual model' : 'English-only model'
  const engineNote = model.requiresWebGPU ? 'Requires WebGPU' : 'Runs on WebGPU or CPU'

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      onClick={() => !disabled && onSelect(model)}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(model)
        }
      }}
      className={cn(
        'group relative flex flex-col gap-3 rounded-lg border bg-card p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60',
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'cursor-pointer hover:border-primary/60',
        selected && 'border-primary ring-1 ring-primary',
        active && !selected && 'border-primary/60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-medium">{model.label}</div>
          <div className="text-xs text-muted-foreground">
            {provisioned
              ? 'Downloaded. Ready offline'
              : model.sizeMb > 0
                ? `${formatMb(model.sizeMb)} download`
                : 'Size varies'}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {status && (
            <span className="text-xs font-medium text-primary">
              {status}
            </span>
          )}
          {selected && !active && !provisioned && !recommended && (
            <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-3" />
            </span>
          )}
          {provisioned && onEvict && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEvict(model)
              }}
              className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-destructive focus-visible:text-destructive focus-visible:outline-none"
              title="Remove this model from cache (Evict)"
            >
              <Trash2 className="size-3" /> Remove
            </button>
          )}
        </div>
      </div>

      <div className="text-sm leading-6 text-muted-foreground">
        {modelScope}. {engineNote}.
      </div>

      <div className="grid grid-cols-5 gap-1 border-t pt-2.5">
        {TRANSCRIPTION_LANG_ORDER.map((l) => (
          <div key={l} className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">{LANG_LABELS[l]}</span>
            <Dots q={model.languages[l] ?? 0} />
          </div>
        ))}
      </div>
    </div>
  )
}
