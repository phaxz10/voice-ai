import type {
  CapabilityReport,
  CatalogModel,
  PrimaryLanguage
} from './types'

const FAMILY_ORDER: CatalogModel['family'][] = [
  'tiny',
  'base',
  'small',
  'medium',
  'large-v3-turbo',
  'custom',
]

type Entry = Omit<CatalogModel, 'available'>

// ONNX Whisper models loaded by Transformers.js (ADR-0007). Sizes are approximate.
const ENTRIES: Entry[] = [
  { id: 'tiny.en', label: 'Tiny (English)', family: 'tiny', hfId: 'Xenova/whisper-tiny.en', englishOnly: true, multilingual: false, sizeMb: 120, ramCeilingMb: 400, requiresWebGPU: false, languages: { en: 2 } },
  { id: 'tiny', label: 'Tiny', family: 'tiny', hfId: 'Xenova/whisper-tiny', englishOnly: false, multilingual: true, sizeMb: 120, ramCeilingMb: 400, requiresWebGPU: false, languages: { en: 1, zh: 1, ja: 1, yue: 0, tl: 1 } },
  { id: 'base.en', label: 'Base (English)', family: 'base', hfId: 'Xenova/whisper-base.en', englishOnly: true, multilingual: false, sizeMb: 210, ramCeilingMb: 600, requiresWebGPU: false, languages: { en: 3 } },
  { id: 'base', label: 'Base', family: 'base', hfId: 'Xenova/whisper-base', englishOnly: false, multilingual: true, sizeMb: 210, ramCeilingMb: 600, requiresWebGPU: false, languages: { en: 2, zh: 1, ja: 1, yue: 1, tl: 1 } },
  { id: 'small.en', label: 'Small (English)', family: 'small', hfId: 'Xenova/whisper-small.en', englishOnly: true, multilingual: false, sizeMb: 480, ramCeilingMb: 1200, requiresWebGPU: false, languages: { en: 3 } },
  { id: 'small', label: 'Small', family: 'small', hfId: 'Xenova/whisper-small', englishOnly: false, multilingual: true, sizeMb: 480, ramCeilingMb: 1200, requiresWebGPU: false, languages: { en: 2, zh: 2, ja: 2, yue: 1, tl: 2 } },
  // We request word-level timestamps (return_timestamps: 'word'), which needs a decoder exported
  // WITH cross-attentions. The canonical `whisper-large-v3-turbo` export lacks them and throws
  // "Model outputs must contain cross attentions"; the `_timestamped` sibling is re-exported with
  // output_attentions=True (same q4/fp16 ONNX variants). Don't revert this id — it reintroduces the crash.
  { id: 'large-v3-turbo', label: 'Large v3 Turbo', family: 'large-v3-turbo', hfId: 'onnx-community/whisper-large-v3-turbo_timestamped', englishOnly: false, multilingual: true, sizeMb: 1600, ramCeilingMb: 2400, requiresWebGPU: true, languages: { en: 3, zh: 3, ja: 3, yue: 2, tl: 2 } },
]

export function buildCatalog(): CatalogModel[] {
  return ENTRIES.map((e) => ({ ...e, available: true }))
}

/** Build a custom catalog model from any HF id (Transformers.js Sideload-by-id). */
export function customModel(hfId: string): CatalogModel {
  const clean = hfId.trim().replace(/^https?:\/\/huggingface\.co\//, '')
  return {
    id: `custom:${clean}`,
    label: clean.split('/').pop() || clean,
    family: 'custom',
    hfId: clean,
    englishOnly: false,
    multilingual: true,
    sizeMb: 0,
    ramCeilingMb: 1500,
    requiresWebGPU: false,
    languages: {},
    available: true,
    custom: true,
  }
}

function familyRank(m: CatalogModel): number {
  return FAMILY_ORDER.indexOf(m.family)
}

const TIER_MAX_RAM: Record<CapabilityReport['tier'], number> = {
  low: 700,
  medium: 1300,
  high: 4096,
}

/** Device- + language-adaptive Recommended Model (ADR-0003 / ADR-0007). */
export function recommendModel(
  catalog: CatalogModel[],
  cap: CapabilityReport,
  primary: PrimaryLanguage,
): CatalogModel | null {
  const english = primary === 'en'
  const maxRam = TIER_MAX_RAM[cap.tier]

  const usable = catalog.filter(
    (m) =>
      m.available &&
      !m.custom &&
      m.ramCeilingMb <= maxRam &&
      (!m.requiresWebGPU || cap.webgpu) &&
      (english ? m.englishOnly || m.multilingual : m.multilingual) &&
      (primary === 'auto' || english || (m.languages[primary] ?? 0) >= 1),
  )

  const ranked = usable.sort((a, b) => {
    const fr = familyRank(b) - familyRank(a)
    if (fr !== 0) return fr
    return english
      ? Number(b.englishOnly) - Number(a.englishOnly)
      : Number(b.multilingual) - Number(a.multilingual)
  })

  return ranked[0] ?? catalog.find((m) => m.available && !m.custom) ?? null
}
