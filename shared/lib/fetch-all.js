// Supabase returns at most 1,000 rows per request, silently. fetchAll(() => supabase.from(...).select(...).order(...)) reads every page
// and returns the same { data, error } shape. The query needs a stable order (end it with a unique column) and is rebuilt for each page.
export async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
}
