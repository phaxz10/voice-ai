import { Coffee } from 'lucide-react'

export const BUYMEACOFFEE_URL = 'https://buymeacoffee.com/phaxz10'

/**
 * Fuller support card for the Landing screen. The header uses a compact
 * button instead (see TopBar), both linking to {@link BUYMEACOFFEE_URL}.
 */
export function SupportCard() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
      <div className="space-y-1">
        <h3 className="font-semibold tracking-tight">Enjoying LocalTranscribeAI?</h3>
        <p className="text-sm text-muted-foreground">
          It runs entirely on your device and stays free. Your support helps
          keep it that way.
        </p>
      </div>
      <a
        href={BUYMEACOFFEE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#FFDD00] px-4 py-2.5 font-medium text-[#000000] transition-colors hover:bg-[#E5C700]"
      >
        <Coffee className="size-5" />
        Buy me a coffee
      </a>
    </div>
  )
}
