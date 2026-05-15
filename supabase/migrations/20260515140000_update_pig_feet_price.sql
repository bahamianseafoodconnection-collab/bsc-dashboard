-- Bumps Pig Feet (PIG-FEET-BB) sell price from $1.49/lb to $1.59/lb on
-- both Nassau POS and Online Market. Market reference stays $1.49 — BSC
-- now sells 10c above market to capture extra margin.
--
-- Cost stays at $1.05/lb. Margin moves from $0.44 (29.5%) to $0.54 (34.0%).

BEGIN;

UPDATE product_pricing
SET manual_unit_price = 1.59,
    effective_from = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'PIG-FEET-BB')
  AND channel IN ('nassau_pos', 'online_market')
  AND is_current = TRUE
  AND is_active = TRUE;

-- Verify — should return two rows at 1.59
SELECT p.sku, pp.channel, pp.manual_unit_price AS sell_price, pp.effective_from
FROM products p
JOIN product_pricing pp ON pp.product_id = p.id
WHERE p.sku = 'PIG-FEET-BB'
  AND pp.is_current = TRUE
  AND pp.is_active = TRUE
ORDER BY pp.channel;

COMMIT;
