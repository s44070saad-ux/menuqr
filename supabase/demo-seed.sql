-- =====================================================================
-- Velora — fictional demo restaurant "Spice Route" (slug: spice-route)
-- Run in the SQL Editor on the LIVE menuqr project only.
-- Creates a complete, realistic demo tenant exactly as if a restaurant
-- owner had built it in the dashboard: published menu, 7 categories,
-- 24 items, variations & add-ons, midnight theme, Business plan.
-- Owner: the platform account saadxj8@gmail.com (looked up by email).
-- Images live in the public storage bucket under demo/ (uploaded
-- separately); their public URLs are deterministic and used below.
-- Safe to re-run: it deletes any previous spice-route restaurant first.
-- =====================================================================

do $$
declare
  v_owner uuid;
  v_rest  uuid;
  v_plan  uuid;
  v_cat   uuid;
  v_item  uuid;
  v_group uuid;
  img text := 'https://owrbvnjptzbbufghoilt.supabase.co/storage/v1/object/public/menu-images/demo/';
begin
  select id into v_owner from public.profiles where email = 'saadxj8@gmail.com';
  if v_owner is null then
    raise exception 'Demo owner profile (saadxj8@gmail.com) not found';
  end if;

  delete from public.restaurants where slug = 'spice-route';

  insert into public.restaurants
    (owner_id, name, slug, description, logo_url, cover_url, address,
     phone, whatsapp, opening_hours, currency, default_language,
     theme, accent_color, status, is_published)
  values
    (v_owner, 'Spice Route', 'spice-route',
     'Charcoal BBQ, desi karahi and dum biryani — family recipes from Lahore, made fresh to order.',
     img || 'logo.png', img || 'cover.jpg',
     '14-B Main Boulevard, Gulberg III, Lahore',
     '0300 1234567', '0300 1234567',
     'Open daily · 12:00 PM – 12:00 AM',
     'PKR', 'en', 'dark', '#C2410C', 'published', true)
  returning id into v_rest;
  -- The creation trigger has added: owner membership, settings row,
  -- main QR code and a 3-day Pro trial subscription.

  update public.restaurant_settings
     set menu_theme  = 'midnight',
         qr_color    = '#C2410C',
         card_style  = 'accent',
         footer_text = 'Thank you for dining with us — see you again soon!'
   where restaurant_id = v_rest;

  select id into v_plan from public.subscription_plans where slug = 'business';
  update public.subscriptions
     set plan_id = v_plan, status = 'active', starts_at = now(), ends_at = null
   where restaurant_id = v_rest;

  -- ---------------- Starters ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Starters', 1) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, discount_price, is_featured, display_order) values
    (v_rest, v_cat, 'Chicken Wings (6 pcs)', 'Charcoal-kissed wings tossed in our smoky house sauce.', 450, null, false, 1),
    (v_rest, v_cat, 'Loaded Fries', 'Fries loaded with cheese sauce, chicken chunks and jalapeños.', 550, 449, false, 2),
    (v_rest, v_cat, 'Spring Rolls (4 pcs)', 'Crispy rolls stuffed with spiced vegetables and chicken.', 380, null, false, 3);

  -- ---------------- BBQ & Grill ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'BBQ & Grill', 2) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, discount_price, image_url, is_featured, display_order) values
    (v_rest, v_cat, 'Chicken Tikka (Leg Quarter)', 'Overnight-marinated, grilled over charcoal the desi way.', 480, null, null, false, 1),
    (v_rest, v_cat, 'Chicken Malai Boti (8 pcs)', 'Creamy, melt-in-the-mouth boti with a gentle char.', 850, null, img || 'malai-boti.jpg', true, 2),
    (v_rest, v_cat, 'Beef Seekh Kabab (4 pcs)', 'Hand-minced beef, green chillies and fresh coriander.', 780, null, null, false, 3),
    (v_rest, v_cat, 'Spice Route BBQ Platter', 'Tikka, malai boti, seekh kabab and wings — serves 3–4, with naan and raita.', 2850, 2499, img || 'bbq-platter.jpg', true, 4);

  -- ---------------- Karahi & Handi ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Karahi & Handi', 3) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, image_url, display_order)
  values (v_rest, v_cat, 'Chicken Karahi', 'Wok-tossed with tomatoes, desi ghee, ginger and green chillies.', 1450, img || 'chicken-karahi.jpg', 1)
  returning id into v_item;
  insert into public.item_option_groups (restaurant_id, menu_item_id, name, selection_type, is_required, display_order)
  values (v_rest, v_item, 'Size', 'single', true, 1) returning id into v_group;
  insert into public.item_options (restaurant_id, group_id, name, price_delta, display_order) values
    (v_rest, v_group, 'Half (serves 2–3)', 0, 1),
    (v_rest, v_group, 'Full (serves 4–5)', 1150, 2);
  insert into public.menu_items (restaurant_id, category_id, name, description, price, is_available, display_order) values
    (v_rest, v_cat, 'Chicken White Karahi', 'Creamy white karahi with black pepper and green chillies.', 1550, true, 2),
    (v_rest, v_cat, 'Mutton Handi', 'Slow-cooked mutton in a rich, buttery handi gravy.', 2150, false, 3),
    (v_rest, v_cat, 'Daal Mash Fry', 'White daal fried with butter, garlic and whole red chillies.', 620, true, 4);

  -- ---------------- Biryani & Rice ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Biryani & Rice', 4) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, image_url, is_featured, display_order)
  values (v_rest, v_cat, 'Chicken Dum Biryani', 'Layered dum biryani with aloo bukhara and fresh mint — served with raita.', 430, img || 'dum-biryani.jpg', true, 1)
  returning id into v_item;
  insert into public.item_option_groups (restaurant_id, menu_item_id, name, selection_type, is_required, display_order)
  values (v_rest, v_item, 'Extras', 'multi', false, 1) returning id into v_group;
  insert into public.item_options (restaurant_id, group_id, name, price_delta, display_order) values
    (v_rest, v_group, 'Extra Raita', 40, 1),
    (v_rest, v_group, 'Green Salad', 60, 2),
    (v_rest, v_group, 'Extra Chicken Piece', 180, 3);
  insert into public.menu_items (restaurant_id, category_id, name, description, price, display_order) values
    (v_rest, v_cat, 'Beef Pulao', 'Yakhni pulao with tender beef and whole spices.', 520, 2),
    (v_rest, v_cat, 'Vegetable Fried Rice', 'Smoky wok rice with seasonal vegetables and egg.', 480, 3);

  -- ---------------- Breads ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Breads', 5) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, display_order) values
    (v_rest, v_cat, 'Roghni Naan', 'Sesame-topped, brushed with butter.', 120, 1),
    (v_rest, v_cat, 'Garlic Naan', 'Garlic and coriander, straight from the tandoor.', 150, 2),
    (v_rest, v_cat, 'Tandoori Roti', 'Whole wheat, puffed fresh for every order.', 40, 3);

  -- ---------------- Desserts ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Desserts', 6) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, display_order) values
    (v_rest, v_cat, 'Gulab Jamun (4 pcs)', 'Warm jamun in rose-cardamom syrup.', 300, 1),
    (v_rest, v_cat, 'Kulfa Falooda', 'Traditional kulfa over falooda with basil seeds and rabri.', 450, 2);

  -- ---------------- Drinks ----------------
  insert into public.categories (restaurant_id, name, display_order)
  values (v_rest, 'Drinks', 7) returning id into v_cat;
  insert into public.menu_items (restaurant_id, category_id, name, description, price, display_order) values
    (v_rest, v_cat, 'Mint Margarita', 'Fresh mint, lemon and soda over crushed ice.', 250, 1),
    (v_rest, v_cat, 'Fresh Lime Soda', 'Sweet, salted or mixed — your call.', 180, 2),
    (v_rest, v_cat, 'Soft Drink (Can)', 'Coke, Pepsi, Sprite or Pakola — chilled.', 100, 3),
    (v_rest, v_cat, 'Mineral Water (1.5 L)', null, 150, 4),
    (v_rest, v_cat, 'Kashmiri Chai', 'Pink tea with crushed almonds and pistachio.', 300, 5);

  -- ------------- Phase 1.1: allergens / dietary / calories -------------
  update public.menu_items set allergens = '{milk}', dietary = '{halal}', calories = 640 where restaurant_id = v_rest and name = 'Chicken Wings (6 pcs)';
  update public.menu_items set allergens = '{gluten,milk,eggs}', dietary = '{}', calories = 780 where restaurant_id = v_rest and name = 'Loaded Fries';
  update public.menu_items set allergens = '{gluten,eggs,soy}', dietary = '{}', calories = 420 where restaurant_id = v_rest and name = 'Spring Rolls (4 pcs)';
  update public.menu_items set allergens = '{milk}', dietary = '{halal,gluten_free}', calories = 540 where restaurant_id = v_rest and name = 'Chicken Tikka (Leg Quarter)';
  update public.menu_items set allergens = '{milk}', dietary = '{halal,gluten_free}', calories = 520 where restaurant_id = v_rest and name = 'Chicken Malai Boti (8 pcs)';
  update public.menu_items set allergens = '{}', dietary = '{halal,gluten_free}', calories = 610 where restaurant_id = v_rest and name = 'Beef Seekh Kabab (4 pcs)';
  update public.menu_items set allergens = '{gluten,milk,mustard}', dietary = '{halal}', calories = 1450 where restaurant_id = v_rest and name = 'Spice Route BBQ Platter';
  update public.menu_items set allergens = '{milk}', dietary = '{halal,gluten_free}', calories = 980 where restaurant_id = v_rest and name = 'Chicken Karahi';
  update public.menu_items set allergens = '{milk}', dietary = '{halal,gluten_free}', calories = 1050 where restaurant_id = v_rest and name = 'Chicken White Karahi';
  update public.menu_items set allergens = '{milk}', dietary = '{halal,gluten_free}', calories = 1180 where restaurant_id = v_rest and name = 'Mutton Handi';
  update public.menu_items set allergens = '{milk}', dietary = '{vegetarian,halal,gluten_free}', calories = 560 where restaurant_id = v_rest and name = 'Daal Mash Fry';
  update public.menu_items set allergens = '{milk,eggs,sulphites}', dietary = '{halal}', calories = 720 where restaurant_id = v_rest and name = 'Chicken Dum Biryani';
  update public.menu_items set allergens = '{}', dietary = '{halal,gluten_free}', calories = 690 where restaurant_id = v_rest and name = 'Beef Pulao';
  update public.menu_items set allergens = '{eggs,soy}', dietary = '{}', calories = 480 where restaurant_id = v_rest and name = 'Vegetable Fried Rice';
  update public.menu_items set allergens = '{gluten,milk,sesame}', dietary = '{vegetarian,halal}', calories = 310 where restaurant_id = v_rest and name = 'Roghni Naan';
  update public.menu_items set allergens = '{gluten,milk}', dietary = '{vegetarian,halal}', calories = 290 where restaurant_id = v_rest and name = 'Garlic Naan';
  update public.menu_items set allergens = '{gluten}', dietary = '{vegetarian,halal,vegan}', calories = 240 where restaurant_id = v_rest and name = 'Tandoori Roti';
  update public.menu_items set allergens = '{milk}', dietary = '{vegetarian,halal}', calories = 380 where restaurant_id = v_rest and name = 'Gulab Jamun (4 pcs)';
  update public.menu_items set allergens = '{milk,nuts}', dietary = '{vegetarian,halal}', calories = 520 where restaurant_id = v_rest and name = 'Kulfa Falooda';
  update public.menu_items set allergens = '{}', dietary = '{vegan,vegetarian,halal,gluten_free}', calories = 120 where restaurant_id = v_rest and name = 'Mint Margarita';
  update public.menu_items set allergens = '{}', dietary = '{vegan,vegetarian,halal,gluten_free}', calories = 45 where restaurant_id = v_rest and name = 'Fresh Lime Soda';
  update public.menu_items set allergens = '{}', dietary = '{vegan,vegetarian,halal,gluten_free}', calories = 140 where restaurant_id = v_rest and name = 'Soft Drink (Can)';
  update public.menu_items set allergens = '{}', dietary = '{vegan,vegetarian,halal,gluten_free}', calories = 0 where restaurant_id = v_rest and name = 'Mineral Water (1.5 L)';
  update public.menu_items set allergens = '{milk,nuts}', dietary = '{vegetarian,halal,gluten_free}', calories = 260 where restaurant_id = v_rest and name = 'Kashmiri Chai';

  raise notice 'Spice Route demo created: restaurant %', v_rest;
end $$;

-- Verification (run after the block):
-- select name, slug, status, is_published from public.restaurants where slug = 'spice-route';
-- select (select count(*) from public.categories where restaurant_id = r.id) as categories,
--        (select count(*) from public.menu_items where restaurant_id = r.id) as items
-- from public.restaurants r where slug = 'spice-route';  -- expect 7 categories, 24 items
