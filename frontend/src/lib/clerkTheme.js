// Clerk widgets styled with our palette (CSS variables follow light/dark mode).
export const clerkAppearance = {
  variables: {
    colorPrimary: 'var(--c-brand)',
    colorPrimaryForeground: '#ffffff',
    colorBackground: 'var(--c-surface)',
    colorForeground: 'var(--c-ink)',
    colorMutedForeground: 'var(--c-muted)',
    colorInput: 'var(--c-surface)',
    colorNeutral: 'var(--c-ink)',
    borderRadius: '0.9rem',
    fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
  },
  elements: {
    card: { boxShadow: '0 20px 60px -20px rgb(0 0 0 / 0.25)', border: '1px solid var(--c-border)' },
  },
}
