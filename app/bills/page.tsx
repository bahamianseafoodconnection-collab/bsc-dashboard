const { data, error } = await supabase
  .from("bills")
  .select("id, bill_type, amount, created_at")
  .order("created_at", { ascending: false })