'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Dashboard() {
const [data, setData] = useState<any[]>([])

useEffect(() => {
fetchData()
}, [])

const fetchData = async () => {
const { data, error } = await supabase
.from('what_to_buy_ranked')
.select('*')

if (!error) setData(data || [])
}

return (
<div style={{ padding: 20 }}>
<h1>BSC Dashboard</h1>

<table border={1} cellPadding={10}>
<thead>
<tr>
<th>Product</th>
<th>Qty</th>
<th>Reorder</th>
<th>Buy</th>
<th>Profit</th>
</tr>
</thead>
<tbody>
{data.map((item, i) => (
<tr key={i}>
<td>{item.product_name}</td>
<td>{item.quantity}</td>
<td>{item.reorder_level}</td>
<td>{item.qty_to_order}</td>
<td>${item.potential_profit}</td>
</tr>
))}
</tbody>
</table>
</div>
)
}
