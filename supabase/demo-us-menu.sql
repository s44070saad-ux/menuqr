-- =====================================================================
-- Velora — DEMO CONVERSION: Spice Route demo menu -> US/EU menu.
-- Run once in the Supabase SQL editor (project menuqr). DEMO ONLY:
-- wipes Spice Route's categories/items (options + translations
-- cascade) and reseeds a 24-item US/EU cafe-grill menu in USD.
-- The restaurant row, slug, settings, orders and plan are untouched
-- except currency + description. Historical order lines keep their
-- item-name snapshots (menu_item_id goes null by FK design).
-- =====================================================================
do $$
declare
  v_rest uuid; v_cat uuid; v_item uuid; v_group uuid;
begin
  select id into v_rest from public.restaurants where slug = 'spice-route';
  if v_rest is null then raise exception 'DEMO_RESTAURANT_NOT_FOUND'; end if;

  delete from public.menu_items where restaurant_id = v_rest;
  delete from public.categories where restaurant_id = v_rest;

  update public.restaurants
     set currency = 'USD',
         description = 'Smash burgers, wood-fired pizza, grilled mains and all-day brunch — a neighbourhood kitchen, demo menu.'
   where id = v_rest;

  -- ---------------- Starters ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Starters', 1) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, discount_price, is_featured, display_order, allergens, dietary, calories) values
    (v_rest, v_cat, 'Buffalo Wings (6 pcs)', 'Tossed in smoky buffalo sauce with a cool ranch dip.', 8.50, null, false, 1, '{milk,celery}', '{}', 640),
    (v_rest, v_cat, 'Loaded Nachos', 'Cheese sauce, jalapeños, salsa and sour cream over warm tortilla chips.', 9.75, 8.50, false, 2, '{milk,gluten}', '{vegetarian}', 820),
    (v_rest, v_cat, 'Crispy Mozzarella Sticks', 'Golden-fried with a herbed crumb and marinara dip.', 7.95, null, false, 3, '{gluten,milk,eggs}', '{vegetarian}', 480);

  -- ---------------- Burgers & Sandwiches ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Burgers & Sandwiches', 2) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, is_featured, display_order, allergens, dietary, calories)
  values (v_rest, v_cat, 'Classic Smash Burger', 'Smashed beef patty, American cheese, pickles and house sauce in a toasted brioche bun.', 12.50, true, 1, '{gluten,milk,eggs,sesame,mustard}', '{}', 780)
  returning id into v_item;
  insert into public.item_option_groups (restaurant_id, menu_item_id, name, selection_type, is_required, display_order)
  values (v_rest, v_item, 'Patty', 'single', true, 1) returning id into v_group;
  insert into public.item_options (restaurant_id, group_id, name, price_delta, display_order) values
    (v_rest, v_group, 'Single', 0, 1),
    (v_rest, v_group, 'Double', 3.50, 2);
  insert into public.item_option_groups (restaurant_id, menu_item_id, name, selection_type, is_required, display_order)
  values (v_rest, v_item, 'Extras', 'multi', false, 2) returning id into v_group;
  insert into public.item_options (restaurant_id, group_id, name, price_delta, display_order) values
    (v_rest, v_group, 'Extra Cheese', 1.50, 1),
    (v_rest, v_group, 'Beef Bacon', 2.00, 2),
    (v_rest, v_group, 'Jalapeños', 0.75, 3),
    (v_rest, v_group, 'Caramelised Onions', 1.00, 4);
  insert into public.menu_items (restaurant_id, category_id, name, description, price, discount_price, is_featured, display_order, allergens, dietary, calories) values
    (v_rest, v_cat, 'BBQ Bacon Burger', 'Beef bacon, cheddar, crispy onions and smoky BBQ sauce.', 14.95, null, false, 2, '{gluten,milk,eggs,mustard}', '{}', 890),
    (v_rest, v_cat, 'Grilled Chicken Sandwich', 'Char-grilled chicken breast, garlic aioli and crunchy slaw.', 11.75, null, false, 3, '{gluten,eggs,mustard}', '{}', 620),
    (v_rest, v_cat, 'Club Sandwich', 'Triple-stacked chicken, egg, cheese and salad — the classic.', 10.95, null, false, 4, '{gluten,eggs,milk}', '{}', 700);

  -- ---------------- Grill & Mains ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Grill & Mains', 3) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, is_featured, display_order, allergens, dietary, calories)
  values (v_rest, v_cat, 'Grilled Ribeye Steak', '28-day aged ribeye with garlic butter and skin-on fries.', 24.00, true, 1, '{milk}', '{gluten_free}', 850)
  returning id into v_item;
  insert into public.item_option_groups (restaurant_id, menu_item_id, name, selection_type, is_required, display_order)
  values (v_rest, v_item, 'Doneness', 'single', true, 1) returning id into v_group;
  insert into public.item_options (restaurant_id, group_id, name, price_delta, display_order) values
    (v_rest, v_group, 'Rare', 0, 1),
    (v_rest, v_group, 'Medium Rare', 0, 2),
    (v_rest, v_group, 'Medium', 0, 3),
    (v_rest, v_group, 'Well Done', 0, 4);
  insert into public.menu_items (restaurant_id, category_id, name, description, price, discount_price, is_available, is_featured, display_order, allergens, dietary, calories) values
    (v_rest, v_cat, 'BBQ Beef Ribs', 'Slow-smoked ribs glazed in house BBQ sauce.', 21.50, null, true, false, 2, '{celery,mustard}', '{gluten_free}', 1100),
    (v_rest, v_cat, 'Herb Grilled Salmon', 'With lemon butter, seasonal greens and crushed potatoes.', 19.95, null, true, false, 3, '{fish,milk}', '{gluten_free}', 560),
    (v_rest, v_cat, 'Peri Peri Chicken', 'Flame-grilled half chicken in peri peri marinade.', 16.50, null, false, false, 4, '{mustard}', '{gluten_free}', 720);

  -- ---------------- Pizza & Pasta ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Pizza & Pasta', 4) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, discount_price, is_featured, display_order, allergens, dietary, calories) values
    (v_rest, v_cat, 'Margherita Pizza', 'San Marzano tomato, fior di latte mozzarella and fresh basil.', 13.00, 10.95, true, 1, '{gluten,milk}', '{vegetarian}', 850),
    (v_rest, v_cat, 'Pepperoni Pizza', 'Double pepperoni and mozzarella on a wood-fired base.', 15.50, null, false, 2, '{gluten,milk}', '{}', 980),
    (v_rest, v_cat, 'Alfredo Pasta', 'Creamy parmesan alfredo with grilled mushrooms.', 14.25, null, false, 3, '{gluten,milk,eggs}', '{vegetarian}', 890),
    (v_rest, v_cat, 'Spaghetti Bolognese', 'Slow beef ragù, parmesan and torn basil.', 14.95, null, false, 4, '{gluten,celery}', '{}', 760);

  -- ---------------- Breakfast & Brunch ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Breakfast & Brunch', 5) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, discount_price, display_order, allergens, dietary, calories) values
    (v_rest, v_cat, 'Buttermilk Pancakes', 'Stack of three with maple syrup and berries.', 9.50, null, 1, '{gluten,milk,eggs}', '{vegetarian}', 640),
    (v_rest, v_cat, 'Full English Breakfast', 'Eggs any style, beef sausage, beans, mushrooms, grilled tomato and toast.', 13.95, null, 2, '{gluten,eggs,milk}', '{}', 950),
    (v_rest, v_cat, 'Avocado Toast', 'Sourdough, smashed avocado, chilli flakes and seeds.', 8.95, null, 3, '{gluten,sesame}', '{vegan}', 420);

  -- ---------------- Desserts ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Desserts', 6) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, discount_price, display_order, allergens, dietary, calories) values
    (v_rest, v_cat, 'New York Cheesecake', 'Baked vanilla cheesecake with a berry compote.', 7.50, null, 1, '{gluten,milk,eggs}', '{vegetarian}', 520),
    (v_rest, v_cat, 'Chocolate Brownie Sundae', 'Warm brownie, vanilla ice cream and chocolate sauce.', 8.25, null, 2, '{gluten,milk,eggs,soy}', '{vegetarian}', 610),
    (v_rest, v_cat, 'Tiramisu', 'Espresso-soaked layers with mascarpone cream.', 7.95, null, 3, '{gluten,milk,eggs}', '{vegetarian}', 480);

  -- ---------------- Drinks ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Drinks', 7) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, discount_price, display_order, allergens, dietary, calories) values
    (v_rest, v_cat, 'Virgin Mint Mojito', 'Fresh mint, lime and soda over crushed ice.', 5.50, null, 1, '{}', '{vegan,gluten_free}', 120),
    (v_rest, v_cat, 'Iced Caramel Latte', 'Double espresso, cold milk and caramel over ice.', 5.95, null, 2, '{milk}', '{vegetarian}', 210),
    (v_rest, v_cat, 'Fresh Orange Juice', 'Squeezed to order, nothing added.', 4.95, null, 3, '{}', '{vegan,gluten_free}', 110);

  -- ---------------- Upsell pairings ----------------
  update public.menu_items mi set suggested_item_ids = coalesce((
    select array_agg(x.id) from public.menu_items x
    where x.restaurant_id = mi.restaurant_id and x.name in ('Loaded Nachos', 'Virgin Mint Mojito')
  ), '{}') where mi.restaurant_id = v_rest and mi.name = 'Classic Smash Burger';

  update public.menu_items mi set suggested_item_ids = coalesce((
    select array_agg(x.id) from public.menu_items x
    where x.restaurant_id = mi.restaurant_id and x.name in ('Crispy Mozzarella Sticks', 'Fresh Orange Juice')
  ), '{}') where mi.restaurant_id = v_rest and mi.name = 'Margherita Pizza';

  update public.menu_items mi set suggested_item_ids = coalesce((
    select array_agg(x.id) from public.menu_items x
    where x.restaurant_id = mi.restaurant_id and x.name in ('Buffalo Wings (6 pcs)')
  ), '{}') where mi.restaurant_id = v_rest and mi.name = 'Grilled Ribeye Steak';
end $$;

-- Verification: expect 24 items, 7 categories, currency USD.
select (select count(*) from public.menu_items where restaurant_id = (select id from public.restaurants where slug = 'spice-route')) as items,
       (select count(*) from public.categories where restaurant_id = (select id from public.restaurants where slug = 'spice-route')) as categories,
       (select currency from public.restaurants where slug = 'spice-route') as currency;
