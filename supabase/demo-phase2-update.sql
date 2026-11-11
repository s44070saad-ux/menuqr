-- Spice Route demo: "pairs well with" pairings for Phase 2.1.
-- Re-runnable; matches items by name inside the spice-route restaurant.
update public.menu_items mi set suggested_item_ids = coalesce((
  select array_agg(x.id) from public.menu_items x
  where x.restaurant_id = mi.restaurant_id and x.name in ('Mint Margarita', 'Tandoori Roti')
), '{}')
from public.restaurants r
where r.id = mi.restaurant_id and r.slug = 'spice-route' and mi.name = 'Chicken Malai Boti';

update public.menu_items mi set suggested_item_ids = coalesce((
  select array_agg(x.id) from public.menu_items x
  where x.restaurant_id = mi.restaurant_id and x.name in ('Tandoori Roti', 'Mint Margarita')
), '{}')
from public.restaurants r
where r.id = mi.restaurant_id and r.slug = 'spice-route' and mi.name = 'Chicken Karahi';

update public.menu_items mi set suggested_item_ids = coalesce((
  select array_agg(x.id) from public.menu_items x
  where x.restaurant_id = mi.restaurant_id and x.name in ('Mint Margarita')
), '{}')
from public.restaurants r
where r.id = mi.restaurant_id and r.slug = 'spice-route' and mi.name = 'Chicken Dum Biryani';

-- Verification: expect 3 rows with 1-2 suggestions each.
select mi.name, array_length(mi.suggested_item_ids, 1) as suggestions
from public.menu_items mi join public.restaurants r on r.id = mi.restaurant_id
where r.slug = 'spice-route' and cardinality(mi.suggested_item_ids) > 0;
