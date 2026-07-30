-- Reference data: the preset business categories and the built-in excluded
-- domains.
--
-- Written to be re-runnable. Every insert is ON CONFLICT DO UPDATE on the
-- natural key, and neither statement touches the `enabled` column on an
-- existing row — so re-applying this migration refreshes labels and
-- classifications without silently re-enabling something a user turned off.
--
-- The excluded-domain list is mirrored in
-- src/data/excluded-domains.catalog.ts, which is what the pure verification
-- code uses. Keep the two in sync when you add an entry.

-- ---------------------------------------------------------------------------
-- Preset business categories
-- ---------------------------------------------------------------------------

INSERT INTO public.business_categories (slug, label, sort_order, is_preset) VALUES
  ('auto_repair',    'Auto repair',            10,  true),
  ('restaurants',    'Restaurants',            20,  true),
  ('contractors',    'Contractors',            30,  true),
  ('plumbers',       'Plumbers',               40,  true),
  ('hvac',           'HVAC companies',         50,  true),
  ('electricians',   'Electricians',           60,  true),
  ('hair_salons',    'Hair salons',            70,  true),
  ('barbers',        'Barbers',                80,  true),
  ('retail',         'Retail stores',          90,  true),
  ('cleaning',       'Cleaning services',      100, true),
  ('landscaping',    'Landscaping companies',  110, true),
  ('dentists',       'Dentists',               120, true),
  ('real_estate',    'Real estate agents',     130, true),
  ('photographers',  'Photographers',          140, true),
  ('bakeries',       'Bakeries',               150, true),
  ('craft',          'Craft businesses',       160, true),
  ('home_services',  'Home services',          170, true),
  ('other',          'Other',                  999, true)
ON CONFLICT (slug) DO UPDATE
  SET label      = EXCLUDED.label,
      sort_order = EXCLUDED.sort_order,
      is_preset  = true;

-- ---------------------------------------------------------------------------
-- Built-in excluded domains
--
-- None of these count as a business having its own website. A Facebook page is
-- the thing we are looking FOR, so facebook.com is classified rather than
-- merely blocked — the verification code needs to tell "this is their Facebook
-- page" apart from "this is some other social profile".
-- ---------------------------------------------------------------------------

INSERT INTO public.excluded_domains (domain, kind, is_builtin, note) VALUES
  -- Facebook itself
  ('facebook.com',        'facebook',        true, 'The page we are looking for, not a website'),
  ('fb.com',              'facebook',        true, 'Facebook short domain'),
  ('fb.me',               'facebook',        true, 'Facebook short link'),
  ('facebook.net',        'facebook',        true, 'Facebook infrastructure domain'),

  -- Other social profiles
  ('instagram.com',       'other_social',    true, 'Social profile'),
  ('linkedin.com',        'other_social',    true, 'Social profile'),
  ('tiktok.com',          'other_social',    true, 'Social profile'),
  ('x.com',               'other_social',    true, 'Social profile'),
  ('twitter.com',         'other_social',    true, 'Social profile'),
  ('pinterest.com',       'other_social',    true, 'Social profile'),
  ('youtube.com',         'other_social',    true, 'Social profile'),
  ('nextdoor.com',        'other_social',    true, 'Neighbourhood social network'),
  ('snapchat.com',        'other_social',    true, 'Social profile'),

  -- Directories and review sites
  ('yelp.com',            'directory',       true, 'Review directory'),
  ('yellowpages.com',     'directory',       true, 'Business directory'),
  ('yp.com',              'directory',       true, 'Business directory'),
  ('mapquest.com',        'directory',       true, 'Map directory'),
  ('bbb.org',             'directory',       true, 'Better Business Bureau listing'),
  ('angi.com',            'directory',       true, 'Home services directory'),
  ('angieslist.com',      'directory',       true, 'Home services directory'),
  ('homeadvisor.com',     'directory',       true, 'Home services directory'),
  ('thumbtack.com',       'directory',       true, 'Home services directory'),
  ('manta.com',           'directory',       true, 'Business directory'),
  ('chamberofcommerce.com','directory',      true, 'Chamber of Commerce directory'),
  ('superpages.com',      'directory',       true, 'Business directory'),
  ('citysearch.com',      'directory',       true, 'Business directory'),
  ('foursquare.com',      'directory',       true, 'Location directory'),
  ('tripadvisor.com',     'directory',       true, 'Review directory'),
  ('opentable.com',       'directory',       true, 'Restaurant booking directory'),
  ('alignable.com',       'directory',       true, 'Small business network'),
  ('birdeye.com',         'directory',       true, 'Reputation directory'),
  ('merchantcircle.com',  'directory',       true, 'Business directory'),

  -- Google Business Profile surfaces. These are a Google-hosted listing or
  -- micro-site, not an independent website — though a user can opt to count
  -- them via the marketplace/Google rules in Settings.
  ('business.site',       'google_business', true, 'Google Business Profile site'),
  ('g.page',             'google_business', true, 'Google Business Profile short link'),
  ('sites.google.com',    'google_business', true, 'Google Sites page'),

  -- Marketplace storefronts. Off-by-default as "not a website": a business
  -- selling through Etsy or Square still has no site of its own.
  ('square.site',         'marketplace',     true, 'Square storefront'),
  ('etsy.com',            'marketplace',     true, 'Etsy shop'),
  ('ecwid.com',           'marketplace',     true, 'Hosted storefront'),
  ('bigcartel.com',       'marketplace',     true, 'Hosted storefront'),
  ('storenvy.com',        'marketplace',     true, 'Hosted storefront'),
  ('ebay.com',            'marketplace',     true, 'Marketplace storefront'),
  ('amazon.com',          'marketplace',     true, 'Marketplace storefront'),
  ('linktr.ee',           'marketplace',     true, 'Link-in-bio page, not a website'),
  ('shopmy.us',           'marketplace',     true, 'Link-in-bio storefront'),
  ('beacons.ai',          'marketplace',     true, 'Link-in-bio page'),

  -- Booking and ordering platforms a business is a tenant of
  ('doordash.com',        'marketplace',     true, 'Ordering platform listing'),
  ('grubhub.com',         'marketplace',     true, 'Ordering platform listing'),
  ('ubereats.com',        'marketplace',     true, 'Ordering platform listing'),
  ('booksy.com',          'marketplace',     true, 'Booking platform listing'),
  ('vagaro.com',          'marketplace',     true, 'Booking platform listing'),
  ('styleseat.com',       'marketplace',     true, 'Booking platform listing')
ON CONFLICT (domain) DO UPDATE
  SET kind       = EXCLUDED.kind,
      is_builtin = true,
      note       = EXCLUDED.note;

NOTIFY pgrst, 'reload schema';
