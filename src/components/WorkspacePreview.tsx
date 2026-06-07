import { Mic2, type LucideIcon } from 'lucide-react'

/** A single feature bullet, shared by the home views. */
export function FeaturePoint({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon
  title: string
  body: string
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

/**
 * A static mock of the transcript workspace. Used on the home views so the
 * landing previews the exact surface the tool opens into — minimal visual jump.
 */
export function WorkspacePreview() {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-secondary text-secondary-foreground">
            <Mic2 className="size-4" />
          </span>
          <span className="truncate font-medium">Transcript workspace</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">00:00</span>
      </div>

      <div className="space-y-5 p-4">
        <div className="flex h-20 items-center gap-1 rounded-md border bg-background px-4">
          {[18, 30, 42, 26, 54, 68, 34, 46, 22, 58, 72, 38, 30, 48, 64, 28, 20].map(
            (h, i) => (
              <span
                key={i}
                className="w-1.5 rounded-full bg-primary/70"
                style={{ height: `${h}%` }}
              />
            ),
          )}
        </div>

        <div className="space-y-3">
          <div className="h-3 w-11/12 rounded-full bg-secondary" />
          <div className="h-3 w-4/5 rounded-full bg-secondary" />
          <div className="h-3 w-9/12 rounded-full bg-secondary" />
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <span className="h-8 w-20 rounded-md border bg-background" />
          <span className="h-8 w-16 rounded-md border bg-background" />
          <span className="h-8 w-24 rounded-md border bg-background" />
        </div>
      </div>
    </div>
  )
}
