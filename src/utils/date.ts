export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** 今天 / 昨天 / 前天 / N天前 + 时间；超过 30 天则显示完整日期时间 */
export function formatRelativeDate(ts: number): string {
  const target = startOfDay(new Date(ts))
  const today = startOfDay(new Date())
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000)
  const time = formatTime(ts)

  if (diffDays < 0) return formatDateTime(ts)
  if (diffDays === 0) return `今天 ${time}`
  if (diffDays === 1) return `昨天 ${time}`
  if (diffDays === 2) return `前天 ${time}`
  if (diffDays <= 30) return `${diffDays}天前 ${time}`
  return formatDateTime(ts)
}
